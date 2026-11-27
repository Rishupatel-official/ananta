"""Load our trusted, fitted scikit-learn bundle and make monthly predictions."""
from __future__ import annotations

import hashlib
import json
import math
import pickle
import platform
import re
from importlib.metadata import version
from pathlib import Path

import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.utils.validation import check_is_fitted

DEFAULT_MODEL = Path(__file__).with_name("model.pkl")
FEATURES = ["elapsed_years"] + [f"month_{m:02d}" for m in range(2, 13)]
TARGETS = ["min_temp", "max_temp", "rainfall"]


def runtime_versions():
    return {"python": platform.python_version(), **{
        name: version(name) for name in ("scikit-learn", "numpy", "scipy", "joblib", "threadpoolctl")}}


def month_index(month: str) -> int:
    if not isinstance(month, str) or not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        raise ValueError("Use a valid YYYY-MM month.")
    return int(month[:4]) * 12 + int(month[5:]) - 1


def month_label(index: int) -> str:
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def save_bundle(path: Path, metadata: dict, models: dict) -> dict:
    """Persist the actual fitted estimators, together with their input contract."""
    bundle = {"formatVersion": 1, "versions": runtime_versions(),
              "metadata": metadata, "models": models}
    ClimateModel(bundle)  # Validate before writing.
    payload = pickle.dumps(bundle, protocol=5)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    info = {"formatVersion": 1, "sha256": hashlib.sha256(payload).hexdigest(),
            "versions": bundle["versions"], "stateCount": len(models),
            **{key: metadata[key] for key in ("algorithm", "dataKind", "inputSha256",
                "trainingStart", "trainingEnd", "forecastStart", "forecastEnd", "featureOrder", "targetOrder")}}
    path.with_suffix(".info.json").write_text(json.dumps(info, indent=2) + "\n", encoding="utf-8")
    return info


class ClimateModel:
    def __init__(self, bundle: dict):
        if bundle.get("formatVersion") != 1:
            raise ValueError("Unsupported Python model format.")
        expected = bundle["versions"]
        for name, current in runtime_versions().items():
            saved = expected[name]
            matches = saved.split(".")[:2] == current.split(".")[:2] if name == "python" else saved == current
            if not matches:
                raise ValueError(f"Model requires {name} {saved}; installed {current}. Install the pinned requirements.")
        self.metadata = bundle["metadata"]
        self.models = bundle["models"]
        if (self.metadata.get("schemaVersion") != 1 or self.metadata.get("featureOrder") != FEATURES
                or self.metadata.get("targetOrder") != TARGETS):
            raise ValueError("Unsupported feature or target contract.")
        start, end = month_index(self.metadata["forecastStart"]), month_index(self.metadata["forecastEnd"])
        if not 0 <= end - start <= 11:
            raise ValueError("The supported forecast window is at most 12 months.")
        self.months = [month_label(i) for i in range(start, end + 1)]
        if not self.models or set(self.models) != set(self.metadata["states"]):
            raise ValueError("The bundle's state models do not match its metadata.")
        for model in self.models.values():
            if not isinstance(model, LinearRegression):
                raise ValueError("Expected a fitted scikit-learn LinearRegression.")
            check_is_fitted(model)
            if (model.n_features_in_ != 12 or model.coef_.shape != (3, 12)
                    or model.intercept_.shape != (3,) or not np.isfinite(model.coef_).all()
                    or not np.isfinite(model.intercept_).all()):
                raise ValueError("Invalid fitted coefficient dimensions or values.")

    @classmethod
    def load(cls, path: str | Path = DEFAULT_MODEL):
        # This is a deployment-owned artifact, never a user-uploaded pickle.
        path = Path(path)
        payload = path.read_bytes()
        info = json.loads(path.with_suffix(".info.json").read_text(encoding="utf-8"))
        if hashlib.sha256(payload).hexdigest() != info["sha256"]:
            raise ValueError("The model file does not match model.info.json. Re-export the bundle.")
        return cls(pickle.loads(payload))

    def predict(self, state: str, month: str) -> dict:
        if state not in self.models:
            raise ValueError("No trained model for this state. Use a name returned by /model.")
        index = month_index(month)
        if month not in self.months:
            raise ValueError(f"Choose a month from {self.months[0]} through {self.months[-1]}.")
        calendar_month = index % 12 + 1
        x = np.array([[(index // 12 - self.metadata["baseYear"]) + (calendar_month - 1) / 12]
                     + [float(calendar_month == m) for m in range(2, 13)]])
        values = self.models[state].predict(x)[0]
        if not np.isfinite(values).all():
            raise ValueError("The model produced non-finite predictions.")
        low, high = sorted(float(v) for v in values[:2])
        return {"state": state, "month": month, "minTemp": low, "maxTemp": high,
                "meanTemp": (low + high) / 2, "rainfall": max(0.0, float(values[2]))}

    def forecast(self, state: str, start_month: str | None = None, horizon: int = 12) -> list[dict]:
        if type(horizon) is not int or not 1 <= horizon <= 12:
            raise ValueError("Horizon must be a whole number from 1 to 12.")
        start = month_index(start_month or self.months[0])
        requested = [month_label(start + i) for i in range(horizon)]
        if any(month not in self.months for month in requested):
            raise ValueError(f"All requested months must be between {self.months[0]} and {self.months[-1]}.")
        return [self.predict(state, month) for month in requested]

    def simulate(self, state: str, month: str, temperature_change: float = 0,
                 rainfall_percent: float = 0) -> dict:
        for value, low, high, label in ((temperature_change, -3, 5, "Temperature change"),
                                        (rainfall_percent, -50, 50, "Rainfall percentage")):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
                raise ValueError(f"{label} must be between {low} and {high}.")
        baseline = self.predict(state, month)
        scenario = {**baseline, **{key: baseline[key] + temperature_change
                                   for key in ("minTemp", "maxTemp", "meanTemp")},
                    "rainfall": baseline["rainfall"] * (1 + rainfall_percent / 100)}
        return {"baseline": baseline, "scenario": scenario,
                "temperatureChange": temperature_change, "rainfallPercent": rainfall_percent}
