# OnePen training image — runnable on Akash via AkashTrainer or standalone.
#
# Contract with AkashTrainer:
#   - AkashTrainer sets TRAIN_CMD (defaults to `python3 scripts/train.py --no-wandb`)
#     and the GitHub push env vars (REPO_URL, GITHUB_TOKEN, OUTPUT_BRANCH_PREFIX).
#   - This image's CMD honors $TRAIN_CMD via the `exec` form below.
#   - scripts/train.py calls akash_train.publish_results() at the end, which
#     pushes the trained model + metrics to a `trained-output/<timestamp>` branch.
#
# Standalone (docker run andyhuynh24/onepen-trainer:v1):
#   - No TRAIN_CMD set → defaults to `python3 scripts/train.py --no-wandb`.
#   - REPO_URL/GITHUB_TOKEN unset → publish_results writes /output/results.json
#     locally but skips the git push.

# NVIDIA's TF container (TF 2.17 + CUDA 12.8 with kernels for Blackwell/H100/A100/etc.)
FROM nvcr.io/nvidia/tensorflow:25.02-tf2-py3

WORKDIR /workspace/project

RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

# OnePen's requirements.txt pins tensorflow>=2.20.0, which would override the
# image's TF 2.17 (and likely break CUDA compat). Install only the non-TF deps
# OnePen actually needs.
RUN pip install --no-cache-dir \
    "numpy>=1.24.0" \
    "scikit-learn>=1.3.0" \
    "pandas>=2.0.0" \
    "pillow>=10.0.0" \
    "pydantic>=2.0.0" \
    "pydantic-settings>=2.0.0" \
    "pyyaml>=6.0" \
    "matplotlib>=3.7.0" \
    "seaborn>=0.12.0" \
    "rich>=13.0.0" \
    "tf_keras"

# Project files
COPY config/        config/
COPY scripts/       scripts/
COPY src/           src/
COPY data/processed/ data/processed/

# AkashTrainer publish helper (stdlib + git CLI only)
COPY akash_train.py akash_train.py

RUN mkdir -p models /output outputs logs

ENV PYTHONPATH="/workspace/project/src:/workspace/project"

# Honor $TRAIN_CMD if AkashTrainer set it; otherwise run a sensible default.
# --no-wandb is included so the container doesn't try to phone home to W&B
# without an API key (set WANDB_API_KEY env var to enable W&B logging instead).
CMD ["sh", "-c", "exec ${TRAIN_CMD:-python3 scripts/train.py --no-wandb}"]
