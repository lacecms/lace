// @ts-nocheck
// TODO(rf2): Type partial account security overrides, deferred tasks and recorded token lookups.
import { expect, test } from "vitest";
import { sensitiveRequestLimit } from "./index.js";

import { editor, fixture, TOKEN, accountSecurity, send } from "./test-support/app-harness.js";

test("reset requests answer 202 immediately without awaiting a slow sender", async () => {
  const deferred = [];
  const { security } = accountSecurity();
  let sendStarted = false;
  const { app } = await fixture({
    actor: null,
    defer: (task) => deferred.push(task),
    email: {
      from: "cms@lace.test",
      provider: "smtp",
      send: () => {
        sendStarted = true;
        return new Promise(() => undefined);
      },
    },
    security,
  });
  const response = await send(app, "/api/v1/password-reset/request", "POST", {
    email: "editor@lace.test",
  });
  expect(response.status).toBe(202);
  expect(await response.text()).toBe("");
  expect(sendStarted).toBe(true);
  expect(deferred).toHaveLength(1);
  const unknown = await fixture({
    actor: null,
    defer: (task) => deferred.push(task),
    security: accountSecurity({ issuePasswordReset: async () => ({ status: "not_found" }) })
      .security,
  });
  const other = await send(unknown.app, "/api/v1/password-reset/request", "POST", {
    email: "nobody@lace.test",
  });
  expect(other.status).toBe(202);
  expect([...other.headers.keys()].sort()).toEqual([...response.headers.keys()].sort());
  expect(deferred).toHaveLength(1);
});

test("the per-email reset limit returns the rate-limit envelope", async () => {
  const { security, calls } = accountSecurity();
  const { app } = await fixture({
    actor: null,
    security,
    sensitiveLimiter: { check: async () => ({ allowed: false, retryAfterSeconds: 600 }) },
  });
  const response = await send(app, "/api/v1/password-reset/request", "POST", {
    email: "editor@lace.test",
  });
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("600");
  expect((await response.json()).error.code).toBe("RATE_LIMITED");
  expect(calls).toEqual([]);
});

test("invalid invitation and reset tokens share one 410 envelope and never echo tokens", async () => {
  const { security } = accountSecurity();
  const { app, logs } = await fixture({ actor: null, security });
  for (const [path, body, code] of [
    ["/api/v1/invitations/inspect", { token: TOKEN }, "INVITATION_INVALID"],
    [
      "/api/v1/invitations/accept",
      { password: "long-password-123", token: TOKEN },
      "INVITATION_INVALID",
    ],
    [
      "/api/v1/password-reset/confirm",
      { password: "long-password-123", token: TOKEN },
      "RESET_INVALID",
    ],
  ]) {
    const response = await send(app, path, "POST", body);
    expect(response.status).toBe(410);
    const text = await response.text();
    expect(JSON.parse(text).error.code).toBe(code);
    expect(text).not.toContain(TOKEN);
  }
  const malformed = await send(app, "/api/v1/invitations/inspect", "POST", {
    token: "secret-value",
  });
  expect(malformed.status).toBe(422);
  expect(await malformed.text()).not.toContain("secret-value");
  const short = await send(app, "/api/v1/invitations/accept", "POST", {
    password: "short",
    token: TOKEN,
  });
  expect((await short.json()).error.details.issues.map((issue) => issue.path)).toEqual([
    "/password",
  ]);
  expect(JSON.stringify(logs)).not.toContain(TOKEN);
  expect(logs.every((entry) => !entry.path.includes("token"))).toBe(true);
});

test("public account routes are rate limited before any token lookup", async () => {
  const { security, calls } = accountSecurity();
  const { app } = await fixture({ actor: null, allowed: false, security });
  for (const path of [
    "/api/v1/invitations/inspect",
    "/api/v1/invitations/accept",
    "/api/v1/password-reset/confirm",
  ]) {
    const response = await send(app, path, "POST", { password: "long-password-123", token: TOKEN });
    expect(response.status).toBe(429);
  }
  expect(calls).toEqual([]);
});

test("account routes require a session and admin routes require users:manage", async () => {
  const { security, calls } = accountSecurity();
  const anonymous = await fixture({ actor: null, security });
  for (const [path, method, body] of [
    ["/api/v1/account", "PATCH", { displayName: "Ada" }],
    [
      "/api/v1/account/password",
      "POST",
      { currentPassword: "x", newPassword: "long-password-123", signOutOtherSessions: true },
    ],
    ["/api/v1/account/sessions", "GET"],
    ["/api/v1/account/sessions/s-other", "DELETE"],
    ["/api/v1/account/sessions/revoke-others", "POST", {}],
    ["/api/v1/admin/invitations", "GET"],
    ["/api/v1/admin/invitations", "POST", { email: "x@lace.test", role: "viewer" }],
  ]) {
    const response = await send(anonymous.app, path, method, body);
    expect(response.status, `${method} ${path}`).toBe(403);
    expect((await response.json()).error.code).toBe("AUTHORIZATION_DENIED");
  }
  const restricted = await fixture({ actor: editor, security });
  for (const [path, method, body] of [
    ["/api/v1/admin/invitations", "GET"],
    ["/api/v1/admin/invitations", "POST", { email: "x@lace.test", role: "viewer" }],
    ["/api/v1/admin/invitations/inv-1/resend", "POST", {}],
    ["/api/v1/admin/invitations/inv-1", "DELETE"],
    ["/api/v1/admin/users/admin/password-reset", "POST", {}],
    ["/api/v1/admin/users/admin/sessions/revoke", "POST", {}],
  ]) {
    expect((await send(restricted.app, path, method, body)).status, `${method} ${path}`).toBe(403);
  }
  expect(calls).toEqual([]);
});

