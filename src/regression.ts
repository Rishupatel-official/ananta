export type Metric = { mae: number; rmse: number };
export type Scores = Record<"min_temp" | "max_temp" | "mean_temp" | "rainfall", Metric>;
export type StateModel = {
  intercepts: number[];
  coefficients: number[][];
  fitMonths: number;
  fitFirst: string;
  fitLast: string;
  evaluation: {
    trainMonths: number; testMonths: number;
    trainFirst: string; trainLast: string; testFirst: string; testLast: string;
    model: Scores; baseline: Scores;
  };
};
export type RegressionModel = {
  schemaVersion: number; dataKind: string; baseYear: number;
  trainingStart: string; trainingEnd: string;
  forecastStart: string; forecastEnd: string;
  evaluationStart: string; evaluationEnd: string;
  audit: { rowCount: number; stateCount: number; completeStateMonths: number; excludedStateMonths: number };
  states: Record<string, StateModel>;
};
export type Projection = { state: string; month: string; minTemp: number; maxTemp: number; meanTemp: number; rainfall: number };

function monthNumber(month: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Use a valid YYYY-MM month.");
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
}

export function forecastMonths(model: RegressionModel): string[] {
  const start = monthNumber(model.forecastStart);
  const end = monthNumber(model.forecastEnd);
  if (end < start || end - start > 11) throw new Error("The supported horizon is at most 12 months.");
  return Array.from({ length: end - start + 1 }, (_, i) => {
    const n = start + i;
    return `${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, "0")}`;
  });
}

export function predict(model: RegressionModel, state: string, month: string): Projection {
  if (model.schemaVersion !== 1) throw new Error("Unsupported regression model version.");
  if (!Object.prototype.hasOwnProperty.call(model.states, state)) throw new Error("No trained model for this state.");
  if (!forecastMonths(model).includes(month)) throw new Error("Choose a month within the model's 12-month horizon.");
  const date = monthNumber(month);
  const calendarMonth = date % 12 + 1;
  const features = [(Math.floor(date / 12) - model.baseYear) + (calendarMonth - 1) / 12,
    ...Array.from({ length: 11 }, (_, i) => calendarMonth === i + 2 ? 1 : 0)];
  const fitted = model.states[state];
  if (fitted.intercepts.length !== 3 || fitted.coefficients.length !== 3 ||
      fitted.coefficients.some(row => row.length !== 12)) throw new Error("Invalid coefficient dimensions.");
  const output = fitted.intercepts.map((intercept, target) =>
    features.reduce((sum, value, i) => sum + value * fitted.coefficients[target][i], intercept));
  if (!output.every(Number.isFinite)) throw new Error("The model produced a non-finite result.");
  const minTemp = Math.min(output[0], output[1]);
  const maxTemp = Math.max(output[0], output[1]);
  return { state, month, minTemp, maxTemp, meanTemp: (minTemp + maxTemp) / 2, rainfall: Math.max(0, output[2]) };
}

export function simulate(baseline: Projection, temperatureChange: number, rainfallPercent: number): Projection {
  if (!Number.isFinite(temperatureChange) || temperatureChange < -3 || temperatureChange > 5)
    throw new Error("Temperature adjustment must be between -3 and +5 degrees C.");
  if (!Number.isFinite(rainfallPercent) || rainfallPercent < -50 || rainfallPercent > 50)
    throw new Error("Rainfall adjustment must be between -50% and +50%.");
  if (![baseline.minTemp, baseline.maxTemp, baseline.meanTemp, baseline.rainfall].every(Number.isFinite) ||
      baseline.rainfall < 0 || baseline.minTemp > baseline.maxTemp)
    throw new Error("The baseline contains invalid values.");
  return { ...baseline, minTemp: baseline.minTemp + temperatureChange, maxTemp: baseline.maxTemp + temperatureChange,
    meanTemp: baseline.meanTemp + temperatureChange, rainfall: baseline.rainfall * (1 + rainfallPercent / 100) };
}
