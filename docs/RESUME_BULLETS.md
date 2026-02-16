# OnePen - Resume Bullet Points

> **Master list of resume bullet points for OnePen project.**
> Pick and combine bullets based on the role you're targeting.
> Customize metrics and emphasis per application.

---

## Project One-Liner (for Resume Header)

**OnePen** | AI-Powered Handwriting App with Real-Time Gesture Recognition
- Live: onepen-notes.web.app | Award: Most Novel AI - HackUMASS XII
- Tech: TensorFlow/Keras, TensorFlow.js, JavaScript, Python, Firebase, PWA

---

## Software Engineer / Full-Stack Engineer

### Core Application Engineering
- Architected and built a **full-stack Progressive Web App (8,700+ lines JS)** for AI-powered handwriting note-taking, deployed on Firebase Hosting with offline-first capabilities via Service Workers and Cache API
- Engineered a **multi-layer HTML5 Canvas rendering system** with HiDPI support (devicePixelRatio scaling), viewport-aware coordinate transforms, and Catmull-Rom spline stroke smoothing for pixel-perfect handwriting across devices
- Designed and implemented a **real-time gesture recognition pipeline** that classifies 7 hand-drawn gesture types into **55 contextual quick actions** through a gesture + hold radial menu system, eliminating toolbar dependency
- Built a **complete note management system** with IndexedDB persistence, folder hierarchy, note CRUD operations, autosave with debounced writes, and `beforeunload` / `visibilitychange` save guards to prevent data loss
- Implemented **copy/paste, move, and undo/redo** systems with deep-clone state management, bounding-box hit detection, and multi-group selection support across a large canvas workspace

### Frontend / UI Engineering
- Developed a **customizable radial toolbox UI** with per-gesture tool registries (18 tools), long-press activation, configurable tool color/size/visibility, and persistent settings via IndexedDB
- Built a **tape flashcard system** for active recall study: patterned canvas overlays (6 presets with zigzag edges) that cover content, tap-to-reveal with CSS fade animations, and automatic flashcard aggregation across notebooks
- Implemented **momentum-based pan/scroll** with axis locking, pinch-to-zoom (0.5x-4x), configurable grid backgrounds, and a custom scrollbar with content-height tracking
- Created **sticky note, embed link, and math solver** features with floating annotation canvases, clickable web previews via iframe embeds, and handwriting-to-LaTeX-to-solution pipeline
- Engineered a **summary/study sheet generator** that scans notebooks for highlighted, boxed, and titled content, aggregates across pages, and auto-detects staleness when source notes change

### Cloud & Infrastructure
- Integrated **Google Drive API** for cloud backup/restore with OAuth 2.0 token lifecycle management, automatic token refresh, and multipart upload for seamless cross-device sync
- Built a **Firebase Authentication flow** with Google Sign-In, session persistence, and Drive token expiry handling with auto-reauthentication
- Designed a **CI/CD pipeline with GitHub Actions** (3 parallel jobs: core tests with coverage, ML tests with TensorFlow, and Firebase deployment) gated on branch protection for the main branch
- Implemented a **Service Worker** with stale-while-revalidate caching strategy, offline navigation fallbacks, and versioned cache invalidation across 20+ cached assets including CDN dependencies

### Data & Persistence
- Engineered an **offline-first data architecture** using IndexedDB with versioned schema migrations, structured object stores for notes and settings, and cursor-based iteration for batch operations
- Built **JSON-based import/export** for note sharing with folder structure preservation, path rewriting for conflict avoidance, and full backup/restore with metadata integrity checks
- Implemented **PDF export** with full canvas fidelity using jsPDF, and PDF import/render with pdf.js at 16x HiDPI scale for crisp display at any zoom level

---

## Machine Learning / AI Engineer

### Model Architecture & Design
- Designed a **hybrid CNN + geometric feature model** (MobileNetV3-Small backbone + 12D hand-crafted features) for stroke gesture classification, achieving **99.89% test accuracy** with a **2.5MB model** and **~20ms inference latency**
- Engineered a **Squeeze-and-Excitation attention block** on top of the CNN backbone to dynamically re-weight channel features, improving gesture disambiguation by learning channel-wise dependencies
- Implemented a **dual-branch fusion architecture** (CNN image branch + dense feature branch) with BatchNormalization, LayerNormalization, and staged dropout (0.2-0.35) across fusion layers [384 -> 192 -> 8 softmax]
- Built an **image-only baseline model** for ablation study, demonstrating that adding geometric features improved accuracy by **5-8%** over pure CNN approaches for visually similar gesture classes

