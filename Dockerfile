# OnePen training image — built by AkashTrainer from this repo, or standalone.
#
# Base: nvcr.io/nvidia/tensorflow (NVIDIA's TF container). Chosen because it is
# SELF-CONTAINED — it bundles the full CUDA toolkit + CUDA forward-compatibility
# libs, so it actually loads the GPU on Akash providers. The official
# `tensorflow/tensorflow:*-gpu` images do NOT (they "cannot dlopen GPU libraries"
# and fall back to CPU, even on an H100). nvcr 25.02 = CUDA 12.8 + supports every
# current arch (Ampere → Hopper → Blackwell), and forward-compat lets datacenter
# GPUs run even on somewhat older host drivers.
#
# Contract with AkashTrainer:
#   - AkashTrainer sets TRAIN_CMD per sweep run (e.g. `python3 trainer/train.py --model tcn`)
#     plus the GitHub push env vars (REPO_URL, GITHUB_TOKEN, OUTPUT_BRANCH_PREFIX).
#   - CMD honors $TRAIN_CMD via the `exec` form below.
#   - trainer/train.py calls akash_train.publish_results() → sweep leaderboard.
#
# Sweep in the AkashTrainer UI:
#   base command : python3 trainer/train.py --no-export
#   search space : --model ∈ {geometric, image, hybrid, tcn, tcn_hybrid}
FROM nvcr.io/nvidia/tensorflow:25.02-tf2-py3

WORKDIR /workspace/project

# git is required by the publish step (akash_train.py shells out to git)
RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

# non-TF deps the trainer needs (TF + numpy are already in the nvcr image)
RUN pip install --no-cache-dir "scikit-learn>=1.3.0" "pillow>=10.0.0"

# trainer code + v2 dataset (baked in, ~12 MB) + the AkashTrainer publish helper
COPY trainer/         trainer/
COPY data/raw_jsonl/  data/raw_jsonl/
COPY akash_train.py   akash_train.py

RUN mkdir -p /output

ENV PYTHONPATH="/workspace/project"

# nvcr enables oneDNN custom ops, which fuse LayerNorm into a CPU-only
# _MklLayerNorm kernel that crashes on GPU. Disable so every op has a GPU kernel.
# (train.py also sets this before importing TF.)
ENV TF_ENABLE_ONEDNN_OPTS=0

# AkashTrainer overrides $TRAIN_CMD per run; default trains the deployed app model
# once. --no-export skips TF.js conversion (export the browser model locally).
CMD ["sh", "-c", "exec ${TRAIN_CMD:-python3 trainer/train.py --model hybrid --no-export --data-dir data/raw_jsonl --out-dir /output}"]
