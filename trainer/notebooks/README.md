# EDA notebooks

- **`01_feature_eda.ipynb`** — feature-engineering exploration: importance
  (mutual info + RandomForest), redundancy (correlation), per-class signatures,
  PCA separability, the geometric accuracy ceiling, and concrete recommendations
  for new engineered features. Outputs are pre-rendered; re-run to refresh.

```bash
cd trainer
pip install -r requirements.txt        # training deps (TF, sklearn, …)
pip install -r notebooks/requirements.txt   # plotting + jupyter
jupyter lab notebooks/01_feature_eda.ipynb
# or re-execute headless:
jupyter nbconvert --to notebook --execute --inplace notebooks/01_feature_eda.ipynb
```

The notebook imports `data.py` from the parent folder, so run it from `trainer/`.
