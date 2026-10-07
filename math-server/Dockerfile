# OnePen math solver — Pix2Text + SymPy, served by gunicorn.
# Targets Hugging Face Spaces (Docker SDK) and works unchanged on Akash /
# Cloud Run / any container host. Pix2Text pulls torch + OCR weights, so the
# image is large (~2–3 GB); the model is baked in at build time so the first
# request isn't a multi-minute download.
FROM python:3.11-slim

# build-essential: a C/C++ compiler for deps without a prebuilt wheel for this
# platform (e.g. stringzilla, pulled in by pix2text) — without it pip's source
# build fails with "gcc: No such file or directory".
# libgl1/libglib2.0-0/libgomp1: runtime libs Pillow / pix2text (opencv) need.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install deps system-wide as root first, for layer caching.
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Hugging Face Spaces runs the container as uid 1000, NOT root. The model cache
# must therefore be written and read by that user — warming it as root would
# leave the weights in /root/.cache where the runtime user can't reach them,
# forcing a re-download into an unwritable HOME on every cold start.
RUN useradd -m -u 1000 user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    HF_HOME=/home/user/.cache/huggingface
USER user
WORKDIR /home/user/app

# Bake the OCR weights into the image as the runtime user.
RUN python -c "from pix2text import Pix2Text; Pix2Text.from_config()" || true

COPY --chown=user:user server.py .

# 7860 is the Hugging Face Spaces default (see app_port in README.md frontmatter).
# $PORT still wins where the platform sets it (Cloud Run sends 8080).
ENV PORT=7860
EXPOSE 7860

# Single worker: the OCR model is heavy; one warm process avoids loading it N
# times. Long timeout because OCR + sympy can take a few seconds on CPU.
# Shell form so ${PORT} is expanded at runtime.
CMD gunicorn --bind 0.0.0.0:${PORT:-7860} --workers 1 --threads 4 --timeout 120 server:app
