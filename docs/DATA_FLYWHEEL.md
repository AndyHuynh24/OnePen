# Data Flywheel Implementation Guide

This document explains how OnePen collects implicit feedback to improve its ML model over time.

---

## Overview

The **Data Flywheel** (also called Continuous Learning) is a system where:

1. Users interact with the app normally
2. The app collects anonymous feedback on prediction accuracy
3. This data is used to retrain and improve the model
4. Better predictions lead to better user experience
5. Repeat!

```
┌─────────────────────────────────────────────────────────┐
│                    DATA FLYWHEEL                        │
│                                                         │
│    ┌──────────┐    ┌──────────┐    ┌──────────┐        │
│    │  Users   │───>│  Model   │───>│ Improve  │        │
│    │   Use    │    │ Predicts │    │  Model   │        │
│    │   App    │    │          │    │          │        │
│    └──────────┘    └──────────┘    └──────────┘        │
│         ▲                               │              │
│         │         ┌──────────┐          │              │
│         └─────────│ Collect  │<─────────┘              │
│                   │ Feedback │                         │
│                   └──────────┘                         │
└─────────────────────────────────────────────────────────┘
```

---

## How It Works

### 1. Implicit Feedback Collection

We collect feedback **implicitly** - no extra UI needed:

| User Action | Interpretation |
|-------------|----------------|
| User doesn't undo a prediction | ✅ Prediction was **correct** |
| User undoes a prediction | ❌ Prediction was **wrong** |
| User redoes an undone prediction | ✅ Actually **correct** |

This is called **Implicit Feedback** because users don't have to explicitly say "this was right" or "this was wrong".

### 2. What Data We Collect

For each prediction, we store:

```javascript
{
  sessionId: "abc123",        // Anonymous session ID
  timestamp: 1706182400000,   // When the stroke was made
  stroke: [{x, y}, ...],      // The stroke points (normalized)
  predictedLabel: 1,          // What the model predicted (e.g., "box")
  confidence: 0.78,           // How confident the model was
  accepted: true,             // Whether user kept the prediction
  deviceInfo: {               // For debugging only
    screenWidth: 1920,
    screenHeight: 1080,
    touchSupport: true
  }
}
```

### 3. What We DON'T Collect

- ❌ User's actual notes or text content
- ❌ Personal information (name, email, etc.)
- ❌ Location data
- ❌ Browsing history
- ❌ Anything that could identify you

---

## Privacy Controls

### User Opt-In

- First-time users see an opt-in modal
- Can be changed anytime in Settings
- Data collection is disabled by default if user declines

### Data Storage

- Stored in Firebase Firestore
- Anonymous session IDs (no user identification)
- Data retention policy can be configured

---

## Architecture

### Frontend (feedbackCollector.js)

```
┌─────────────────────────────────────────────────────────┐
│                  feedbackCollector.js                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  recordPrediction()                                     │
│    ↓                                                    │
│  pendingPredictions Map                                 │
│    ↓ (after 5s timeout OR undo)                        │
│  feedbackQueue Array                                    │
│    ↓ (batch of 10)                                     │
│  Firebase Firestore                                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Backend (Firebase Firestore)

Collection: `stroke_feedback`

```javascript
// Document structure
{
  sessionId: string,
  timestamp: number,
  finalizedAt: number,
  stroke: [{x: number, y: number}, ...],
  predictedLabel: number,
  confidence: number,
  accepted: boolean,
  deviceInfo: {...},
  uploadedAt: Timestamp  // Server timestamp
}
```

### Export Script (export_feedback.py)

```bash
# Export all feedback
python scripts/export_feedback.py --output data/feedback/

# Export only accepted predictions
python scripts/export_feedback.py --output data/feedback/ --accepted-only

# Export feedback from last week
python scripts/export_feedback.py --output data/feedback/ --min-date 2025-01-18

