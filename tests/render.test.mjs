import { createServer } from "vite";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import assert from "node:assert/strict";
import test from "node:test";

test("prediction and simulator routes render fitted model views without React warnings", async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: "custom" });
  const originalError = console.error;
  const messages = [];
  console.error = (...parts) => messages.push(parts.join(" "));
  try {
    const { default: ProtectedApp, ClimateDashboard: App } = await server.ssrLoadModule("/src/App.tsx");
    for (const [hash, title] of [["#ai-prediction", "Climate Prediction"], ["#scenario-simulator", "Scenario Simulator"]]) {
      globalThis.window = { location: { hash }, localStorage: { getItem: () => null } };
      const html = renderToString(createElement(App));
      assert.ok(html.includes(`<h1>${title}</h1>`));
      assert.ok(html.includes("SYNTHETIC DATA"));
      assert.ok(html.includes("How well did it predict held-out months?"));
      assert.ok(!html.includes("84%"));
      assert.ok(html.includes(hash === "#ai-prediction" ? "Download projections CSV" : "Download scenario CSV"));
      const protectedHtml = renderToString(createElement(ProtectedApp));
      assert.ok(!protectedHtml.includes(`<h1>${title}</h1>`), "Private routes stay hidden until Firebase verifies the session");
    }
    assert.deepEqual(messages, []);
  } finally {
    console.error = originalError;
    delete globalThis.window;
    await server.close();
  }
});
