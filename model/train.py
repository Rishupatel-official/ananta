"""Train a transparent monthly regression without modifying the source database.

Usage: python model/train.py --database path/to/climate_data.db --data-kind synthetic
Only complete state-months are used. All fitting for evaluation precedes the test dates.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import LinearRegression

ROOT = Path(__file__).resolve().parents[1]
TARGETS = ["min_temp", "max_temp", "rainfall"]
METRICS = ["min_temp", "max_temp", "rainfall", "mean_temp"]
FEATURES = ["elapsed_years"] + [f"month_{m:02d}" for m in range(2, 13)]


def aggregate_monthly(raw: pd.DataFrame):
    """Exclude incomplete months; never fill absent rainfall with zero."""
    df = raw.copy()
    if df.empty:
        raise ValueError("The database has no climate rows.")
    df["date"] = pd.to_datetime(df["date"], format="%Y-%m-%d", errors="raise")
    if df["date"].isna().any() or df["state"].isna().any():
        raise ValueError("A date or state is missing.")
    if df.duplicated(["state", "date"]).any():
        raise ValueError("Duplicate state/date rows must be resolved before training.")
    for col in TARGETS:
        df[col] = pd.to_numeric(df[col], errors="raise")
        if np.isinf(df[col].dropna()).any():
            raise ValueError(f"Infinite values in {col}.")
    if (df["rainfall"].dropna() < 0).any() or (df["min_temp"] > df["max_temp"]).any():
        raise ValueError("Invalid rainfall or minimum/maximum temperatures.")
    df["month"] = df["date"].dt.to_period("M")
    grouped = df.groupby(["state", "month"], sort=True)
    counts = grouped[TARGETS].count()
    daily_count = grouped.size()
    expected = np.array([period.days_in_month for _, period in counts.index])
    complete = (counts.eq(expected, axis=0).all(axis=1) & daily_count.eq(expected))
    monthly = grouped.agg(min_temp=("min_temp", "mean"), max_temp=("max_temp", "mean"),
                          rainfall=("rainfall", lambda s: s.sum(min_count=1)))
    monthly = monthly.loc[complete].reset_index()
    if monthly.empty:
        raise ValueError("No complete state-months remain after validation.")
    excluded = [{"state": s, "month": str(m)} for s, m in complete.index[~complete]]
    audit = {"rowCount": len(df), "stateCount": int(df.state.nunique()),
             "firstDate": str(df.date.min().date()), "lastDate": str(df.date.max().date()),
             "missingValues": {col: int(df[col].isna().sum()) for col in TARGETS},
             "completeStateMonths": len(monthly), "excludedStateMonths": len(excluded),
             "excludedMonths": excluded}
    return monthly, audit


def features(months, base_year: int):
    periods = pd.PeriodIndex(months, freq="M")
    elapsed = (periods.year - base_year) + (periods.month - 1) / 12
    return np.column_stack([elapsed] + [(periods.month == m).astype(float) for m in range(2, 13)])


def postprocess(values):
    result = np.asarray(values, dtype=float).copy()
    result[:, :2] = np.sort(result[:, :2], axis=1)
    result[:, 2] = np.maximum(0, result[:, 2])
    return result


def metrics(actual, predicted):
    actual = np.column_stack([actual, np.mean(actual[:, :2], axis=1)])
    predicted = np.column_stack([predicted, np.mean(predicted[:, :2], axis=1)])
    diff = predicted - actual
    return {key: {"mae": float(np.mean(np.abs(diff[:, i]))),
                  "rmse": float(np.sqrt(np.mean(diff[:, i] ** 2)))}
            for i, key in enumerate(METRICS)}


def train(monthly: pd.DataFrame, audit: dict, data_kind: str, digest: str):
    first = monthly.month.min()
    last = monthly.month.max()
    cutoff = last - 23  # Last 24 calendar months, never a random split.
    base_year = first.year
    states = {}
    actual_all, model_all, baseline_all = [], [], []
    fixtures = []
    future = pd.period_range(last + 1, periods=12, freq="M")
    for state, data in monthly.groupby("state", sort=True):
        data = data.sort_values("month")
        training = data[data.month < cutoff]
        testing = data[data.month >= cutoff]
        if len(training) < 36 or len(testing) < 12 or training.month.map(lambda p: p.month).nunique() < 12:
            raise ValueError(f"Insufficient complete training/held-out months for {state}.")
        x_train = features(training.month, base_year)
        if np.linalg.matrix_rank(np.column_stack([np.ones(len(x_train)), x_train])) != 13:
            raise ValueError(f"Training features are not full rank for {state}.")
        evaluation_model = LinearRegression().fit(x_train, training[TARGETS].to_numpy())
        raw_prediction = evaluation_model.predict(features(testing.month, base_year))
        predicted = postprocess(raw_prediction)
        climatology = training.assign(calendar_month=training.month.map(lambda p: p.month)).groupby("calendar_month")[TARGETS].mean()
        baseline = climatology.loc[testing.month.map(lambda p: p.month)].to_numpy()
        actual = testing[TARGETS].to_numpy()
        evaluation = {"trainMonths": len(training), "testMonths": len(testing),
                      "trainFirst": str(training.month.min()), "trainLast": str(training.month.max()),
                      "testFirst": str(testing.month.min()), "testLast": str(testing.month.max()),
                      "model": metrics(actual, predicted), "baseline": metrics(actual, baseline),
                      "clippedRainMonths": int((raw_prediction[:, 2] < 0).sum()),
                      "reorderedTemperatureMonths": int((raw_prediction[:, 0] > raw_prediction[:, 1]).sum())}
        deployed = LinearRegression().fit(features(data.month, base_year), data[TARGETS].to_numpy())
        states[state] = {"intercepts": deployed.intercept_.tolist(), "coefficients": deployed.coef_.tolist(),
                         "fitMonths": len(data), "fitFirst": str(data.month.min()),
                         "fitLast": str(data.month.max()), "evaluation": evaluation}
        actual_all.append(actual)
        model_all.append(predicted)
        baseline_all.append(baseline)
        scored = postprocess(deployed.predict(features(future, base_year)))
        for month, values in zip(future, scored):
            fixtures.append({"state": state, "month": str(month), "minTemp": float(values[0]),
                             "maxTemp": float(values[1]), "rainfall": float(values[2]),
                             "meanTemp": float((values[0] + values[1]) / 2)})
    actual_all = np.concatenate(actual_all)
    model_all = np.concatenate(model_all)
    baseline_all = np.concatenate(baseline_all)
    artifact = {"schemaVersion": 1, "algorithm": "Ordinary least squares: trend + month indicators",
                "dataKind": data_kind, "inputSha256": digest, "baseYear": base_year,
                "featureOrder": FEATURES, "targetOrder": TARGETS,
                "trainingStart": str(first), "trainingEnd": str(last),
                "forecastStart": str(future[0]), "forecastEnd": str(future[-1]),
                "evaluationStart": str(cutoff), "evaluationEnd": str(last),
                "evaluationMonths": len(actual_all),
                "pooledEvaluation": {"model": metrics(actual_all, model_all), "baseline": metrics(actual_all, baseline_all)},
                "audit": {key: value for key, value in audit.items() if key != "excludedMonths"},
                "states": states}
    report = {"method": artifact["algorithm"], "dataKind": data_kind,
              "versions": {"scikit-learn": sklearn.__version__, "pandas": pd.__version__, "numpy": np.__version__},
              "inputSha256": digest, "audit": audit,
              "evaluationStart": str(cutoff), "evaluationEnd": str(last),
              "pooledEvaluation": artifact["pooledEvaluation"],
              "states": {s: v["evaluation"] for s, v in states.items()},
              "limitations": ["Synthetic input is not observed weather.",
                              "A single temporal holdout is not proof of future skill.",
                              "Metrics cover complete state-months only; units are degrees C and monthly mm.",
                              "The deployed models are refit on all complete months after evaluation.",
                              "Mean temperature is estimated as (mean daily minimum + mean daily maximum) / 2.",
                              "Rainfall is clipped at zero; inverted minimum/maximum values are reordered.",
                              "No uncertainty intervals, emissions pathways or crop/water impact models.",
                              "The app limits projections to 12 months; simulations are user-defined perturbations."]}
    return artifact, report, fixtures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--data-kind", required=True, choices=["synthetic", "observed"])
    args = parser.parse_args()
    path = args.database.resolve(strict=True)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    # Read-only URI prevents accidentally creating or changing the user's database.
    with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as conn:
        raw = pd.read_sql_query("SELECT date, state, min_temp, max_temp, rainfall FROM daily_climate", conn)
    monthly, audit = aggregate_monthly(raw)
    artifact, report, fixtures = train(monthly, audit, args.data_kind, digest)
    for destination, content in [(ROOT / "src/data/regression-model.json", artifact),
                                 (ROOT / "model/evaluation.json", report),
                                 (ROOT / "model/prediction-fixtures.json", fixtures)]:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(content, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"audit": artifact["audit"], "evaluation": artifact["pooledEvaluation"],
                      "forecastStart": artifact["forecastStart"], "forecastEnd": artifact["forecastEnd"]}, indent=2))


if __name__ == "__main__":
    main()
