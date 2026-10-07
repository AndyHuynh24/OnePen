---
title: OnePen Math Solver
emoji: ✏️
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# OnePen Math Solver

Standalone OCR + solver backend for the OnePen math tool:
**handwriting image → Pix2Text → LaTeX → SymPy → answer**.

The web app (`app-v2`) POSTs an equation PNG to `POST /predict` and renders the
returned result. Hosted on Hugging Face Spaces so the deployed PWA (a different
origin) can reach it over HTTPS — CORS is enabled.

> The YAML frontmatter above is Hugging Face Spaces config, not decoration —
> `app_port` must match the port gunicorn binds in the Dockerfile.

## Endpoints
| Method | Path       | Body                         | Returns |
|--------|------------|------------------------------|---------|
| GET    | `/health`  | —                            | `{"status":"ok"}` |
| POST   | `/predict` | `multipart/form-data` `image`| `{"latex": "...", "result": "..."}` |
| POST   | `/solve`   | JSON `{"latex": "..."}`      | `{"latex": "...", "result": "..."}` |

## Run locally
```bash
cd math-server
pip install -r requirements.txt
python server.py            # serves on :8000
# app-v2 dev already defaults to http://127.0.0.1:8000/predict
```

## Deploy on Hugging Face Spaces (free)

The free CPU tier (2 vCPU / 16 GB RAM) is the only no-cost option sized for a
torch + OCR workload, and it terminates HTTPS for you — which the PWA requires,
since an `http://` backend is blocked as mixed content from the `https://` app.

```bash
hf auth login                                   # needs a WRITE token
hf repo create onepen-math --repo-type space --space_sdk docker
git clone https://huggingface.co/spaces/<user>/onepen-math /tmp/onepen-math
cp Dockerfile requirements.txt server.py README.md /tmp/onepen-math/
cd /tmp/onepen-math && git add -A && git commit -m "OnePen math solver" && git push
```

The first build takes ~10–20 min (torch + baking the OCR weights). Then:

```bash
curl https://<user>-onepen-math.hf.space/health   # → {"status":"ok"}
```

Set `ALLOWED_ORIGINS=https://onepen-notes.web.app` in the Space's **Settings →
Variables and secrets** so it isn't open to every origin (`ALLOWED_ORIGINS` in `server.py`).

### Gotchas
- Spaces run the container as **uid 1000, not root** — hence the `useradd` +
  `HF_HOME` in the Dockerfile. Warming the model as root would strand the
  weights in `/root/.cache`, re-downloading into an unwritable HOME each boot.
- `app_port` in this README's frontmatter must match the port gunicorn binds.
- The Space **sleeps after ~48 h idle**; the next request cold-wakes it (~30 s).

## Point the PWA at it
Set the env var when building `app-v2` (see `app-v2/.env.example`):
```
VITE_MATH_API_URL=https://<user>-onepen-math.hf.space/predict
```
Rebuild/redeploy the web app. `/solve` is derived automatically. In local dev
with no env var it falls back to the page host on :8000, then `127.0.0.1:8000`.

## Deploy on Akash (alternative)
The same image works: build `--platform linux/amd64`, push to a registry, set
`image:` in `deploy.yaml`, then `akash tx deployment create deploy.yaml`. Note
Akash leases are plain HTTP, so the PWA can't call one directly from HTTPS.

## Notes
- The image is large (~2–3 GB): Pix2Text pulls in torch + OCR weights. The
  Dockerfile pre-warms the model at build time so the first request is fast.
- One gunicorn worker keeps a single warm model in memory; bump `compute.memory`
  in `deploy.yaml` if OCR OOMs on large images.
- `smart_solver` parses with **latex2sympy2** (fractions, roots, integrals,
  derivatives, trig, equations, nCr/nPr), falling back to `sympify`, then plain
  arithmetic. It also repairs Pix2Text's split digits (`2 0` → `20`).
