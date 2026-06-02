"""akash_train — minimal helper for publishing training results back to GitHub.

Designed to be called at the end of a training script running inside an
AkashTrainer-launched container. AkashTrainer sets these env vars in the
container before launch:

    REPO_URL              https://github.com/user/repo
    REPO_BRANCH           branch the training was started from
    GITHUB_TOKEN          token with `repo` scope
    OUTPUT_BRANCH_PREFIX  e.g. "trained-output/sweep-xyz/run-3"

`publish_results()` writes a `results.json` (and optionally copies a model
file) into an output directory, then `git push`es the directory to a new
branch on REPO_URL. AkashTrainer's monitor reads the results.json off
that branch and populates the leaderboard.

Typical usage at the end of your training script:

    from akash_train import publish_results

    publish_results(
        metrics={
            "val_accuracy": float(history.history["val_accuracy"][-1]),
            "val_loss": float(history.history["val_loss"][-1]),
            "val_acc_curve": [float(x) for x in history.history["val_accuracy"]],
        },
        model_path="models/model.keras",  # optional
        hyperparams={"lr": args.lr, "batch_size": args.batch_size},  # optional
    )

You can run the script locally without AkashTrainer — publish_results
detects missing env vars and silently no-ops (returns False).
"""

from __future__ import annotations

import datetime
import json
import os
import shutil
import subprocess
import sys
from typing import Any, Dict, Iterable, Optional

__version__ = "0.1.0"
__all__ = ["publish_results", "PublishResult"]


class PublishResult:
    """Return value from publish_results — tells caller what happened."""

    def __init__(
        self,
        published: bool,
        reason: Optional[str] = None,
        branch: Optional[str] = None,
        branch_url: Optional[str] = None,
        output_dir: Optional[str] = None,
    ) -> None:
        self.published = published
        self.reason = reason
        self.branch = branch
        self.branch_url = branch_url
        self.output_dir = output_dir

    def __bool__(self) -> bool:
        return self.published

    def __repr__(self) -> str:
        if self.published:
            return f"PublishResult(branch_url={self.branch_url!r})"
        return f"PublishResult(published=False, reason={self.reason!r})"


def _run(cmd: list[str], cwd: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd, cwd=cwd, check=check, capture_output=True, text=True
    )


