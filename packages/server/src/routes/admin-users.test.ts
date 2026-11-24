import { expect, test } from "vitest";

import {
  admin,
  editor,
  fixture,
  TOKEN,
  accountSecurity,
  send,
} from "../test-support/app-harness.js";

const usersPath = "/api/v1/admin/users";
const input = { email: "new@lace.test", role: "editor" };

test("user creation validates the required email and role and rejects password input", async () => {
  const { security, calls } = accountSecurity();
  const { app } = await fixture({ security });
  for (const invalid of [
    { role: "editor" },
    { ...input, role: "owner" },
    { ...input, password: "long-password-123" },
  ]) {
    const response = await send(app, usersPath, "POST", invalid);
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
  }
  expect(calls).toEqual([]);
});

test("direct user creation is an uncached 201 with a one-time handoff when mail is unavailable", async () => {
  const { security, calls } = accountSecurity();
  const { app, logs } = await fixture({ security });
  const created = await send(app, usersPath, "POST", { ...input, email: " New@Lace.test " });
  expect(created.status).toBe(201);
  expect(created.headers.get("cache-control")).toBe("no-store");
  expect(await created.json()).toEqual({
    delivery: { status: "failed", reason: "not_configured" },
    link: `https://lace.test/admin/reset-password#token=${TOKEN}`,
    user: { ...input, id: "new-user", disabled: false },
  });
  expect(calls[0]).toMatchObject(["createUser", { ...input, requestedBy: "admin" }]);
  expect(JSON.stringify(logs)).not.toContain(TOKEN);
  const conflict = await fixture({
    security: { createUser: async () => ({ status: "conflict" }) },
  });
  const duplicate = await send(conflict.app, usersPath, "POST", input);
  expect(duplicate.status).toBe(409);
  expect((await duplicate.json()).error.code).toBe("CONFLICT");
});

test("direct creation requires a permitted session and a trusted browser origin", async () => {
  const { security, calls } = accountSecurity();
  for (const [actor, status] of [
    [null, 401],
    [editor, 403],
    [{ ...editor, role: "viewer" as const }, 403],
  ] as const) {
    const { app } = await fixture({ actor, security });
    expect((await send(app, usersPath, "POST", input)).status).toBe(status);
  }
  const { app } = await fixture({
    security,
    resolveActor: async (request) =>
      request.headers.get("origin") === "https://untrusted.test" ? "request-denied" : admin,
  });
  for (const [headers, status] of [
    [{ authorization: "Bearer test-import", cookie: "better-auth.session_token=test" }, 403],
    [{ origin: "https://untrusted.test" }, 403],
  ] as const) {
    const result = await app.fetch(
      new Request(`https://lace.test${usersPath}`, {
        method: "POST",
        body: JSON.stringify(input),
        headers: { ...headers, "content-type": "application/json" },
      }),
    );
    expect(result.status).toBe(status);
  }
  expect(calls).toEqual([]);
});

test("direct creation shares the administrator invitation and reset budget", async () => {
  const { security, calls } = accountSecurity();
  let used = 0;
  const { app } = await fixture({
    security,
    rateLimiter: {
      check: async ({ limit, actor }) => {
        expect(limit).toEqual({ operation: "invite", scope: "actor" });
        expect(actor?.id).toBe("admin");
        used += 1;
        return used <= 20 ? true : { allowed: false, retryAfterSeconds: 600 };
      },
    },
  });
  for (let attempt = 0; attempt < 19; attempt += 1)
    expect((await send(app, "/api/v1/admin/invitations", "POST", input)).status).toBe(201);
  expect((await send(app, "/api/v1/admin/users/editor/password-reset", "POST", {})).status).toBe(
    200,
  );
  const blocked = await send(app, usersPath, "POST", input);
  expect(blocked.status).toBe(429);
  expect(blocked.headers.get("retry-after")).toBe("600");
  expect((await blocked.json()).error.code).toBe("RATE_LIMITED");
  expect(calls.map(([name]) => name)).not.toContain("createUser");
});

test("invitations return the accept link only when email was not sent", async () => {
  const { security, calls } = accountSecurity();
  const unsent = await fixture({ security });
  const created = await send(unsent.app, "/api/v1/admin/invitations", "POST", {
    email: "New@Lace.test",
    role: "editor",
  });
  expect(created.status).toBe(201);
  expect(created.headers.get("cache-control")).toBe("no-store");
  expect(await created.json()).toEqual({
    delivery: { reason: "not_configured", status: "failed" },
    invitation: {
      createdAt: "1970-01-01T00:00:01.000Z",
      email: "new@lace.test",
      expiresAt: "1970-01-04T00:00:01.000Z",
      id: "inv-1",
      invitedBy: "Admin",
      role: "editor",
      state: "expired",
    },
    link: `https://lace.test/admin/accept-invite#token=${TOKEN}`,
  });
  expect(calls[0]).toMatchObject([
    "createInvitation",
    { email: "new@lace.test", invitedBy: "admin" },
  ]);
  const sent: import("@lacecms/application").EmailMessage[] = [];
  const delivered = await fixture({
    email: {
      from: "cms@lace.test",
      provider: "log",
      send: async (m) => (sent.push(m), { status: "sent" }),
    },
    security,
  });
  const body = await (
    await send(delivered.app, "/api/v1/admin/invitations", "POST", {
      email: "n@lace.test",
      role: "viewer",
    })
  ).json();
  expect(body).not.toHaveProperty("link");
  expect(sent[0]!.text).toContain(`#token=${TOKEN}`);
  for (const entry of [...unsent.logs, ...delivered.logs])
    expect(JSON.stringify(entry)).not.toContain(TOKEN);
  const reset = await send(unsent.app, "/api/v1/admin/users/editor/password-reset", "POST", {});
  expect(await reset.json()).toEqual({
    delivery: { reason: "not_configured", status: "failed" },
    link: `https://lace.test/admin/reset-password#token=${TOKEN}`,
  });
  expect(
    await (await send(unsent.app, "/api/v1/admin/users/editor/sessions/revoke", "POST")).json(),
  ).toEqual({ revoked: 3 });
  expect((await send(unsent.app, "/api/v1/admin/invitations/inv-1", "DELETE")).status).toBe(204);
  expect(
    (await send(unsent.app, "/api/v1/admin/invitations/inv-1/resend", "POST", {})).status,
  ).toBe(404);
});
