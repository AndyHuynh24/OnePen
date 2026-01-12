.PHONY: install install-dev lint format test dataset train export clean

# Install package in development mode
install:
	pip install -e .

# Install with dev dependencies
install-dev:
	pip install -e ".[dev]"

# Run linter
lint:
	ruff check src/ scripts/

# Format code
format:
	ruff format src/ scripts/

# Run tests
test:
	pytest tests/ -v

# Prepare dataset (exports to data/processed/)
dataset:
	python scripts/dataset.py --config config/config.yaml

# Train model
train:
	python scripts/train.py --config config/config.yaml

# Train with fewer epochs (for testing)
train-quick:
	python scripts/train.py --config config/config.yaml --epochs 5

# Export model to TensorFlow.js
export:
	python scripts/export.py --model outputs/latest/checkpoints/best_model.keras

# Clean generated files
clean:
	rm -rf outputs/
	rm -rf mlruns/
	rm -rf logs/
	rm -rf __pycache__/
	rm -rf src/**/__pycache__/
	rm -rf .pytest_cache/
	rm -rf *.egg-info/

# Help
help:
	@echo "Available targets:"
	@echo "  install      - Install package in development mode"
	@echo "  install-dev  - Install with dev dependencies"
	@echo "  lint         - Run linter"
	@echo "  format       - Format code"
	@echo "  test         - Run tests"
	@echo "  dataset      - Prepare training dataset"
	@echo "  train        - Train the model"
	@echo "  train-quick  - Train with 5 epochs (testing)"
	@echo "  export       - Export to TensorFlow.js"
	@echo "  clean        - Clean generated files"
