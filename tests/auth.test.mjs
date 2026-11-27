import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

const source = readFileSync(new URL("../src/auth/auth-session.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { SessionController, hasVerifiedAccess, emailAddress, authError } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const verified = { uid: "test-user", email: "example@example.com", displayName: null, emailVerified: true, tokenEmailVerified: true };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fakeGateway() {
  const fake = { user: null, listener: () => {}, inspect: async () => fake.user,
    watch: listener => { fake.listener = listener; listener(); return () => { fake.listener = () => {}; }; },
    signOut: async () => { fake.user = null; fake.listener(); } };
  return fake;
}

test("access requires an identity, an email and both Firebase verification signals", () => {
  assert.equal(hasVerifiedAccess(null), false);
  assert.equal(hasVerifiedAccess(verified), true);
  for (const changed of [{ emailVerified: false }, { tokenEmailVerified: false }, { email: null }, { uid: "" }, { emailVerified: "true" }])
    assert.equal(hasVerifiedAccess({ ...verified, ...changed }), false);
});

test("email syntax is checked without pretending that format verifies ownership", () => {
  assert.equal(emailAddress("  person+climate@example.org  "), "person+climate@example.org");
  for (const input of ["fake", "a@", "a b@example.com", "a@b@c.com", "a@localhost"]) assert.throws(() => emailAddress(input));
});

test("unverified user is blocked until a fresh server check returns verified claims", async () => {
  const gateway = fakeGateway();
  gateway.user = { ...verified, emailVerified: false, tokenEmailVerified: false };
  const states = [];
  const controller = new SessionController(gateway, state => states.push(state));
  controller.start(); await flush();
  assert.equal(states.at(-1).status, "verification-required");
  gateway.user = verified;
  await controller.refresh();
  assert.equal(states.at(-1).status, "verified");
  await controller.signOut();
  assert.equal(states.at(-1).status, "signed-out");
  controller.stop();
});

test("a delayed verification request cannot restore access after sign out", async () => {
  const gateway = fakeGateway();
  let resolve;
  gateway.inspect = () => new Promise(done => { resolve = done; });
  const states = [];
  const controller = new SessionController(gateway, state => states.push(state));
  controller.start();
  const oldRequest = resolve;
  gateway.inspect = async () => null;
  await controller.signOut();
  oldRequest(verified); await flush();
  assert.equal(states.at(-1).status, "signed-out");
  controller.stop();
});

test("network or disabled-user errors fail closed, and stopped controllers publish nothing", async () => {
  for (const code of ["auth/network-request-failed", "auth/user-disabled", "auth/user-token-expired"]) {
    const gateway = fakeGateway();
    gateway.inspect = async () => { throw { code }; };
    const states = [];
    const controller = new SessionController(gateway, state => states.push(state));
    controller.start(); await flush();
    assert.equal(states.at(-1).status, "error");
    assert.equal(states.at(-1).user, null);
    const length = states.length;
    controller.stop();
    await controller.refresh();
    assert.equal(states.length, length);
  }
});

test("wrong password and unknown email expose the same sign-in error", () => {
  assert.equal(authError({ code: "auth/wrong-password" }), authError({ code: "auth/user-not-found" }));
  assert.equal(authError({ code: "auth/invalid-credential" }), authError({ code: "auth/user-not-found" }));
  assert.ok(!authError(new Error("private internals or credentials")).includes("private internals"));
});

test("the rendered boundary never mounts dashboard children for denied states", async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: "custom" });
  try {
    const { AccessGate } = await server.ssrLoadModule("/src/auth/AuthScreen.tsx");
    const denied = [
      { status: "loading", user: null }, { status: "signed-out", user: null },
      { status: "unconfigured", user: null }, { status: "error", user: null, message: "failed" },
      { status: "verification-required", user: { ...verified, emailVerified: false } },
      { status: "verified", user: { ...verified, tokenEmailVerified: false } },
    ];
    for (const session of denied) {
      const rendered = renderToString(createElement(AccessGate, { session, fallback: createElement("p", null, "Sign in") }, createElement("p", null, "PRIVATE DASHBOARD")));
      assert.ok(!rendered.includes("PRIVATE DASHBOARD"));
      assert.ok(rendered.includes("Sign in"));
    }
    const allowed = renderToString(createElement(AccessGate, { session: { status: "verified", user: verified }, fallback: "Sign in" }, "PRIVATE DASHBOARD"));
    assert.equal(allowed, "PRIVATE DASHBOARD");
  } finally { await server.close(); }
});
