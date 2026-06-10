"""
Migrate the legacy stroke data to the compact v2 JSONL format.

  legacy : data/raw/<contributor>/<file>.json
           {"modifiers": [{"type": <label>, "stroke": [{"x","y","p"}, ...]}, ...]}

  v2     : <out>/<contributor>.jsonl   (one record per line)
           {"label": <label>, "stroke": [[x,y,p], ...], "contributor": <name>}

Points become compact [x, y, p] arrays (~3x smaller). Pressure is preserved when
present. Originals are left untouched.

    python convert_data.py --src ../data/raw --out ../data/raw_jsonl
"""

from __future__ import annotations

import argparse
import glob
import json
import os

from data import CLASS_TO_IDX


def _point(p) -> list[float] | None:
    if isinstance(p, dict):
        x, y, pr = p.get("x"), p.get("y"), p.get("p", 0)
    elif isinstance(p, (list, tuple)) and len(p) >= 2:
        x, y, pr = p[0], p[1], (p[2] if len(p) > 2 else 0)
    else:
        return None
    if x is None or y is None:
        return None
    return [round(float(x), 2), round(float(y), 2), round(float(pr or 0), 3)]


def convert(src: str, out: str) -> None:
    os.makedirs(out, exist_ok=True)
    files = sorted(glob.glob(os.path.join(src, "**", "*.json"), recursive=True))
    per_contributor: dict[str, list[str]] = {}
    total = skipped = 0

    for path in files:
        contributor = os.path.basename(os.path.dirname(path)) or "unknown"
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue
        mods = data.get("modifiers", []) if isinstance(data, dict) else data
        for m in mods:
            if not isinstance(m, dict):
                continue
            label = m.get("type") or m.get("label")
            if label not in CLASS_TO_IDX:
                skipped += 1
                continue
            pts = [q for q in (_point(p) for p in m.get("stroke", [])) if q]
            if len(pts) < 2:
                skipped += 1
                continue
            rec = {"label": label, "stroke": pts, "contributor": contributor}
            per_contributor.setdefault(contributor, []).append(json.dumps(rec, separators=(",", ":")))
            total += 1

    for contributor, lines in per_contributor.items():
        with open(os.path.join(out, f"{contributor}.jsonl"), "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

    print(f"[convert] wrote {total} records ({skipped} skipped) "
          f"across {len(per_contributor)} contributors -> {out}")


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="Convert legacy stroke JSON to v2 JSONL")
    ap.add_argument("--src", default=os.path.join(here, "..", "data", "raw"))
    ap.add_argument("--out", default=os.path.join(here, "..", "data", "raw_jsonl"))
    args = ap.parse_args()
    convert(args.src, args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
