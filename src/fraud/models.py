"""Model definitions shared by the notebooks."""

import lightgbm as lgb
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

TUNED_PARAMS = {
    "n_estimators": 3000,
    "learning_rate": 0.05,
    "num_leaves": 246,
    "min_child_samples": 24,
    "colsample_bytree": 0.50,
    "subsample": 0.88,
    "subsample_freq": 1,
    "reg_lambda": 0.073,
    "metric": "average_precision",
    "verbose": -1,
}


def make_lightgbm(seed: int, n_jobs: int) -> lgb.LGBMClassifier:
    """LightGBM with the parameters found by Optuna"""
    return lgb.LGBMClassifier(**TUNED_PARAMS, n_jobs=n_jobs, random_state=seed)


def make_logreg(num_cols: list[str], cat_cols: list[str]) -> Pipeline:
    """Logistic regression with median imputation, missing flags, scaling and one-hot categories."""
    numeric = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
            ("scaler", StandardScaler()),
        ]
    )
    preprocess = ColumnTransformer(
        [
            ("num", numeric, num_cols),
            (
                "cat",
                OneHotEncoder(min_frequency=100, handle_unknown="infrequent_if_exist"),
                cat_cols,
            ),
        ]
    )
    return Pipeline(
        [
            ("preprocessor", preprocess),
            ("classifier", LogisticRegression(max_iter=1000)),
        ]
    )
