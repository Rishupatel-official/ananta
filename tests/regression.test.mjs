import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/regression.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { predict, simulate, forecastMonths } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const model = JSON.parse(readFileSync(new URL("../src/data/regression-model.json", import.meta.url), "utf8"));
const fixtures = JSON.parse(readFileSync(new URL("../model/prediction-fixtures.json", import.meta.url), "utf8"));

test("all state/month browser predictions match independently scored Python models", () => {
  assert.equal(fixtures.length, Object.keys(model.states).length * 12);
  for (const expected of fixtures) {
    const actual = predict(model, expected.state, expected.month);
    for (const key of ["minTemp", "maxTemp", "meanTemp", "rainfall"]) {
      assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, `${expected.state} ${expected.month} ${key}`);
    }
    assert.ok(actual.minTemp <= actual.meanTemp && actual.meanTemp <= actual.maxTemp);
    assert.ok(actual.rainfall >= 0);
  }
});

test("unknown states, unsupported horizons and malformed months fail explicitly", () => {
  const state = Object.keys(model.states)[0];
  for (const unknown of ["Unknown", "__proto__", "constructor"]) assert.throws(() => predict(model, unknown, model.forecastStart));
  for (const month of [model.trainingEnd, "2050-01", "2027-13", "2027-1", "garbage"]) assert.throws(() => predict(model, state, month));
  assert.throws(() => forecastMonths({ ...model, forecastEnd: "2050-01" }));
  assert.throws(() => predict({ ...model, schemaVersion: 9 }, state, model.forecastStart));
});

test("scenario reset preserves baseline and adjustments have explicit arithmetic", () => {
  const baseline = predict(model, "Delhi", model.forecastStart);
  assert.deepEqual(simulate(baseline, 0, 0), baseline);
  const scenario = simulate(baseline, 2, -20);
  assert.equal(scenario.meanTemp, baseline.meanTemp + 2);
  assert.equal(scenario.minTemp, baseline.minTemp + 2);
  assert.equal(scenario.maxTemp, baseline.maxTemp + 2);
  assert.equal(scenario.rainfall, baseline.rainfall * 0.8);
  assert.notEqual(scenario, baseline);
  assert.deepEqual(baseline, predict(model, "Delhi", model.forecastStart));
});

test("scenario limits reject nonfinite and out-of-range inputs", () => {
  const baseline = predict(model, "Delhi", model.forecastStart);
  for (const value of [NaN, Infinity, -4, 6]) assert.throws(() => simulate(baseline, value, 0));
  for (const value of [NaN, Infinity, -51, 51]) assert.throws(() => simulate(baseline, 0, value));
  assert.throws(() => simulate({ ...baseline, rainfall: -1 }, 0, 0));
  assert.equal(simulate({ ...baseline, rainfall: 0 }, 5, 50).rainfall, 0);
});

test("physical postprocessing and corrupted coefficients are checked", () => {
  const custom = structuredClone(model);
  const state = Object.keys(model.states)[0];
  custom.states[state].intercepts = [30, 20, -2];
  custom.states[state].coefficients = Array.from({ length: 3 }, () => Array(12).fill(0));
  const output = predict(custom, state, custom.forecastStart);
  assert.equal(output.minTemp, 20);
  assert.equal(output.maxTemp, 30);
  assert.equal(output.meanTemp, 25);
  assert.equal(output.rainfall, 0);
  custom.states[state].coefficients[0][0] = NaN;
  assert.throws(() => predict(custom, state, custom.forecastStart));
});
