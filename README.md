<p align="center">
  <img src="app/icons/icon-512.png" alt="OnePen Logo" width="80" />
</p>

<h1 align="center">OnePen</h1>

<p align="center">
  <strong>AI-Powered Gesture Recognition for Frictionless Handwritten Note-Taking</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TensorFlow-2.20+-orange?logo=tensorflow" />
  <img src="https://img.shields.io/badge/TensorFlow.js-Browser_ML-yellow?logo=tensorflow" />
  <img src="https://img.shields.io/badge/Python-3.10+-blue?logo=python" />
  <img src="https://img.shields.io/badge/PWA-Offline_Ready-5A0FC8?logo=pwa" />
  <img src="https://img.shields.io/badge/MLflow-Experiment_Tracking-0194E2?logo=mlflow" />
</p>

---
## TL;DR  

**OnePen** is the **first handwriting note-taking app** that lets users format and edit notes *without ever lifting their hand* or touching a toolbar.  
By recognizing handwritten gestures in real time, it reduces hand movement and context switching—helping users **write up to 30% faster** and stay in flow.

I designed and deployed a **fully in-browser ML system** that recognizes gestures like underline, box, delete, and brackets using a **hybrid vision + geometry model**, achieving **99.89% accuracy** with **~20 ms latency** on-device.

This project won the “Most Novel Use of AI” award at HackUmass XIII.
---

### Why it matters (real, practical impact)
- Eliminates hundreds of micro-interruptions per session caused by tool switching  
- Keeps users in a continuous writing flow → **less fatigue, faster note-taking**  
- ML directly controls the UI, turning handwriting into beautiful styles flawlessly
- Works **offline**, instantly, and privately (no server, no cloud)

---

> <span style="color:#58a6ff; font-weight:700;">🚀 NOT A DEMO · NOT A PROTOTYPE</span><br>
> <span style="color:#c9d1d9;">OnePen is a published app, used by real users, that measurably improves how people write.</span>

---

### What makes it novel
- **First app** to replace toolbar-based formatting with real-time handwritten gesture recognition  
- **Hybrid ML architecture**:  
  CNN (MobileNetV3) for visual intent + 12 handcrafted geometric features to disambiguate similar strokes  
- Designed around **human motor behavior**, not just classification accuracy

---

### Technical highlights
- **Model**: MobileNetV3 + Squeeze-and-Excitation + 12D geometric feature fusion  
- **Performance**: 99.89% accuracy · ~20 ms inference · 2.5 MB model  
- **Deployment**: 100% client-side with TensorFlow.js (PWA, offline-first)  
- **ML Ops**: MLflow-tracked experiments with reproducible pipelines  

---

### Stack
**TensorFlow / Keras · TensorFlow.js · Python · MLflow · Canvas API · PWA**



## 🚨 The Problem

Handwritten note-taking is full of interruptions.  
Changing colors, highlighting, erasing, or switching pens forces you to lift your hand, reach for a toolbar, then return to the page.

These tiny actions add up—quietly breaking your flow and focus.

---

## ✨ The Solution

**OnePen** removes that friction.

It’s a handwriting-first note-taking web app powered by **AI gesture recognition**, allowing you to write, format, and organize naturally—without ever touching a toolbar.

- Circle content → **Highlight**
- Underline text → **Bold or Title**
- Draw brackets → **Change stroke color**

**One pen. Zero interruptions.**