### Feature Engineering
- Extracted a **12-dimensional geometric feature vector** from raw stroke coordinates: closure ratio (loop detection), compactness (path/diagonal), aspect ratio (arctan-bounded), edge fraction, spine verticality, spread ratio, and 6 additional discriminative features
- Implemented **identical feature extraction in Python (NumPy) and JavaScript** to ensure training-inference parity, with NaN/Infinity guards and numerical stability (epsilon=1e-6) across both implementations
- Conducted **ANOVA and Mutual Information analysis** for feature selection, identifying the 6 most discriminative features (direction_bias, height_diff, spread_ratio, etc.) to reduce input dimensionality

### Data Pipeline & Augmentation
- Built an **end-to-end ML data pipeline**: raw JSON stroke data -> coordinate normalization -> geometric augmentation -> image rendering -> feature extraction -> train/val/test split with stratification
- Designed a **stroke-aware augmentation pipeline** with rotation (-6 to +6 deg), shear (x/y), scale transforms, and horizontal flipping, with per-class exclusion rules (e.g., no rotation for bracket gestures) to preserve class-specific characteristics
- Collected and curated a **multi-contributor training dataset** from 5+ contributors with diverse handwriting styles across 8 gesture classes, with automated loader, class validation, and distribution logging
- Implemented a **stroke-to-image renderer** with anti-aliased supersampling (4x), Quadratic Bezier smoothing, configurable line width, and Lanczos downsampling for high-quality CNN inputs

### Training & Experiment Tracking
- Configured a **production training pipeline** with early stopping (patience=35), ReduceLROnPlateau, model checkpointing, TensorBoard logging, and balanced class weights via sklearn
- Integrated **Weights & Biases (W&B) experiment tracking** with per-run logging of hyperparameters, training curves, confusion matrices, per-class F1/precision/recall, and model artifact versioning
- Automated **training visualization outputs**: loss/accuracy curves, normalized confusion matrix heatmaps (seaborn), and JSON classification reports for every run

### Model Deployment & Optimization
- Exported trained Keras models to **TensorFlow.js GraphModel format** via SavedModel intermediate conversion, with optional uint8/uint16 quantization for size-accuracy tradeoffs
- Achieved **~20ms average browser inference latency** with TensorFlow.js, including warm-up preloading, tensor lifecycle management (`tf.tidy`, `dispose`), and memory leak prevention
- Built **browser-side benchmarking utilities** (inference timing tracker, P95/P99 latency, model size analyzer) exposed as console APIs for production performance monitoring

### Data Flywheel / Continuous Learning
- Architected an **implicit feedback data flywheel** system: if a user doesn't undo a prediction within 5 seconds, it's marked as accepted; undo marks it as rejected; redo reverses the rejection
- Implemented **privacy-first feedback collection** with user opt-in modal, anonymous session IDs, batched uploads to Firebase Firestore, local queue persistence, and data minimization (downsampled strokes, no note content)
- Built **feedback export pipeline** (Python + Firebase Admin SDK) for retraining: filtered export by date range, acceptance status, and class, with documentation for the full retrain-deploy cycle

---

## Frontend / JavaScript Engineer

- Built a **production PWA** (15,000+ lines across 10 JS modules) serving as an AI-powered note-taking app, deployed on Firebase Hosting with installability, offline support, and home screen shortcut
- Engineered a **real-time canvas drawing engine** with pressure-sensitive input handling, pointer event normalization across mouse/touch/stylus, and sub-pixel stroke rendering with Catmull-Rom interpolation
- Implemented **TensorFlow.js inference** in the browser with automatic model input shape detection, dual-input prediction (image tensor + feature tensor), and per-class confidence thresholds with fallback logic
- Designed a **state machine architecture** for app modes (IDLE, DRAWING, ERASING, PANNING, MOVING, SHAPE, SELECTING) with clean transitions and pointer event routing
- Built a **centralized configuration system** (`config.js`) with frozen immutable objects for 100+ app constants, stroke type enums, tool registries with granular customization flags, and toolbox layout definitions
- Created a **custom eraser tool** with variable size, bounding-box intersection detection against all stroke groups, and batch undo support for erased elements
- Implemented **zoom/pan with momentum physics**: friction-based velocity decay (0.92 coefficient), axis-locked scrolling, and smooth viewport transitions

---

## DevOps / Infrastructure Engineer

- Designed a **CI/CD pipeline** (GitHub Actions) with 3 parallel jobs: lightweight core tests (pytest + coverage), GPU-free ML tests (TensorFlow, continue-on-error), and Firebase Hosting deployment on merge to main
- Configured **Python project tooling**: pyproject.toml with setuptools, ruff linter/formatter (line-length=100, isort), mypy type checking, pytest with coverage reporting, and Makefile for common workflows
- Implemented a **Service Worker caching strategy** with versioned cache names, install-time asset pre-caching (20+ files), CDN resource caching with `Promise.allSettled`, and stale-while-revalidate fetch handling
- Set up **Firebase Hosting** with custom hosting config, Firestore security rules (write-only feedback collection, no client reads), and Firebase Authentication integration

