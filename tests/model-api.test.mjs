import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createServer } from "vite";

test("the dashboard uses authenticated Python responses and never substitutes local predictions", async t => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: "custom" });
  try {
    const { createModelApi } = await server.ssrLoadModule("/src/model-api.ts");
    const artifact = JSON.parse(readFileSync(new URL("../src/data/regression-model.json", import.meta.url)));
    const fixtures = JSON.parse(readFileSync(new URL("../model/prediction-fixtures.json", import.meta.url)));
    const rows = fixtures.filter(row => row.state === "Delhi");
    const metadata = { dataKind: artifact.dataKind, forecastStart: artifact.forecastStart,
      forecastEnd: artifact.forecastEnd, trainingDataSha256: artifact.inputSha256 };
    const reply = data => new Response(JSON.stringify({ ...metadata, ...data }), { status: 200 });

    await t.test("forecast and scenario requests send the Firebase bearer token and requested inputs", async () => {
      const requests = [];
      const scenario = { ...rows[0], meanTemp: rows[0].meanTemp + 2, minTemp: rows[0].minTemp + 2, maxTemp: rows[0].maxTemp + 2 };
      const api = createModelApi({ baseUrl: "https://api.example.invalid/", getToken: async () => "test-token",
        fetcher: async (url, init) => { requests.push({ url, init });
          return url.endsWith("/predict") ? reply({ predictions: rows.slice(0, 3) }) : reply({ baseline: rows[0], scenario }); } });
      assert.deepEqual(await api.forecast("Delhi", 3), rows.slice(0, 3));
      assert.deepEqual(await api.simulate("Delhi", rows[0].month, 2, 0), { baseline: rows[0], scenario });
      assert.equal(requests[0].url, "https://api.example.invalid/predict");
      assert.equal(requests[0].init.headers.Authorization, "Bearer test-token");
      assert.deepEqual(JSON.parse(requests[0].init.body), { state: "Delhi", startMonth: "2027-01", horizon: 3 });
      assert.deepEqual(JSON.parse(requests[1].init.body), { state: "Delhi", month: "2027-01", temperatureChange: 2, rainfallPercent: 0 });
    });

    await t.test("network and authentication failures remain errors", async () => {
      for (const status of [401, 403, 422, 503]) {
        const api = createModelApi({ baseUrl: "https://api.example.invalid", getToken: async () => "test",
          fetcher: async () => new Response("{}", { status }) });
        await assert.rejects(api.forecast("Delhi", 12));
      }
      const offline = createModelApi({ baseUrl: "https://api.example.invalid", getToken: async () => "test", fetcher: async () => { throw new TypeError("offline"); } });
      await assert.rejects(offline.forecast("Delhi", 12), /unavailable/);
    });

    await t.test("mismatched models and incomplete server data are rejected", async () => {
      for (const result of [{ predictions: rows.slice(1) }, { predictions: rows, trainingDataSha256: "wrong-model" },
                            { predictions: rows.map(row => ({ ...row, state: "Wrong" })) }]) {
        const api = createModelApi({ baseUrl: "https://api.example.invalid", getToken: async () => "test", fetcher: async () => reply(result) });
        await assert.rejects(api.forecast("Delhi", 12));
      }
    });

    await t.test("cancelled or signed-out requests cannot send a prediction request", async () => {
      let calls = 0;
      const api = createModelApi({ baseUrl: "https://api.example.invalid", getToken: async () => { throw new Error("Please sign in"); },
        fetcher: async () => { calls++; return reply({ predictions: rows }); } });
      await assert.rejects(api.forecast("Delhi", 12), /sign in/);
      const controller = new AbortController(); controller.abort();
      await assert.rejects(api.forecast("Delhi", 12, controller.signal), { name: "AbortError" });
      assert.equal(calls, 0);
    });
  } finally { await server.close(); }
});
