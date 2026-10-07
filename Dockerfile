# OnePen trainer — AkashTrainer GPU-sweep job image.
# TF + a matching CUDA build come from the nvcr base; the framework is NOT
# reinstalled. nvcr is self-contained (bundles CUDA + forward-compat), so it
# actually loads the GPU on Akash providers.
FROM nvcr.io/nvidia/tensorflow:25.02-tf2-py3

WORKDIR /workspace/project

# git CLI — akash_train.publish_results() pushes results back over git.
RUN apt-get update && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

# Project-only deps (TF + numpy already ship in the base image).
RUN pip install --no-cache-dir scikit-learn pillow

# Whole repo so akash_train.py (at the repo root) is importable.
COPY . .
RUN mkdir -p /output

# oneDNN off: LayerNorm -> CPU-only _MklLayerNorm crashes on GPU.
# XLA auto-JIT off: deadlocks on H100 around epoch 2 with PTX the driver only
#   half-recognizes ('+ptx85' warnings). train.py also sets both before importing TF.
ENV PYTHONPATH="/workspace/project" \
    TF_ENABLE_ONEDNN_OPTS=0 \
    TF_XLA_FLAGS=--tf_xla_auto_jit=0

# Entrypoint pattern for ANY AkashTrainer project (language/framework agnostic):
#   eval "$TRAIN_CMD"  — run the training command through a real shell (handles
#                        args/quotes; AkashTrainer overrides $TRAIN_CMD per run).
#   on success         — DON'T exit. Akash deploys this as a long-running k8s
#                        Deployment (restartPolicy: Always), so a finite job that
#                        exits gets relaunched -> re-trains -> "Back-off restarting
#                        failed container". Idle instead; the monitor reads the
#                        results branch this run pushed and closes the lease.
#   on failure         — exit non-zero so the failure is visible (and retryable),
#                        not silently masked.
CMD ["sh", "-c", "eval \"${TRAIN_CMD:-python3 trainer/train.py --no-export --data-dir data/raw_jsonl --out-dir /output}\"; status=$?; if [ $status -eq 0 ]; then echo '[entrypoint] training finished OK — holding the container open so the Akash Deployment does not restart this finished job; AkashTrainer will read the results branch and close the lease'; exec sleep infinity; fi; echo \"[entrypoint] training FAILED (exit $status) — exiting so the failure is visible and retryable\"; exit $status"]
