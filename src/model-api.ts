import artifact from "./data/regression-model.json";
import { forecastMonths, type Projection } from "./regression";
import { verifiedIdToken } from "./auth/firebase-client";

export type ScenarioResult = { baseline: Projection; scenario: Projection };
type ApiOptions = { baseUrl: string; getToken: () => Promise<string>; fetcher?: typeof fetch };

function validRow(value: unknown, state: string, month: string): value is Projection {
  if (!value || typeof value !== "object") return false;
  const row = value as Projection;
  return row.state === state && row.month === month &&
    [row.minTemp, row.maxTemp, row.meanTemp, row.rainfall].every(v => typeof v === "number" && Number.isFinite(v)) &&
    row.minTemp <= row.maxTemp && row.rainfall >= 0;
}

export function createModelApi({ baseUrl, getToken, fetcher = fetch }: ApiOptions) {
  async function post(path: string, payload: object, signal?: AbortSignal) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const token = await getToken();
      if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
      timer = setTimeout(cancel, 15000);
      let response: Response;
      try {
        response = await fetcher(`${baseUrl.replace(/\/$/, "")}${path}`, { method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload), signal: controller.signal });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new Error("The prediction service is unavailable. Start the Flask backend and try again.");
      }
      if (!response.ok) {
        if (response.status === 401) throw new Error("Your session has expired. Sign out and sign in again.");
        if (response.status === 403) throw new Error("Verify your email before using predictions.");
        if (response.status === 422) throw new Error("This state, month or scenario is not supported by the Python model.");
        throw new Error("The prediction service could not complete the request. Please retry.");
      }
      const result = await response.json();
      if (!result || result.dataKind !== artifact.dataKind || result.forecastStart !== artifact.forecastStart ||
          result.forecastEnd !== artifact.forecastEnd || result.trainingDataSha256 !== artifact.inputSha256) {
        throw new Error("The server model does not match this dashboard. Update the app and backend together.");
      }
      return result;
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }
  return {
    async forecast(state: string, horizon: number, signal?: AbortSignal): Promise<Projection[]> {
      const result = await post("/predict", { state, startMonth: artifact.forecastStart, horizon }, signal);
      const expected = forecastMonths(artifact).slice(0, horizon);
      if (!Array.isArray(result.predictions) || result.predictions.length !== expected.length ||
          !result.predictions.every((row: unknown, i: number) => validRow(row, state, expected[i]))) {
        throw new Error("The prediction service returned incomplete results. Please retry.");
      }
      return result.predictions;
    },
    async simulate(state: string, month: string, temperatureChange: number, rainfallPercent: number, signal?: AbortSignal): Promise<ScenarioResult> {
      const result = await post("/simulate", { state, month, temperatureChange, rainfallPercent }, signal);
      if (!validRow(result.baseline, state, month) || !validRow(result.scenario, state, month)) {
        throw new Error("The prediction service returned incomplete scenario results. Please retry.");
      }
      return { baseline: result.baseline, scenario: result.scenario };
    },
  };
}

export const modelApi = createModelApi({ baseUrl: import.meta.env.VITE_MODEL_API_URL || "http://localhost:8000", getToken: verifiedIdToken });
