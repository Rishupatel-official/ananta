# Monthly regression prototype

The app includes fitted coefficients and `model/model.pkl`, a Python bundle of
the 36 fitted scikit-learn estimators. The dashboard calls the Flask API, which
loads the pickle. The JSON retains metadata and comparison coefficients for tests.
See `backend/README.txt` for Python usage and deployment.
Use Python 3.12 and the pinned requirements for the saved pickle.

From the project folder in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r model/requirements.txt
.\.venv\Scripts\python.exe model/train.py --database "C:\Users\rishu\OneDrive\Desktop\climate-twin--main\data\climate_data.db" --data-kind synthetic
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Change the database path if needed. Activation of the environment is unnecessary.
The script opens SQLite read-only and never runs the original data_pipeline.py.
It replaces the model JSON, evaluation JSON and prediction fixtures in this project,
and saves `model/model.pkl` plus `model/model.info.json` with the checksum and versions.

## Data and model

SQLite table `daily_climate` must contain `date` (YYYY-MM-DD), `state`, `min_temp`
and `max_temp` in degrees Celsius, and `rainfall` as daily millimetres. Keys must
be unique. Infinite values, negative rainfall and max temperature below min
temperature are rejected. A state-month is retained only if all days and all
three measurements are present. Missing rainfall is never filled with zero.
The exclusion list is in evaluation.json. Fully absent state-months have no rows
and are not included in that exclusion count. Missingness can bias evaluation.

Each state fits ordinary least squares with three outputs:

`target = intercept + trend * elapsed_years + month-specific offset`

January is the reference month; 11 indicators encode February–December. This is
linear regression with multiple inputs, rather than one line through seasonal
weather. Targets: monthly average daily minimum, monthly average daily maximum,
and monthly total rainfall. The approximate mean temperature is the average of
min/max, not a measured hourly mean.

Reference: [scikit-learn LinearRegression](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LinearRegression.html).

## Evaluation and deployment

1. Aggregate complete months without interpolation or random sampling.
2. Reserve the final 24 calendar months for testing and fit only earlier months.
3. Compare with a training-only historical average for each calendar month.
4. Report MAE and RMSE per state and across all retained test state-months.
5. Refit using all complete data and export coefficients as JSON.
6. Export independent Python scores for the next 12 months for verification.

At least 36 training months, all calendar months represented, and 12 complete
test months per state are required. Training/test dates never overlap. The final
refit differs from the model used for holdout metrics. Pooled scores weight each
retained state-month equally; they are not area/population-weighted national scores.

Supplied data: 223,524 daily rows, 36 states/UTs, 7,018 complete state-months,
326 incomplete state-months excluded. Train 2010–2024, test 2025–2026; refit
2010–2026; project Jan–Dec 2027. Some states end earlier due to missing values;
their exact fit dates appear in the app. Input SHA-256 and library versions are
recorded in evaluation.json.

The generator explicitly supplies synthetic seasonality and a warming trend.
Recovering these patterns does not establish real-world forecasting skill.
Regression rainfall MAE is slightly worse than the seasonal baseline. No calibrated
uncertainty, confidence percentage or long-range emissions pathway is produced.
Both Python and browser calculations clip rainfall at zero and reorder min/max
if necessary. Projection dates are limited to the next 12 source-relative months.

Use `--data-kind observed` only after independently verifying replacement data
provenance and units. Changing the label does not validate a dataset or model.
The window follows the latest complete source month, not today's date. The UI
expects the same state names. Review the report after every retraining.

## Scenarios

`scenario temperature = regression temperature + chosen adjustment`

`scenario rainfall = regression rainfall * (1 + chosen percentage / 100)`

Temperature changes affect both min/max. Rainfall changes are independent. Slider
limits are interface limits, not probability bounds. This is sensitivity analysis,
not a learned causal simulator. Crop yield, water availability and heat-health
impacts require additional data and validated models. Live weather does not
update the fitted coefficients.

## Checks

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s model -p "test_*.py" -v
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Tests include missing records, leap-year aggregation, temporal separation and
scenario limits. All 432 state-month browser predictions are checked against
independent scikit-learn scores. There is no pickle loader or Python server.