# Dry run (just show stats)
python scripts/export_feedback.py --dry-run
```

---

## Firestore Security Rules

Add these rules to your Firebase project:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Stroke feedback collection - write-only from app
    match /stroke_feedback/{docId} {
      // Anyone can write (anonymous feedback)
      allow create: if true;

      // No one can read from the app (only admin SDK)
      allow read: if false;

      // No updates or deletes
      allow update, delete: if false;
    }
  }
}
```

---

## Retraining Workflow

### Step 1: Export Feedback Data

```bash
# Activate virtual environment
source .venv/bin/activate  # or .venv\Scripts\activate on Windows

# Export feedback
python scripts/export_feedback.py \
  --output data/feedback/export_$(date +%Y%m%d)/ \
  --min-date 2025-01-01

# Check statistics
python scripts/export_feedback.py --dry-run
```

### Step 2: Merge with Existing Training Data

```python
# In a Jupyter notebook or script
import json
from pathlib import Path

# Load new feedback
feedback_dir = Path("data/feedback/export_20250125")
with open(feedback_dir / "labels.json") as f:
    new_labels = json.load(f)

# Filter only accepted predictions
accepted = [l for l in new_labels if l["accepted"]]
print(f"New accepted samples: {len(accepted)}")

# Add to existing training data
# ... merge logic here
```

### Step 3: Retrain Model

```bash
# Run training with augmented data
python scripts/train.py --config config/config.yaml

# Or use MLflow
mlflow run . -P config=config/config.yaml
```

### Step 4: Export and Deploy

```bash
# Export to TensorFlow.js
python scripts/export.py --format tfjs --output app/tfjs/

# Deploy to Firebase
firebase deploy --only hosting
```

---

## Configuration

### feedbackCollector.js Settings

```javascript
const FEEDBACK_CONFIG = {
    // Time before accepting a prediction (ms)
    acceptanceTimeout: 5000,

    // Upload batch size
    batchSize: 10,

    // Only collect uncertain predictions
    uncertaintyThreshold: 0.85,

    // Max stroke points to store
    maxStrokePoints: 200,
};
```

### Adjusting Collection Strategy

**Collect more data:**
```javascript
uncertaintyThreshold: 1.0,  // Collect all predictions
```

**Collect less data (only uncertain):**
```javascript
uncertaintyThreshold: 0.70,  // Only when confidence < 70%
```

**Faster acceptance:**
```javascript
acceptanceTimeout: 3000,  // 3 seconds instead of 5
```

---

## Monitoring

### Check Feedback Stats (Browser Console)

```javascript
getFeedbackStats()
// Returns: { queueSize: 3, pendingCount: 1, enabled: true, sessionId: "..." }
```

### Check Firestore Console

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Navigate to Firestore Database
4. Browse the `stroke_feedback` collection

---

## Troubleshooting

### Feedback Not Being Uploaded

1. Check if user opted in: `localStorage.getItem('onepen_data_collection_opt_in')`
2. Check Firebase initialization: `firebase.firestore()` should work
3. Check console for errors: Look for `[Feedback]` logs

### Missing Firestore Permission

Add Firestore SDK to index.html:
```html
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js"></script>
```

### Export Script Fails

1. Make sure you have Firebase Admin SDK credentials
2. Place `firebase-service-account.json` in project root
3. Install dependencies: `pip install firebase-admin pillow numpy`

---

## Best Practices

### 1. Regular Exports

Export feedback weekly or monthly to avoid data accumulation.

### 2. Balance Classes

Monitor class distribution in exports. If one class is over-represented, consider:
- Adjusting thresholds for that class
- Down-sampling during training

### 3. Review Rejected Predictions

Rejected predictions are valuable! They show where the model is wrong.

```bash
# Export only rejected
python scripts/export_feedback.py --rejected-only --output data/feedback/rejected/
```

### 4. A/B Testing

When deploying a new model, compare feedback metrics:
- Acceptance rate (should increase)
- Confidence distribution (should shift higher)

---

## Future Improvements

- [ ] Active Learning: Specifically request feedback for uncertain predictions
- [ ] User corrections: Let users specify the correct label when model is wrong
- [ ] Real-time retraining: Continuously update model with new data
- [ ] Federated Learning: Train on-device without uploading raw data
