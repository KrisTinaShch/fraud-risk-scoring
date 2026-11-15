# Fraud Risk Scoring

[![Deploy the demo](https://github.com/KrisTinaShch/fraud-risk-scoring/actions/workflows/pages.yml/badge.svg)](https://github.com/KrisTinaShch/fraud-risk-scoring/actions/workflows/pages.yml)

A model that estimates how likely a card payment is to be fraud, trained on the
[IEEE-CIS Fraud Detection](https://www.kaggle.com/competitions/ieee-fraud-detection) data (590,540 e-commerce
payments over six months, 3.5% fraud). The project goes past a single metric: honest time-based validation,
calibrated probabilities, decisions chosen by the cost of errors, and explanations of individual scores.

**Live demo: [kristinashch.github.io/fraud-risk-scoring](https://kristinashch.github.io/fraud-risk-scoring/)** —
change the cost assumptions and see how much money the model saves on the test month, compare the models and
look inside two individual decisions.

## Results

The table is on the test month (days 151–182, 92,427 payments), which was used once, at the very end.

| | LightGBM | Logistic regression |
|---|---|---|
| ROC-AUC | 0.906 | 0.819 |
| PR-AUC (random guess: 0.035) | 0.572 | 0.247 |
| Total loss cut vs approving everything: approve or decline | 67% | 52% |
| Total loss cut vs approving everything: approve, confirm or decline | **79%** | 69% |

The total loss counts missed fraud plus the cost of declined and confirmed honest customers.

- **A random split would overstate the model.** On days 1–150, the same LightGBM scores PR-AUC 0.76 on a random
  holdout but 0.58 on the month after its training data. ROC-AUC hides most of the gap (0.95 vs 0.92).
- **PR-AUC, not ROC-AUC.** With 3.5% fraud every model has a high ROC-AUC. A better view: on the validation month,
  when 1% of honest payments are flagged, LightGBM catches 56.9% of fraud and logistic regression 23.5%.
- **Calibration.** On the validation month raw scores were off in opposite directions (mean 5.30% for logistic
  regression, 2.00% for LightGBM, against 3.41% actual fraud). Platt scaling fixed the level without changing the
  ranking. For LightGBM it held on test (3.65% predicted against 3.48% actual); logistic regression overestimates
  again (4.10%).
- **Decisions by the cost of errors.** Each payment gets the action with the lowest expected loss. A missed
  fraud costs its amount plus a $20 chargeback fee, declining an honest customer $10, and an SMS confirmation
  $2, passed by 10% of fraudsters. With a confirmation step LightGBM cuts the total loss by 79%, about $437,000 in
  one month: missed fraud alone falls by 89%. It declines 1,039 honest customers instead of 7,900, but asks 21,023
  (24%) to confirm. Logistic regression with three actions (69%) beats LightGBM with two (67%), at the price of
  asking 46% of honest customers to confirm: the decision rule matters as much as the model.
- **Feature engineering.** The day a card was first seen (`card_start_day` = day − D1) raised validation
  PR-AUC from 0.589 to 0.602 (mean over random seeds) and is the 3rd most important of 440 columns by SHAP.
- **Quality drops in the first weeks, then holds.** PR-AUC is 0.654 on the validation month (optimistic: trees,
  parameters and features were chosen on it), 0.552 on its second half and 0.572 on the test month. Frequent
  retraining would keep the model in its strongest weeks.

## How it was built

| Notebook | Question | What it shows |
|---|---|---|
| [01_eda](notebooks/01_eda.ipynb) | What does the data look like? | Fraud by day, hour, product, card type and device; missing values; amounts |
| [02_time_split](notebooks/02_time_split.ipynb) | How to validate honestly? | Train on days 1–120, choose on 121–150, test on 151–182; random vs time split |
| [03_features](notebooks/03_features.ipynb) | Which features help? | Card start day and D-column start days kept; time, cents and client aggregates gave no gain beyond seed noise |
| [04_baselines](notebooks/04_baselines.ipynb) | What does a simple model give? | Random-guess reference, logistic regression, random forest |
| [05_boosting](notebooks/05_boosting.ipynb) | How far do boosted trees go? | LightGBM with early stopping, CatBoost, Optuna tuning |
| [06_metrics](notebooks/06_metrics.ipynb) | Which metric to trust? | ROC vs PR curves, fraud caught at 1% false alarms |
| [07_decisions](notebooks/07_decisions.ipynb) | What are the scores worth? | Calibration, cost of errors, approve / confirm / decline, final test |
| [08_shap](notebooks/08_shap.ipynb) | Why does the model flag a payment? | Global importance, direction of effects, reason codes for single payments |

Rules followed throughout: the split is by time, anything learned from data is fitted on train only
(calibration on the validation month), and a new feature is kept only if its gain beats the noise between
random seeds.

## Project structure

```
├── demo/                    static demo site, deployed to GitHub Pages
├── notebooks/               01–08: analysis, experiments and decisions
├── scripts/export_demo.py   trains the final models and exports aggregated results for the demo
├── src/fraud/               data loading, time split, features, models, decision rule
├── tests/                   pytest: time split, features, decision rule
└── .github/workflows/       publishes demo/ on every change
```

Stack: Python 3.12, uv, pandas, scikit-learn, LightGBM, CatBoost, Optuna, SHAP, pytest, ruff. The demo is plain
HTML, CSS and JavaScript with hand-drawn SVG charts.

## Reproduce

The data is not in the repository: the competition rules do not allow redistributing it. You need a Kaggle
account and to accept the [competition rules](https://www.kaggle.com/competitions/ieee-fraud-detection/rules).

```bash
git clone https://github.com/KrisTinaShch/fraud-risk-scoring.git
cd fraud-risk-scoring
uv sync
uv run kaggle auth login
uv run kaggle competitions download ieee-fraud-detection -p data/raw
```

Unzip the archive into `data/raw/`. The first call to `load_train()` merges the CSV files and caches them as
`data/interim/train.parquet`. Columns are stored compactly (float32 and categories), so the table takes about
1 GB of memory. The notebooks use `n_jobs=8`: lower it on smaller machines. Notebook 05 trains CatBoost on a GPU;
switch it to CPU if there is none.

```bash
uv run pytest                            # tests, no data needed
uv run jupyter lab                       # run notebooks 01–08 in order
uv run python scripts/export_demo.py     # refresh demo/results.json
uv run python -m http.server 8765 --directory demo   # view the demo at http://localhost:8765
```

## Limitations

- The costs are assumptions, not Vesta's figures; the demo shows how the result moves with them.
- A reported chargeback also marks the card's later payments as fraud, and the newest labels may not be final:
  there is no gap between the training data and the validation month.
- Most columns are masked by Vesta, so explanations often name a column whose meaning is unknown.
- One test month: other periods may give other numbers.
- The exploratory analysis in notebook 01 looked at the labels of all six months, test included. No feature,
  model or threshold was chosen there; features were kept only by their gain on the validation month.

Possible next steps: client-level features computed from past payments only, judged on Kaggle's own test set
through a late submission; rolling-window validation.

## License

Code: [MIT](LICENSE). The data belongs to Vesta Corporation and is used under the Kaggle competition rules; it is
not covered by this license.
