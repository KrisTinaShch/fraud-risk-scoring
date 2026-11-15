"""Export the aggregated results shown on the demo site.

Trains logistic regression and the tuned LightGBM as in notebook 07, calibrates both with Platt scaling on valid
and writes only aggregates to demo/results.json: totals of the decision rule on test for a grid of cost
assumptions, ROC / PR / calibration curves, metrics and SHAP explanations. No data rows are written.

Usage: uv run python scripts/export_demo.py [--sample]   (--sample: tiny run to check the code, not for the site)
"""

import argparse
import json
from itertools import product

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
)

from fraud.data import PROJECT_ROOT, load_train
from fraud.decisions import DECLINE_COST, VERIFY_COST, choose_actions, total_loss
from fraud.features import add_features
from fraud.models import make_lightgbm, make_logreg
from fraud.split import time_split

NON_FEATURES = ["isFraud", "TransactionDT", "TransactionID"]

FRAUD_FEES = [0, 10, 20, 30, 40, 50]
DECLINE_COSTS = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50]
VERIFY_COSTS = [0.5, 1, 2, 3, 5, 7, 10]
VERIFY_PASSES = [0, 0.05, 0.1, 0.2, 0.3, 0.5]
FIELDS = [
    "honest_declined",
    "honest_verified",
    "fraud_declined",
    "fraud_verified",
    "fraud_verified_amount",
    "fraud_approved",
    "fraud_approved_amount",
]


def decide(
    probs, amount, fee, decline_cost, verify_cost, verify_pass, three_actions=True
):
    """Cheapest action by expected loss; returns the verify and decline masks."""
    approve_loss = probs * (amount + fee)
    decline_loss = (1 - probs) * decline_cost
    if not three_actions:
        return np.zeros_like(probs, dtype=bool), decline_loss < approve_loss
    verify_loss = (1 - probs) * verify_cost + probs * verify_pass * (amount + fee)
    decline = (decline_loss < approve_loss) & (decline_loss < verify_loss)
    verify = ~decline & (verify_loss < approve_loss)
    return verify, decline


def summarize(fraud, amount, verify, decline):
    """Counts and fraud amounts per action, in the order of FIELDS."""
    approve = ~verify & ~decline
    honest = ~fraud
    return [
        int((honest & decline).sum()),
        int((honest & verify).sum()),
        int((fraud & decline).sum()),
        int((fraud & verify).sum()),
        round(float(amount[fraud & verify].sum()), 2),
        int((fraud & approve).sum()),
        round(float(amount[fraud & approve].sum()), 2),
    ]


def loss_from_summary(row, fee, decline_cost, verify_cost, verify_pass):
    hd, hv, _, fv, fv_amount, fa, fa_amount = row
    return (
        fa_amount
        + fee * fa
        + verify_pass * (fv_amount + fee * fv)
        + verify_cost * hv
        + decline_cost * hd
    )


def pr_points(y, probs):
    """Interpolated precision on a fixed recall grid (precision = best one at this recall or higher)."""
    precision, recall, _ = precision_recall_curve(y, probs)
    recall_up, precision_up = recall[::-1], precision[::-1]
    envelope = np.maximum.accumulate(precision_up[::-1])[::-1]
    grid = np.linspace(0, 1, 101)
    idx = np.minimum(np.searchsorted(recall_up, grid, side="left"), len(envelope) - 1)
    return {
        "recall": grid.round(3).tolist(),
        "precision": envelope[idx].round(4).tolist(),
    }


def roc_points(y, probs):
    fpr, tpr, _ = roc_curve(y, probs)
    grid = np.unique(np.concatenate([np.logspace(-4, 0, 60), np.linspace(0, 1, 51)]))
    return {
        "fpr": grid.round(5).tolist(),
        "tpr": np.interp(grid, fpr, tpr).round(4).tolist(),
    }


def calibration_points(y, probs):
    edges = np.linspace(0, 1, 11)
    counts = np.histogram(probs, bins=edges)[0]
    actual, predicted = calibration_curve(y, probs, n_bins=10)
    return {
        "predicted": predicted.round(4).tolist(),
        "actual": actual.round(4).tolist(),
        "count": counts[counts > 0].tolist(),
    }


def receipt(contrib, names, i, top=9):
    """One SHAP receipt: base value, the largest contributions, the rest together and the final score."""
    values = pd.Series(contrib[i, :-1], index=names)
    largest = values.reindex(values.abs().sort_values(ascending=False).index[:top])
    return {
        "base": round(float(contrib[i, -1]), 3),
        "features": largest.index.tolist(),
        "values": largest.round(3).tolist(),
        "rest": round(float(values.sum() - largest.sum()), 3),
        "score": round(float(contrib[i].sum()), 3),
        "rest_count": int(len(values) - top),
    }


