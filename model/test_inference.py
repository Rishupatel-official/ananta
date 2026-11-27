import copy
import json
from pathlib import Path
import pickle
import tempfile
import unittest

from model.inference import ClimateModel, DEFAULT_MODEL


class InferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = ClimateModel.load()

    def test_real_sklearn_estimators_match_all_432_existing_predictions(self):
        fixtures = json.loads(Path(__file__).with_name("prediction-fixtures.json").read_text())
        self.assertEqual(len(fixtures), 432)
        self.assertEqual(len(self.model.models), 36)
        for expected in fixtures:
            actual = self.model.predict(expected["state"], expected["month"])
            for key in ("minTemp", "maxTemp", "meanTemp", "rainfall"):
                self.assertAlmostEqual(actual[key], expected[key], places=9)

    def test_rejects_invalid_state_month_and_horizon(self):
        for args in [("Unknown", "2027-01"), ("Delhi", "2028-01"), ("Delhi", "2027-13"), ("Delhi", "2027-1")]:
            with self.assertRaises(ValueError):
                self.model.predict(*args)
        for horizon in [0, 13, True, 1.5]:
            with self.assertRaises(ValueError):
                self.model.forecast("Delhi", horizon=horizon)
        with self.assertRaises(ValueError):
            self.model.forecast("Delhi", "2027-12", 2)
        self.assertEqual(len(self.model.forecast("Delhi", "2027-12", 1)), 1)

    def test_simulation_reset_and_boundary_adjustments(self):
        result = self.model.simulate("Delhi", "2027-07", 5, -50)
        self.assertAlmostEqual(result["scenario"]["meanTemp"], result["baseline"]["meanTemp"] + 5)
        self.assertAlmostEqual(result["scenario"]["rainfall"], result["baseline"]["rainfall"] / 2)
        reset = self.model.simulate("Delhi", "2027-07")
        self.assertEqual(reset["baseline"], reset["scenario"])
        for temp, rain in [(float("nan"), 0), (0, float("inf")), (6, 0), (0, -51), (True, 0)]:
            with self.assertRaises(ValueError):
                self.model.simulate("Delhi", "2027-07", temp, rain)

    def test_corrupted_artifact_and_runtime_mismatch_fail_explicitly(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.pkl"
            path.write_bytes(DEFAULT_MODEL.read_bytes() + b"corruption")
            path.with_suffix(".info.json").write_bytes(DEFAULT_MODEL.with_suffix(".info.json").read_bytes())
            with self.assertRaisesRegex(ValueError, "does not match"):
                ClimateModel.load(path)
        bundle = pickle.loads(DEFAULT_MODEL.read_bytes())
        bundle["versions"]["scikit-learn"] = "0.0.0"
        with self.assertRaisesRegex(ValueError, "requires scikit-learn"):
            ClimateModel(bundle)

    def test_physical_postprocessing(self):
        model = copy.deepcopy(self.model)
        fitted = model.models["Delhi"]
        fitted.coef_[:] = 0
        fitted.intercept_[:] = [30, 10, -5]
        result = model.predict("Delhi", "2027-01")
        self.assertEqual((result["minTemp"], result["maxTemp"], result["meanTemp"], result["rainfall"]), (10, 30, 20, 0))


if __name__ == "__main__":
    unittest.main()