🎥 **[Watch Demo →](https://github.com/user-attachments/assets/841e0054-ee6b-4bc9-9c63-4c769e01642b)**

---

## 🚀 Key Features

### ✍️ Gesture Recognition (ML-Powered)

**Quick Draw** — Instantly styles strokes (fully customizable):

| Gesture | Action |
|-------|--------|
| Box | Groups and styles enclosed content |
| Wavy box | Groups content with alternative styling |
| Strike-through | Deletes crossed strokes |
| Box / Curly / Circle brackets | Styles child content within bracket height |

**Draw + Hold** — Opens a radial tool dial  
> 6 gestures × 8 tools = **48 quick-access tools**

Draw any gesture (except delete), hold briefly, and select a tool—without lifting your pen.

---

### 📚 Study Tools
- **Tape Flashcards** — Mask content with decorative tape (6 styles). Click to reveal.
- **Auto-Summaries** — Generate study sheets from titles, boxes, and highlights.
- **Table of Contents** — Auto-generated from headings for instant navigation.

---

### 🧠 Smart Notes
- **Sticky Notes** — Attach floating notes with mini drawing canvases.
- **Hyperlinks** — Draw regions to create clickable links.
- **Math Solver** — Handwritten equations → LaTeX → solved (via Pix2Text).

---

### 📦 Media & Export
- Insert **images / PDFs** with resize, rotate, and opacity controls
- **Google Drive sync** with auto-backup every 15 seconds
- **Offline-first PWA** — Works without internet after first load
- Share notebooks as portable **JSON files**

---

## 🧩 Technical Overview

### System Architecture
![System Architecture](assets/architecture.png)

---

### Model Architecture

OnePen uses a **hybrid dual-input model** that fuses visual and geometric stroke features:

```
┌─────────────────┐     ┌─────────────────┐
│  96×96 Image    │     │  12D Geometric  │
│    (stroke)     │     │    Features     │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  MobileNetV3    │     │   Dense 128→64  │
│  + SE Attention │     │  + LayerNorm    │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └──────────┬────────────┘
                    ▼
           ┌───────────────┐
           │    Concat     │
           │   384 → 192   │
           │   + Dropout   │
           └───────┬───────┘
                   ▼
           ┌───────────────┐
           │   8 Classes   │
           │   (softmax)   │
           └───────────────┘
```

**Why hybrid?**  
Image-only models struggled with visually similar gestures (box vs bracket, underline vs delete).  
Adding geometric features improved accuracy by **~5–8%**.

---

### The 12 Geometric Features

| # | Feature | Why It Helps |
|---|--------|--------------|
| 1 | Closure ratio | Boxes form closed loops |
| 2 | Compactness | Underlines are elongated |
| 3 | Spread ratio | Underlines have low spread |
| 4 | Aspect ratio | Distinguishes wide vs tall |
| 5 | Edge fraction | Boxes cluster on edges |
| 6 | Point count | Deletes use more points |
| 7 | Height diff | Underlines stay below threshold |
| 8 | Horizontal variance | Underlines vary in X |
| 9 | Total path length | Wavy strokes are longer |
| 10 | Perimeter ratio | Size-invariant metric |
| 11 | Spine verticality | Deletes are diagonal |
| 12 | Vertical variance | Underlines have low Y variance |

---

### Model Performance

| Model | Accuracy | Size | Inference |
|------|---------|------|----------|
| MobileNetV3-Large | 99.88% | 5 MB | 30 ms |
| **MobileNetV3-Small (Chosen)** | **99.89%** | **2.5 MB** | **20 ms** |
| EfficientNetV2-B0 | — | 7 MB | 60 ms |

Chosen for **near-perfect accuracy** with **ultra-fast browser inference**.

---

### Data Pipeline
1. Custom data collection app (4 writers, varied styles)
2. Augmentation: rotation, shear, scale, flip (6× data)
3. Preprocessing: normalization, 96×96 rendering, feature extraction
4. Full experiment tracking with **MLflow**

![Stroke Samples](assets/sample_stroke.png)

> Runs entirely **in-browser**. Optional Flask backend for math solving.

---

## ⚡ Quick Start

```bash
git clone https://github.com/yourusername/OnePen.git
cd OnePen

python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cd app
python -m http.server 8000

### Train Your Own Model

```bash
make dataset   # Preprocess collected data
make train     # Train hybrid CNN (~200 epochs)
make export    # Export to TensorFlow.js
```

---

## Project Structure

```
OnePen/
├── app/                      # Progressive Web App
│   ├── index.html           # Main interface
│   ├── draw.js              # Canvas engine (zoom, pan, stylus)
│   ├── predict.js           # TensorFlow.js inference
│   ├── sw.js                # Service worker (offline)
│   └── manifest.json        # PWA manifest
│
├── src/modifiers/           # ML Library
│   ├── models/
│   │   └── architecture.py  # Hybrid CNN definition
│   ├── features/
│   │   └── geometric.py     # 12D feature extraction
│   └── data/
│       ├── loader.py        # Dataset loading
│       └── augmenter.py     # Data augmentation
│
├── scripts/                 # CLI Tools
│   ├── train.py            # Training script
│   └── export.py           # TF.js export
│
├── config/config.yaml       # Hyperparameters
└── mlruns/                  # MLflow experiments
```

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | Canvas API, TensorFlow.js, IndexedDB, Service Workers |
| **ML** | TensorFlow/Keras, MobileNetV3, Squeeze-and-Excitation |
| **Backend** | Flask, Pix2Text (math), Google Drive API |
| **DevOps** | MLflow, pytest, ruff, mypy |

---

## What I Learned

- **Feature engineering matters** — Hand-crafted geometric features outperformed adding more CNN layers; however, not all features help, adding them even make the model worse.
- **Augmentation** - Augmentation is very helpful, generating many more realistic data samples without manually collecting data. However, it is needed to be handled carefully or it would break the characteristics of the unique classes.
- **Hybrid models** — Combining different input modalities (image + vector) requires careful normalization 
- **Browser ML constraints** — Model size and inference speed directly impact UX; MobileNet's efficiency was key
- **Data diversity** — Collecting from multiple handwriting styles prevented overfitting to my own gestures

---

## License

MIT

---

## Author

**Andy Huynh** — [GitHub](https://github.com/AndyHuynh24)