def publish_results(
    metrics: Optional[Dict[str, Any]] = None,
    model_path: Optional[str] = None,
    output_dir: str = "/output",
    hyperparams: Optional[Dict[str, Any]] = None,
    extra_files: Optional[Iterable[str]] = None,
    success: bool = True,
    extra_commit_lines: Optional[Iterable[str]] = None,
    verbose: bool = True,
) -> PublishResult:
    """Write results.json + copy artifacts into output_dir, then git push to GitHub.

    Args:
        metrics: dict of metric_name -> number (or list of numbers for curves).
            AkashTrainer treats scalar values as sortable leaderboard columns
            and number-arrays as overlaid training curves.
        model_path: optional path to a trained model file; copied into output_dir.
        output_dir: where to stage files before pushing. Defaults to "/output"
            (the AkashTrainer convention). Override for local testing.
        hyperparams: optional dict echoing the hyperparameters used (drives
            the parallel-coordinates plot on the sweep results page).
        extra_files: iterable of additional file paths to include in the push.
        success: whether to mark the commit message as success (🦞) or failure (❌).
        extra_commit_lines: additional lines appended to the commit message body.
        verbose: print status to stdout.

    Returns:
        PublishResult — truthy if pushed, falsy with a reason if skipped.

    Skips silently (no exception) if REPO_URL or GITHUB_TOKEN env vars are
    missing — so calling this from a local test run doesn't crash.
    """

    def log(msg: str) -> None:
        if verbose:
            print(f"[akash_train] {msg}", flush=True)

    repo_url = os.environ.get("REPO_URL", "").strip()
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    prefix = os.environ.get("OUTPUT_BRANCH_PREFIX", "trained-output/").rstrip("/")

    os.makedirs(output_dir, exist_ok=True)

    # Write results.json
    payload: Dict[str, Any] = {
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "success": bool(success),
    }
    if metrics:
        payload.update(_normalize_metrics(metrics))
    if hyperparams:
        payload["hyperparams"] = _jsonable(hyperparams)

    results_path = os.path.join(output_dir, "results.json")
    with open(results_path, "w") as f:
        json.dump(payload, f, indent=2, default=_jsonable)
    log(f"wrote {results_path}")

    # Copy model + extras
    if model_path and os.path.exists(model_path):
        dest = os.path.join(output_dir, os.path.basename(model_path))
        try:
            shutil.copy2(model_path, dest)
            log(f"copied {model_path} → {dest}")
        except (OSError, shutil.SameFileError) as e:
            log(f"WARN could not copy model: {e}")

    for extra in (extra_files or []):
        if not os.path.exists(extra):
            continue
        dest = os.path.join(output_dir, os.path.basename(extra))
        try:
            if os.path.isdir(extra):
                shutil.copytree(extra, dest, dirs_exist_ok=True)
            else:
                shutil.copy2(extra, dest)
            log(f"copied {extra} → {dest}")
        except (OSError, shutil.SameFileError) as e:
            log(f"WARN could not copy {extra}: {e}")

    # If we can't push, return now (local test path)
    if not repo_url or not token:
        reason = "REPO_URL and/or GITHUB_TOKEN not set — skipping git push (local test path)"
        log(reason)
        return PublishResult(published=False, reason=reason, output_dir=output_dir)

    ts = datetime.datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    branch = f"{prefix}/{ts}"

    auth_url = repo_url.replace("https://", "")
    push_url = f"https://x-access-token:{token}@{auth_url}"

    marker = "🦞 Training output" if success else "❌ Training failed"
    status = "SUCCESS" if success else "FAILED"
    cmd_line = " ".join(sys.argv)
    commit_lines = [
        f"{marker} — {datetime.datetime.utcnow().isoformat()}Z",
        "",
        f"Command: {cmd_line}",
        f"STATUS: {status}",
    ]
    if extra_commit_lines:
        commit_lines.extend(extra_commit_lines)
    commit_msg = "\n".join(commit_lines)

    try:
        _run(["git", "init", "-q"], cwd=output_dir)
        _run(["git", "checkout", "-q", "-b", branch], cwd=output_dir)
        _run(["git", "add", "-A"], cwd=output_dir)
        _run([
            "git",
            "-c", "user.email=akash@trainer.local",
            "-c", "user.name=AkashTrainer",
            "commit", "-q", "-m", commit_msg,
        ], cwd=output_dir)
        _run(["git", "push", "-q", push_url, branch], cwd=output_dir)
    except subprocess.CalledProcessError as e:
        reason = f"git push failed: {e.stderr.strip() or e}"
        log(reason)
        return PublishResult(published=False, reason=reason, output_dir=output_dir, branch=branch)

    branch_url = f"{repo_url.rstrip('/').replace('.git', '')}/tree/{branch}"
    log(f"✅ pushed {branch_url}")
    return PublishResult(
        published=True, branch=branch, branch_url=branch_url, output_dir=output_dir,
    )


def _normalize_metrics(metrics: Dict[str, Any]) -> Dict[str, Any]:
    """Coerce metric values to plain JSON-friendly numbers / lists.

    Catches numpy scalars, torch tensors (via .item()), etc.
    """
    out: Dict[str, Any] = {}
    for k, v in metrics.items():
        out[k] = _jsonable(v)
    return out


def _jsonable(v: Any) -> Any:
    # Try torch tensor → python
    if hasattr(v, "item") and callable(getattr(v, "item")):
        try:
            return v.item()
        except Exception:
            pass
    # numpy / tensorflow scalars
    if hasattr(v, "tolist") and callable(getattr(v, "tolist")):
        try:
            return v.tolist()
        except Exception:
            pass
    if isinstance(v, (list, tuple)):
        return [_jsonable(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _jsonable(x) for k, x in v.items()}
    if isinstance(v, (str, int, float, bool)) or v is None:
        return v
    return str(v)