---

## Data Engineer

- Built a **reproducible data pipeline** with YAML-driven configuration (Pydantic-validated), deterministic random seeds, and versioned `.npz` output with JSON metadata (sample counts, shapes, class mappings)
- Implemented a **multi-source data loading system** that aggregates handwriting stroke data from multiple contributor directories, validates class labels, filters invalid strokes (width thresholds, minimum points), and logs class distribution
- Designed a **coordinate normalization pipeline** with bounding-box extraction, [0,1] range normalization, and separate raw/normalized data paths for geometric feature extraction vs. image rendering

---

## Mobile / Cross-Platform Engineer

- Built a **cross-device PWA** optimized for iPad and tablet stylus input, with pointer event handling for Apple Pencil pressure sensitivity, touch-vs-stylus discrimination, and palm rejection via pointerType detection
- Resolved **iPad-specific canvas issues** including inconsistent writing input, scroll+zoom conflicts, and autosave interference with active drawing through deferred save scheduling
- Implemented **responsive HiDPI canvas rendering** with `devicePixelRatio` scaling, dynamic canvas resize on orientation change, and viewport-aware redraw optimization

---

## Quantitative Impact Metrics (Use in Bullets)

| Metric | Value | Context |
|--------|-------|---------|
| Model Accuracy | 99.89% | 8-class gesture classification |
| Inference Latency | ~20ms | Browser-side TensorFlow.js |
| Model Size | 2.5 MB | MobileNetV3-Small + geometric features |
| Quick Actions | 55 | 7 gestures x hold-menu tools |
| Feature Vector | 12D | Hand-crafted geometric features |
| Accuracy Improvement | 5-8% | Hybrid vs image-only model |
| Codebase | 15,000+ lines JS | Frontend PWA |
| Training Pipeline | End-to-end | Data collection -> deployment |
| CI/CD | 3 parallel jobs | Tests + ML tests + deploy |
| Contributors | 5+ | Multi-contributor training dataset |
| Total Commits | 169 | Active development history |
| Gesture Types | 8 classes | underline, box, curly, delete, 3 brackets, none |
| Award | Most Novel AI | HackUMASS XII hackathon |

---

## Role-Specific Combinations

### Software Engineer Resume (Pick 3-5)
1. "Architected and built a full-stack PWA..." (scope)
2. "Designed a real-time gesture recognition pipeline..." (technical depth)
3. "Engineered a multi-layer HTML5 Canvas rendering system..." (frontend expertise)
4. "Designed a CI/CD pipeline with GitHub Actions..." (DevOps awareness)
5. "Built a complete note management system with IndexedDB..." (data persistence)

### ML/AI Engineer Resume (Pick 3-5)
1. "Designed a hybrid CNN + geometric feature model..." (architecture)
2. "Extracted a 12-dimensional geometric feature vector..." (feature engineering)
3. "Built an end-to-end ML data pipeline..." (pipeline engineering)
4. "Achieved ~20ms browser inference latency..." (deployment/optimization)
5. "Architected an implicit feedback data flywheel..." (MLOps/continuous learning)

### Full-Stack Engineer Resume (Pick 3-5)
1. "Architected and built a full-stack PWA..." (scope)
2. "Integrated Google Drive API for cloud backup/restore..." (API integration)
3. "Implemented TensorFlow.js inference in the browser..." (ML deployment)
4. "Engineered an offline-first data architecture using IndexedDB..." (data layer)
5. "Designed a CI/CD pipeline..." (DevOps)

### Frontend Engineer Resume (Pick 3-5)
1. "Built a production PWA (15,000+ lines across 10 JS modules)..." (scale)
2. "Engineered a real-time canvas drawing engine..." (graphics)
3. "Designed a state machine architecture for app modes..." (architecture)
4. "Implemented zoom/pan with momentum physics..." (UX engineering)
5. "Built a customizable radial toolbox UI..." (UI design)

---

## Tips for Using These Bullets

1. **Lead with impact**: Start bullets with the strongest verb and most impressive metric
2. **Tailor per role**: ML roles want model accuracy; SWE roles want system design; Frontend roles want UX/canvas
3. **Combine bullets**: Merge 2 shorter bullets into 1 meaty bullet for senior roles
4. **Add context**: For non-technical audiences, add "enabling X" or "resulting in Y" at the end
5. **Quantify everything**: Use the metrics table above to add numbers to any bullet
6. **Hackathon award**: Always mention "Most Novel AI - HackUMASS XII" for credibility
7. **Live demo**: Always include the live URL (onepen-notes.web.app) - interviewers will check it