def main(sample: bool) -> None:
    df = add_features(load_train())
    train, valid, test = time_split(df)
    if sample:
        train, valid, test = train.head(20000), valid.head(8000), test.head(8000)

    X_train, y_train = train.drop(columns=NON_FEATURES), train["isFraud"]
    X_valid, y_valid = valid.drop(columns=NON_FEATURES), valid["isFraud"]
    X_test, y_test = test.drop(columns=NON_FEATURES), test["isFraud"]

    lr_cols = [c for c in X_train.columns if not c.startswith("V")]
    cat_cols = X_train[lr_cols].select_dtypes("category").columns.tolist()
    num_cols = [c for c in lr_cols if c not in cat_cols]
    logreg = make_logreg(num_cols, cat_cols)
    logreg.fit(X_train, y_train)
    print("logistic regression trained", flush=True)

    lgbm = make_lightgbm(seed=42, n_jobs=8)
    if sample:
        lgbm.set_params(n_estimators=30)
    lgbm.fit(
        X_train,
        y_train,
        eval_X=X_valid,
        eval_y=y_valid,
        callbacks=[lgb.early_stopping(100, verbose=False)],
    )
    print(f"LightGBM trained, trees: {lgbm.best_iteration_}", flush=True)

    raw = {
        "logreg": (logreg.decision_function(X_valid), logreg.decision_function(X_test)),
        "lightgbm": (
            lgbm.predict(X_valid, raw_score=True),
            lgbm.predict(X_test, raw_score=True),
        ),
    }
    labels = {"logreg": "Logistic regression", "lightgbm": "LightGBM"}

    amount = test["TransactionAmt"].to_numpy()
    fraud = y_test.to_numpy() == 1
    y = y_test.to_numpy()
    day = (test["TransactionDT"] // 86400).to_numpy()

    models = {}
    for key, (raw_valid, raw_test) in raw.items():
        platt = LogisticRegression()
        platt.fit(raw_valid.reshape(-1, 1), y_valid)
        probs = platt.predict_proba(raw_test.reshape(-1, 1))[:, 1]

        three = [
            summarize(fraud, amount, *decide(probs, amount, f, d, v, p))
            for f, d, v, p in product(
                FRAUD_FEES, DECLINE_COSTS, VERIFY_COSTS, VERIFY_PASSES
            )
        ]
        two = [
            summarize(
                fraud, amount, *decide(probs, amount, f, d, 0, 0, three_actions=False)
            )
            for f, d in product(FRAUD_FEES, DECLINE_COSTS)
        ]

        # Parity with src/fraud/decisions.py at the default costs (the numbers of notebook 07).
        for rule, price in [
            ("two actions", DECLINE_COST),
            ("three actions", VERIFY_COST),
        ]:
            verify, decline = choose_actions(probs, amount, verify_cost=price)
            module_loss = total_loss(fraud, amount, verify, decline, verify_cost=price)
            if rule == "three actions":
                i = list(
                    product(FRAUD_FEES, DECLINE_COSTS, VERIFY_COSTS, VERIFY_PASSES)
                ).index((20, 10, 2, 0.1))
                grid_loss = loss_from_summary(three[i], 20, 10, 2, 0.1)
            else:
                i = list(product(FRAUD_FEES, DECLINE_COSTS)).index((20, 10))
                grid_loss = loss_from_summary(two[i], 20, 10, 0, 0)
            print(
                f"{labels[key]}, {rule}: module ${module_loss:,.0f}, grid ${grid_loss:,.0f}",
                flush=True,
            )

        models[key] = {
            "label": labels[key],
            "metrics": {
                "roc_auc": round(float(roc_auc_score(y, probs)), 4),
                "pr_auc": round(float(average_precision_score(y, probs)), 4),
                "brier": round(float(brier_score_loss(y, probs)), 4),
                "mean_predicted": round(float(probs.mean()), 4),
            },
            "three": three,
            "two": two,
            "pr": pr_points(y, probs),
            "roc": roc_points(y, probs),
            "calibration": calibration_points(y, probs),
        }
        print(f"{labels[key]}: {models[key]['metrics']}", flush=True)

    shap_sample = X_valid.sample(min(5000, len(X_valid)), random_state=42)
    contrib = lgbm.predict(shap_sample, pred_contrib=True)
    names = shap_sample.columns.tolist()
    importance = pd.Series(
        np.abs(contrib[:, :-1]).mean(axis=0), index=names
    ).sort_values(ascending=False)
    shap_fraud = y_valid.loc[shap_sample.index].to_numpy() == 1
    scores = contrib.sum(axis=1)
    missed = int(np.flatnonzero(shap_fraud)[scores[shap_fraud].argmin()])
    shap = {
        "sample_size": len(shap_sample),
        "frauds_in_sample": int(shap_fraud.sum()),
        "importance": {
            "features": importance.index[:15].tolist(),
            "values": importance.iloc[:15].round(4).tolist(),
        },
        "flagged": receipt(contrib, names, int(scores.argmax())),
        "missed": receipt(contrib, names, missed),
    }

    results = {
        "period": {
            "name": "test",
            "first_day": int(day.min()),
            "last_day": int(day.max()),
            "transactions": len(y),
            "frauds": int(fraud.sum()),
            "fraud_amount": round(float(amount[fraud].sum()), 2),
        },
        "defaults": {
            "fraud_fee": 20,
            "decline_cost": 10,
            "verify_cost": 2,
            "verify_pass": 0.1,
        },
        "grid": {
            "fraud_fee": FRAUD_FEES,
            "decline_cost": DECLINE_COSTS,
            "verify_cost": VERIFY_COSTS,
            "verify_pass": VERIFY_PASSES,
            "fields": FIELDS,
        },
        "models": models,
        "shap": shap,
    }
    out = PROJECT_ROOT / "demo" / ("results_sample.json" if sample else "results.json")
    out.write_text(json.dumps(results, separators=(",", ":")), encoding="utf-8")
    print(f"saved {out} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--sample", action="store_true", help="tiny run to check the code"
    )
    main(parser.parse_args().sample)