test("self-service routes mark the current session and refuse to end it", async () => {
  const deferred = [];
  const { security, calls } = accountSecurity();
  const { app } = await fixture({
    actor: editor,
    defer: (task) => deferred.push(task),
    email: { from: "cms@lace.test", provider: "log", send: async () => ({ status: "sent" }) },
    security,
    sessionId: "s-current",
  });
  const listed = await send(app, "/api/v1/account/sessions", "GET");
  expect(await listed.json()).toEqual({
    items: [
      {
        browser: "Unknown",
        createdAt: "1970-01-01T00:00:00.001Z",
        current: true,
        id: "s-current",
        lastActiveAt: "1970-01-01T00:00:00.002Z",
        os: "Unknown",
      },
      {
        browser: "Chrome",
        createdAt: "1970-01-01T00:00:00.001Z",
        current: false,
        id: "s-other",
        lastActiveAt: "1970-01-01T00:00:00.003Z",
        os: "Windows",
      },
    ],
  });
  const current = await send(app, "/api/v1/account/sessions/s-current", "DELETE");
  expect(current.status).toBe(409);
  expect((await current.json()).error.code).toBe("CONFLICT");
  expect((await send(app, "/api/v1/account/sessions/foreign", "DELETE")).status).toBe(404);
  expect(await (await send(app, "/api/v1/account/sessions/revoke-others", "POST")).json()).toEqual({
    revoked: 2,
  });
  const changed = await send(app, "/api/v1/account/password", "POST", {
    currentPassword: "old password",
    newPassword: "long-password-123",
    signOutOtherSessions: true,
  });
  expect(await changed.json()).toEqual({ revoked: 1 });
  expect(calls.find(([name]) => name === "changePassword")[1]).toMatchObject({
    keepSessionId: "s-current",
    userId: "editor",
  });
  expect(deferred).toHaveLength(1);
  const renamed = await send(app, "/api/v1/account", "PATCH", { displayName: "  Ada Lovelace " });
  expect(renamed.status).toBe(200);
  expect(calls.find(([name]) => name === "updateDisplayName")[1]).toMatchObject({
    displayName: "Ada Lovelace",
    userId: "editor",
  });
  expect((await send(app, "/api/v1/account", "PATCH", { displayName: "   " })).status).toBe(422);
  const wrong = await fixture({
    actor: editor,
    security: accountSecurity({ changePassword: async () => ({ status: "invalid_credentials" }) })
      .security,
    sessionId: "s-current",
  });
  const denied = await send(wrong.app, "/api/v1/account/password", "POST", {
    currentPassword: "wrong",
    newPassword: "long-password-123",
    signOutOtherSessions: false,
  });
  expect(denied.status).toBe(400);
  expect((await denied.json()).error.code).toBe("INVALID_CREDENTIALS");
});

test("both runtimes share one sensitive-limit mapping for account routes", () => {
  const cases = [
    ["POST", "/api/auth/sign-in/email", { operation: "auth", scope: "client" }],
    ["GET", "/api/auth/get-session", undefined],
    ["POST", "/api/v1/invitations/inspect", { operation: "auth", scope: "client" }],
    ["POST", "/api/v1/invitations/accept", { operation: "auth", scope: "client" }],
    ["POST", "/api/v1/password-reset/request", { operation: "auth", scope: "client" }],
    ["POST", "/api/v1/password-reset/confirm", { operation: "auth", scope: "client" }],
    ["POST", "/api/v1/account/password", { operation: "auth", scope: "actor" }],
    ["PATCH", "/api/v1/account", undefined],
    ["GET", "/api/v1/account/sessions", undefined],
    ["GET", "/api/v1/admin/invitations", undefined],
    ["POST", "/api/v1/admin/invitations", { operation: "invite", scope: "actor" }],
    ["POST", "/api/v1/admin/invitations/inv-1/resend", { operation: "invite", scope: "actor" }],
    ["DELETE", "/api/v1/admin/invitations/inv-1", { operation: "invite", scope: "actor" }],
    ["POST", "/api/v1/admin/users/u-1/password-reset", { operation: "invite", scope: "actor" }],
    ["POST", "/api/v1/admin/users/u-1/sessions/revoke", undefined],
    ["POST", "/api/v1/setup/admin", { operation: "setup", scope: "client" }],
    ["POST", "/api/v1/admin/api-tokens", { operation: "token", scope: "actor" }],
    ["POST", "/api/v1/admin/import-tokens", { operation: "token", scope: "actor" }],
    ["DELETE", "/api/v1/admin/import-tokens/t-1", { operation: "token", scope: "actor" }],
    ["GET", "/api/v1/admin/import-tokens", undefined],
    ["POST", "/api/v1/admin/media", { operation: "upload", scope: "actor" }],
    ["POST", "/api/v1/admin/settings/email-test", { operation: "email", scope: "actor" }],
  ];
  for (const [method, path, expected] of cases)
    expect(sensitiveRequestLimit(method, path), `${method} ${path}`).toEqual(expected);
});
