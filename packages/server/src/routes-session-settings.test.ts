// @ts-nocheck
// TODO(rf2): Type partial account/email providers, session role matrices and limiter callbacks.
import { expect, test } from "vitest";
import { actorId } from "@lacecms/domain";

import { editor, fixture, json, profiles, profileSecurity } from "./test-support/app-harness.js";

test("settings status exposes only useful read-only state to administrators", async () => {
  const adminFixture = await fixture({ ready: false });
  expect(await json(adminFixture.app, "/api/v1/admin/settings/status")).toMatchObject({
    body: {
      configuredModels: 2,
      email: { provider: "none" },
      engineVersion: "0.0.0-test",
      ready: false,
    },
    response: { status: 200 },
  });
  const editorFixture = await fixture({ actor: editor });
  expect(await json(editorFixture.app, "/api/v1/admin/settings/status")).toMatchObject({
    body: { error: { code: "AUTHORIZATION_DENIED" } },
    response: { status: 403 },
  });
  for (const actor of [null, { id: actorId("viewer"), role: "viewer" }]) {
    const other = await fixture({ actor });
    const result = await json(other.app, "/api/v1/admin/settings/status", {
      headers: { authorization: "Bearer build-token" },
    });
    expect(result.response.status).toBe(403);
    expect(result.body).not.toHaveProperty("engineVersion");
  }
});

test("session summary returns identity and the exact permissions for each role", async () => {
  const expected = {
    admin: [
      "content:read",
      "content:write",
      "content:publish",
      "media:write",
      "users:manage",
      "settings:manage",
    ],
    editor: ["content:read", "content:write", "media:write"],
    viewer: ["content:read"],
  };
  for (const role of ["admin", "editor", "viewer"]) {
    const { app } = await fixture({
      actor: { id: actorId(role), role },
      security: profileSecurity,
    });
    const result = await json(app, "/api/v1/admin/session");
    expect(result.response.status).toBe(200);
    expect(result.response.headers.get("cache-control")).toBe("no-store");
    expect(result.body.permissions).toEqual(expected[role]);
    expect(result.body.user).toEqual({
      ...(profiles[role].name === undefined ? {} : { displayName: profiles[role].name }),
      email: profiles[role].email,
      id: role,
      role,
    });
    expect(JSON.stringify(result.body)).not.toMatch(/token|password|session/iu);
  }
  for (const actor of [null, { id: actorId("disabled"), role: "admin" }]) {
    const { app } = await fixture({ actor, security: profileSecurity });
    const result = await json(app, "/api/v1/admin/session");
    expect(result.response.status).toBe(403);
    expect(result.body).not.toHaveProperty("user");
  }
});

test("settings status reports the composed email provider without settings", async () => {
  const { app } = await fixture({
    email: { from: "Lace <cms@lace.test>", provider: "smtp", send: async () => ({}) },
  });
  const result = await json(app, "/api/v1/admin/settings/status");
  expect(result.body.email).toEqual({ from: "Lace <cms@lace.test>", provider: "smtp" });
});

test("email test sends only to the acting administrator and reports closed outcomes", async () => {
  const sent = [];
  let outcome = { status: "sent" };
  const email = {
    from: "cms@lace.test",
    provider: "resend",
    send: async (message) => {
      sent.push(message);
      return outcome;
    },
  };
  const post = (body = {}) => ({
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const { app } = await fixture({
    actor: { id: actorId("admin"), role: "admin" },
    email,
    security: profileSecurity,
  });
  expect(await json(app, "/api/v1/admin/settings/email-test", post())).toMatchObject({
    body: { status: "sent" },
    response: { status: 200 },
  });
  expect(sent).toHaveLength(1);
  expect(sent[0].to).toBe("admin@lace.test");
  expect(sent[0].text).toContain("https://lace.test/");
  outcome = { reason: "rate_limited", status: "failed" };
  expect(await json(app, "/api/v1/admin/settings/email-test", post())).toMatchObject({
    body: { reason: "rate_limited", status: "failed" },
    response: { status: 200 },
  });
  const named = await json(
    app,
    "/api/v1/admin/settings/email-test",
    post({ to: "attacker@example.com" }),
  );
  expect(named.response.status).toBe(422);
  expect(named.body.error.code).toBe("VALIDATION_FAILED");
  expect(sent).toHaveLength(2);
  for (const role of ["editor", "viewer"]) {
    const denied = await fixture({
      actor: { id: actorId(role), role },
      email,
      security: profileSecurity,
    });
    expect(
      (await json(denied.app, "/api/v1/admin/settings/email-test", post())).response.status,
    ).toBe(403);
  }
  expect(sent).toHaveLength(2);
});

test("email test passes the acting administrator to the rate limiter before sending", async () => {
  const checks = [];
  const sent = [];
  const { app } = await fixture({
    email: { from: "cms@lace.test", provider: "smtp", send: async (m) => sent.push(m) },
    rateLimiter: {
      check: async (input) => {
        if (new URL(input.request.url).pathname === "/api/v1/admin/settings/email-test")
          checks.push(input.actor?.id);
        return { allowed: false, retryAfterSeconds: 120 };
      },
    },
    security: profileSecurity,
  });
  const result = await json(app, "/api/v1/admin/settings/email-test", {
    body: "{}",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  expect(result.response.status).toBe(429);
  expect(result.response.headers.get("retry-after")).toBe("120");
  expect(result.body.error.code).toBe("RATE_LIMITED");
  expect(checks).toEqual(["admin"]);
  expect(sent).toEqual([]);
});

test("anonymous setup state exposes only durable completion with no cache or mutation", async () => {
  let complete = false;
  const { app, logs } = await fixture({
    actor: null,
    security: { isSetupComplete: async () => complete },
  });
  for (const value of [false, true]) {
    complete = value;
    const response = await app.request("/api/v1/setup/state");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ setupComplete: value });
  }
  expect((await app.request("/api/v1/admin/users")).status).toBe(403);
  expect((await app.request("/api/v1/admin/content-models")).status).toBe(403);
  expect(logs.every((entry) => entry.actorId === undefined)).toBe(true);
});

test("setup persistence failure never reports an incomplete installation", async () => {
  const { app } = await fixture({
    security: {
      isSetupComplete: async () => {
        throw new Error("SQL private database detail");
      },
    },
  });
  const response = await app.request("/api/v1/setup/state");
  expect(response.status).toBe(500);
  const body = await response.text();
  expect(body).not.toContain("SQL");
  expect(body).not.toContain("setupComplete");
});
