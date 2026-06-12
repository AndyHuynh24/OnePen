# OnePen training image — built by AkashTrainer from this repo, or standalone.
#
# Base: tensorflow/tensorflow:2.19.0-gpu (CUDA 12.3). Chosen for BROAD Akash
# compatibility — low driver floor (~525) + PTX for Turing→Hopper (T4, 3090,
# 4090, A100, A6000, L40, H100 = the bulk of what bids). It does NOT cover
# Blackwell (sm_120); blacklist those in AkashTrainer (B200 / GB200 / PRO 6000).
# For a Blackwell-only run, build a second tag from nvcr.io/nvidia/tensorflow:25.02-tf2-py3.
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
FROM tensorflow/tensorflow:2.19.0-gpu

WORKDIR /workspace/project

# git is required by the publish step (akash_train.py shells out to git)
RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

# non-TF deps the trainer needs (TF is already in the base image)
RUN pip install --no-cache-dir "scikit-learn>=1.3.0" "pillow>=10.0.0"

# trainer code + v2 dataset (baked in, ~12 MB) + the AkashTrainer publish helper
COPY trainer/         trainer/
COPY data/raw_jsonl/  data/raw_jsonl/
COPY akash_train.py   akash_train.py

RUN mkdir -p /output

ENV PYTHONPATH="/workspace/project"

# TF enables oneDNN custom ops which fuse LayerNorm into a CPU-only _MklLayerNorm
# kernel that crashes on GPU. Disable so every op has a GPU kernel. (train.py also
# sets this before importing TF.)
ENV TF_ENABLE_ONEDNN_OPTS=0

# AkashTrainer overrides $TRAIN_CMD per run; default trains the deployed app model
# once. --no-export skips TF.js conversion (export the browser model locally).
CMD ["sh", "-c", "exec ${TRAIN_CMD:-python3 trainer/train.py --model hybrid --no-export --data-dir data/raw_jsonl --out-dir /output}"]
