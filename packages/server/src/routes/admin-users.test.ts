import { expect, test } from "vitest";

import { fixture, TOKEN, accountSecurity, send } from "../test-support/app-harness.js";

test("the password-based user creation route no longer exists", async () => {
  const { security, calls } = accountSecurity();
  const { app } = await fixture({ security });
  const response = await send(app, "/api/v1/admin/users", "POST", {
    email: "new@lace.test",
    password: "long-password-123",
    role: "viewer",
  });
  expect(response.status).toBe(404);
  expect(calls).toEqual([]);
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
