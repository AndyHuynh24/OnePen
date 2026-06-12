# OnePen training image — built by AkashTrainer from this repo, or standalone.
#
# Contract with AkashTrainer:
#   - AkashTrainer sets TRAIN_CMD per sweep run (e.g. `python3 trainer/train.py --model tcn`)
#     plus the GitHub push env vars (REPO_URL, GITHUB_TOKEN, OUTPUT_BRANCH_PREFIX).
#   - This image's CMD honors $TRAIN_CMD via the `exec` form below.
#   - trainer/train.py calls akash_train.publish_results() at the end, which pushes
#     each run's metrics + best model to a `trained-output/<run>` branch → leaderboard.
#
# Sweep over models in the AkashTrainer UI:
#   base command : python3 trainer/train.py --no-export
#   search space : --model  ∈  {geometric, image, hybrid, tcn, tcn_hybrid}
#   → one lease per model, all compared on the sweep leaderboard.
#
# Standalone:  docker run --gpus all -v "$PWD/out:/output" <img>  # trains the app model

# NVIDIA's TF container (TF 2.17 + CUDA 12.8; kernels for Blackwell/H100/A100/etc.)
FROM nvcr.io/nvidia/tensorflow:25.02-tf2-py3

WORKDIR /workspace/project

RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

# Only the non-TF deps the trainer needs — keep the image's CUDA-optimized TF.
RUN pip install --no-cache-dir \
    "numpy>=1.24.0" \
    "scikit-learn>=1.3.0" \
    "pillow>=10.0.0"

# Trainer code + the v2 dataset (baked in, ~12 MB) + the AkashTrainer publish helper
COPY trainer/         trainer/
COPY data/raw_jsonl/  data/raw_jsonl/
COPY akash_train.py   akash_train.py

RUN mkdir -p /output

ENV PYTHONPATH="/workspace/project"

# This NVIDIA container enables oneDNN custom ops, which fuse LayerNorm into a
# CPU-only `_MklLayerNorm` kernel and crash on GPU. Disable so every op has a
# GPU kernel. (The trainer also sets this defensively before importing TF.)
ENV TF_ENABLE_ONEDNN_OPTS=0

# AkashTrainer overrides $TRAIN_CMD per run; the default trains the deployed app
# model once. --no-export skips the TF.js conversion (tensorflowjs isn't installed
# in this CUDA image; export the browser model locally with trainer/requirements.txt).
CMD ["sh", "-c", "exec ${TRAIN_CMD:-python3 trainer/train.py --model hybrid --no-export --data-dir data/raw_jsonl --out-dir /output}"]
