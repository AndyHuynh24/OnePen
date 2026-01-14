
import tensorflow as tf
import sys
from pathlib import Path

# Fix for windows path encoding if needed
sys.path.append(str(Path.cwd() / "src"))

def inspect_model(path):
    print(f"Loading {path}...")
    try:
        model = tf.keras.models.load_model(path)
        print("Model inputs:")
        for inp in model.inputs:
            print(f"  Name: {inp.name}, Shape: {inp.shape}, Dtype: {inp.dtype}")
    except Exception as e:
        print(f"Failed to load: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        inspect_model(sys.argv[1])
    else:
        print("Usage: python inspect_model.py <path_to_keras_model>")
