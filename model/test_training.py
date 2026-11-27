import unittest

import numpy as np
import pandas as pd

from train import aggregate_monthly, train


class TrainingTests(unittest.TestCase):
    def daily(self):
        dates = pd.date_range("2020-01-01", "2020-02-29")
        return pd.DataFrame({"date": dates.strftime("%Y-%m-%d"), "state": "Example",
                             "min_temp": 10.0, "max_temp": 20.0, "rainfall": 2.0})

    def test_monthly_aggregation_and_leap_year(self):
        monthly, audit = aggregate_monthly(self.daily())
        self.assertEqual(monthly.rainfall.tolist(), [62.0, 58.0])
        self.assertEqual(monthly.min_temp.tolist(), [10.0, 10.0])
        self.assertEqual(audit["excludedStateMonths"], 0)

    def test_missing_measurement_excludes_month_not_zero_fill(self):
        daily = self.daily()
        daily.loc[4, "rainfall"] = np.nan
        monthly, audit = aggregate_monthly(daily)
        self.assertEqual(monthly.month.astype(str).tolist(), ["2020-02"])
        self.assertEqual(audit["missingValues"]["rainfall"], 1)
        self.assertEqual(audit["excludedStateMonths"], 1)

    def test_missing_day_excludes_month(self):
        monthly, audit = aggregate_monthly(self.daily().drop(index=0))
        self.assertEqual(len(monthly), 1)
        self.assertEqual(audit["excludedStateMonths"], 1)

    def test_invalid_records_rejected(self):
        daily = self.daily()
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            aggregate_monthly(pd.concat([daily, daily.iloc[[0]]]))
        for column, value in [("rainfall", -1), ("max_temp", 3), ("min_temp", np.inf)]:
            altered = daily.copy()
            altered.loc[0, column] = value
            with self.assertRaises(ValueError):
                aggregate_monthly(altered)

    def test_holdout_does_not_influence_fitting_or_baseline(self):
        periods = pd.period_range("2010-01", "2016-12", freq="M")
        trend = (periods.year - 2010) + (periods.month - 1) / 12
        values = 10 + trend + periods.month * 0.2
        monthly = pd.DataFrame({"state": "Example", "month": periods,
                                "min_temp": values, "max_temp": values + 10, "rainfall": values + 40})
        fitted, _, fixtures = train(monthly, {}, "synthetic", "test")
        evaluation = fitted["states"]["Example"]["evaluation"]
        self.assertEqual(evaluation["trainLast"], "2014-12")
        self.assertEqual(evaluation["testFirst"], "2015-01")
        self.assertLess(evaluation["model"]["mean_temp"]["mae"], 1e-10)
        self.assertEqual(len(fixtures), 12)
        altered = monthly.copy()
        altered.loc[altered.month >= pd.Period("2015-01"), ["min_temp", "max_temp", "rainfall"]] += 100
        changed, _, _ = train(altered, {}, "synthetic", "test")
        changed_evaluation = changed["states"]["Example"]["evaluation"]
        self.assertAlmostEqual(changed_evaluation["model"]["mean_temp"]["mae"], 100)
        self.assertAlmostEqual(changed_evaluation["baseline"]["mean_temp"]["mae"] - evaluation["baseline"]["mean_temp"]["mae"], 100)
        # Deployment intentionally refits including held-out rows after evaluation.
        self.assertNotEqual(changed["states"]["Example"]["intercepts"], fitted["states"]["Example"]["intercepts"])


if __name__ == "__main__":
    unittest.main()
