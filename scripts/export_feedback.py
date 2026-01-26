#!/usr/bin/env python3
"""
Export Feedback Data from Firestore for Model Retraining

This script downloads stroke feedback collected from users and converts it
to training format for model improvement.

Usage:
    python scripts/export_feedback.py --output data/feedback/
    python scripts/export_feedback.py --output data/feedback/ --min-date 2025-01-01
    python scripts/export_feedback.py --output data/feedback/ --accepted-only

Requirements:
    pip install firebase-admin numpy pillow
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("Error: firebase-admin not installed")
    print("Run: pip install firebase-admin")
    sys.exit(1)

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Error: Pillow not installed")
    print("Run: pip install pillow")
    sys.exit(1)


# ============================================================================
# Configuration
# ============================================================================

# Firestore collection name (must match feedbackCollector.js)
COLLECTION_NAME = "stroke_feedback"

# Class label mapping (must match config.js CLASSES)
CLASSES = [
    "underline",
    "box",
    "curly",
    "delete",
    "boxshortcut",
    "curlyshortcut",
    "circleshortcut",
    "none",
]

# Image rendering settings
IMG_SIZE = 96
LINE_WIDTH = 3


# ============================================================================
# Firebase Initialization
# ============================================================================

def init_firebase(service_account_path: Optional[str] = None) -> firestore.Client:
    """Initialize Firebase Admin SDK and return Firestore client."""
    if firebase_admin._apps:
        return firestore.client()

    if service_account_path:
        cred = credentials.Certificate(service_account_path)
    else:
        # Try to find service account file in common locations
        possible_paths = [
            Path("firebase-service-account.json"),
            Path("config/firebase-service-account.json"),
            Path.home() / ".config/firebase/service-account.json",
        ]

        for path in possible_paths:
            if path.exists():
                cred = credentials.Certificate(str(path))
                break
        else:
            # Fall back to Application Default Credentials
            cred = credentials.ApplicationDefault()

    firebase_admin.initialize_app(cred)
    return firestore.client()


# ============================================================================
# Data Export
# ============================================================================

def fetch_feedback(
    db: firestore.Client,
    min_date: Optional[datetime] = None,
    max_date: Optional[datetime] = None,
    accepted_only: bool = False,
    rejected_only: bool = False,
    limit: int = 10000,
) -> List[Dict]:
    """
    Fetch feedback documents from Firestore.

    Args:
        db: Firestore client
        min_date: Only fetch feedback after this date
        max_date: Only fetch feedback before this date
        accepted_only: Only fetch accepted predictions
        rejected_only: Only fetch rejected predictions
        limit: Maximum number of documents to fetch

    Returns:
        List of feedback documents
    """
    query = db.collection(COLLECTION_NAME)

    if min_date:
        query = query.where("timestamp", ">=", int(min_date.timestamp() * 1000))

    if max_date:
        query = query.where("timestamp", "<=", int(max_date.timestamp() * 1000))

    if accepted_only:
        query = query.where("accepted", "==", True)
    elif rejected_only:
        query = query.where("accepted", "==", False)

    query = query.limit(limit)

    docs = query.stream()
    return [doc.to_dict() for doc in docs]


def render_stroke_to_image(stroke: List[Dict], img_size: int = IMG_SIZE) -> np.ndarray:
    """
    Render a stroke to a grayscale image.

    Args:
        stroke: List of {x, y} points (normalized 0-1)
        img_size: Output image size

    Returns:
        NumPy array of shape (img_size, img_size)
    """
    img = Image.new("L", (img_size, img_size), color=255)
    draw = ImageDraw.Draw(img)

    if len(stroke) < 2:
        return np.array(img, dtype=np.uint8)

    # Scale stroke to image coordinates
    points = [(p["x"] * img_size, p["y"] * img_size) for p in stroke]

    # Draw lines between consecutive points
    for i in range(len(points) - 1):
        draw.line([points[i], points[i + 1]], fill=0, width=LINE_WIDTH)

    return np.array(img, dtype=np.uint8)


def export_to_training_format(
    feedback_data: List[Dict],
    output_dir: Path,
    include_rejected: bool = True,
) -> Dict:
    """
    Export feedback data to training format.

    Creates:
        - images/ folder with rendered stroke images
        - labels.json with label information
        - metadata.json with export information

    Args:
        feedback_data: List of feedback documents
        output_dir: Output directory
        include_rejected: Whether to include rejected predictions (useful for hard negatives)

    Returns:
        Statistics dictionary
    """
    output_dir = Path(output_dir)
    images_dir = output_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    labels = []
    stats = {
        "total": len(feedback_data),
        "accepted": 0,
        "rejected": 0,
        "by_class": {cls: {"accepted": 0, "rejected": 0} for cls in CLASSES},
        "exported": 0,
        "skipped": 0,
    }

    for i, feedback in enumerate(feedback_data):
        try:
            stroke = feedback.get("stroke", [])
            predicted_label = feedback.get("predictedLabel")
            accepted = feedback.get("accepted", True)
            confidence = feedback.get("confidence", 0)

            # Skip if no stroke data
            if not stroke or len(stroke) < 2:
                stats["skipped"] += 1
                continue

            # Get class name
            if isinstance(predicted_label, int):
                if 0 <= predicted_label < len(CLASSES):
                    class_name = CLASSES[predicted_label]
                else:
                    stats["skipped"] += 1
                    continue
            else:
                class_name = str(predicted_label)
                if class_name not in CLASSES:
                    stats["skipped"] += 1
                    continue

            # Update stats
            if accepted:
                stats["accepted"] += 1
                stats["by_class"][class_name]["accepted"] += 1
            else:
                stats["rejected"] += 1
                stats["by_class"][class_name]["rejected"] += 1

            # Skip rejected if not including them
            if not accepted and not include_rejected:
                continue

            # Render stroke to image
            img = render_stroke_to_image(stroke)

            # Save image
            img_filename = f"{i:06d}.png"
            img_path = images_dir / img_filename
            Image.fromarray(img).save(img_path)

            # Add to labels
            labels.append({
                "image": img_filename,
                "class": class_name,
                "class_idx": CLASSES.index(class_name),
                "accepted": accepted,
                "confidence": confidence,
                "stroke_points": len(stroke),
                "timestamp": feedback.get("timestamp"),
                "session_id": feedback.get("sessionId"),
            })

            stats["exported"] += 1

        except Exception as e:
            print(f"Warning: Failed to process feedback {i}: {e}")
            stats["skipped"] += 1
            continue

    # Save labels
    labels_path = output_dir / "labels.json"
    with open(labels_path, "w") as f:
        json.dump(labels, f, indent=2)

    # Save metadata
    metadata = {
        "export_date": datetime.now().isoformat(),
        "total_feedback": stats["total"],
        "exported_samples": stats["exported"],
        "classes": CLASSES,
        "img_size": IMG_SIZE,
        "stats": stats,
    }

    metadata_path = output_dir / "metadata.json"
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)

    return stats


def print_stats(stats: Dict):
    """Print export statistics."""
    print("\n" + "=" * 50)
    print("Export Statistics")
    print("=" * 50)
    print(f"Total feedback:  {stats['total']}")
    print(f"Accepted:        {stats['accepted']}")
    print(f"Rejected:        {stats['rejected']}")
    print(f"Exported:        {stats['exported']}")
    print(f"Skipped:         {stats['skipped']}")
    print("\nBy Class:")
    print("-" * 50)

    for cls in CLASSES:
        accepted = stats["by_class"][cls]["accepted"]
        rejected = stats["by_class"][cls]["rejected"]
        total = accepted + rejected
        if total > 0:
            acc_rate = accepted / total * 100
            print(f"  {cls:15s}: {total:5d} total, {acc_rate:5.1f}% accepted")

    print("=" * 50)


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Export feedback data from Firestore for model retraining"
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default="data/feedback",
        help="Output directory for exported data"
    )
    parser.add_argument(
        "--service-account",
        type=str,
        help="Path to Firebase service account JSON file"
    )
    parser.add_argument(
        "--min-date",
        type=str,
        help="Only export feedback after this date (YYYY-MM-DD)"
    )
    parser.add_argument(
        "--max-date",
        type=str,
        help="Only export feedback before this date (YYYY-MM-DD)"
    )
    parser.add_argument(
        "--accepted-only",
        action="store_true",
        help="Only export accepted predictions"
    )
    parser.add_argument(
        "--rejected-only",
        action="store_true",
        help="Only export rejected predictions"
    )
    parser.add_argument(
        "--include-rejected",
        action="store_true",
        default=True,
        help="Include rejected predictions in export (default: True)"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10000,
        help="Maximum number of documents to fetch"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only show statistics, don't export"
    )

    args = parser.parse_args()

    # Parse dates
    min_date = None
    max_date = None

    if args.min_date:
        min_date = datetime.strptime(args.min_date, "%Y-%m-%d")

    if args.max_date:
        max_date = datetime.strptime(args.max_date, "%Y-%m-%d")

    # Initialize Firebase
    print("Initializing Firebase...")
    db = init_firebase(args.service_account)

    # Fetch feedback
    print("Fetching feedback from Firestore...")
    feedback_data = fetch_feedback(
        db,
        min_date=min_date,
        max_date=max_date,
        accepted_only=args.accepted_only,
        rejected_only=args.rejected_only,
        limit=args.limit,
    )

    print(f"Found {len(feedback_data)} feedback documents")

    if len(feedback_data) == 0:
        print("No feedback data found. Make sure:")
        print("  1. Users have opted in to data collection")
        print("  2. The app is deployed and being used")
        print("  3. The service account has read access to Firestore")
        return

    if args.dry_run:
        # Just compute stats without exporting
        stats = {
            "total": len(feedback_data),
            "accepted": sum(1 for f in feedback_data if f.get("accepted", True)),
            "rejected": sum(1 for f in feedback_data if not f.get("accepted", True)),
            "by_class": {cls: {"accepted": 0, "rejected": 0} for cls in CLASSES},
            "exported": 0,
            "skipped": 0,
        }

        for feedback in feedback_data:
            predicted_label = feedback.get("predictedLabel")
            accepted = feedback.get("accepted", True)

            if isinstance(predicted_label, int) and 0 <= predicted_label < len(CLASSES):
                class_name = CLASSES[predicted_label]
            elif predicted_label in CLASSES:
                class_name = predicted_label
            else:
                continue

            if accepted:
                stats["by_class"][class_name]["accepted"] += 1
            else:
                stats["by_class"][class_name]["rejected"] += 1

        print_stats(stats)
        print("\n(Dry run - no data exported)")
        return

    # Export data
    print(f"Exporting to {args.output}...")
    stats = export_to_training_format(
        feedback_data,
        args.output,
        include_rejected=args.include_rejected,
    )

    print_stats(stats)
    print(f"\nData exported to: {args.output}")
    print("  - images/       : Rendered stroke images")
    print("  - labels.json   : Label and metadata for each image")
    print("  - metadata.json : Export statistics")


if __name__ == "__main__":
    main()
