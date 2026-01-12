"""Data loading utilities for stroke classification."""

import json
from pathlib import Path
from typing import Any

from modifiers.utils.logging import get_logger

logger = get_logger("onepen.data")

def load_json_file(file_path: Path) -> list[dict[str, Any]]:
    """Load stroke data from a JSON file.

    Args:
        file_path: Path to the JSON file.

    Returns:
        List of modifier dictionaries with 'type' and 'stroke' keys.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Handle both formats: {"modifiers": [...]} or [...]
        if isinstance(data, dict):
            modifiers = data.get("modifiers", [])
        else:
            modifiers = data

        return modifiers

    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse JSON {file_path}: {e}")
        return []
    except Exception as e:
        logger.warning(f"Failed to load {file_path}: {e}")
        return []

def load_contributor_data(
    contributor_path: Path,
    valid_classes: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Load all stroke data from a single contributor folder.

    Each stroke object in the JSON files should have a 'type' key
    that specifies the class name.

    Args:
        contributor_path: Path to contributor's data folder.
        valid_classes: Optional list of class names to include.

    Returns:
        List of stroke dictionaries with class names from the 'type' field.
    """
    if not contributor_path.exists():
        logger.warning(f"Contributor path not found: {contributor_path}")
        return []

    all_strokes = []
    json_files = list(contributor_path.glob("*.json"))

    for json_file in json_files:
        modifiers = load_json_file(json_file)

        for mod in modifiers:
            stroke = mod.get("stroke", [])
            if len(stroke) < 2:
                continue

            # Get class name from the 'type' field inside the JSON
            class_name = mod.get("type")
            if class_name is None:
                logger.warning(f"Missing 'type' field in {json_file.name}, skipping stroke")
                continue

            class_name = class_name.strip().lower()

            # Filter by valid classes if specified 
            if valid_classes and class_name not in valid_classes:
                continue

            all_strokes.append({
                "type": class_name,
                "stroke": stroke,
                "source_file": json_file.name,
                "contributor": contributor_path.name,
            })

    logger.info(
        f"Loaded {len(all_strokes)} strokes from {contributor_path.name} "
        f"({len(json_files)} files)"
    )
    return all_strokes


def load_all_data(
    data_dir: Path,
    valid_classes: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Load stroke data from all contributors.

    Args:
        data_dir: Root data directory containing contributor folders.
        valid_classes: list of class names to include.

    Returns:
        Combined list of all strokes from all contributors.
    """
    data_dir = Path(data_dir)

    if not data_dir.exists():
        raise FileNotFoundError(f"Data directory not found: {data_dir}")

    all_strokes = []
    contributor_folders = [d for d in data_dir.iterdir() if d.is_dir()]

    for folder in contributor_folders:
        strokes = load_contributor_data(folder, valid_classes)
        all_strokes.extend(strokes)

    logger.info(f"Total strokes loaded: {len(all_strokes)}")

    # Log class distribution
    class_counts = {}
    for s in all_strokes:
        class_counts[s["type"]] = class_counts.get(s["type"], 0) + 1

    logger.info("Class distribution:")
    for cls, count in sorted(class_counts.items()):
        logger.info(f"  {cls}: {count}")

    return all_strokes


class StrokeDataLoader:
    """Data loader class for stroke classification dataset."""

    def __init__(
        self,
        data_dir: str | Path,
        valid_classes: list[str] | None = None,
    ):
        """Initialize the data loader.

        Args:
            data_dir: Path to the root data directory.
            valid_classes: List of valid class names to load.
        """
        self.data_dir = Path(data_dir)
        self.valid_classes = valid_classes
        self._data: list[dict] | None = None

    def load(self) -> list[dict[str, Any]]:
        """Load all data from disk.

        Returns:
            List of stroke dictionaries.
        """
        if self._data is None:
            self._data = load_all_data(self.data_dir, self.valid_classes)
        return self._data

    @property
    def data(self) -> list[dict[str, Any]]:
        """Get loaded data, loading if necessary."""
        return self.load()

    def get_class_counts(self) -> dict[str, int]:
        """Get count of samples per class.

        Returns:
            Dictionary mapping class names to counts.
        """
        counts = {}
        for sample in self.data:
            cls = sample["type"]
            counts[cls] = counts.get(cls, 0) + 1
        return counts

    def __len__(self) -> int:
        """Get total number of samples."""
        return len(self.data)

    def __repr__(self) -> str:
        return f"StrokeDataLoader(data_dir={self.data_dir}, samples={len(self)})"
