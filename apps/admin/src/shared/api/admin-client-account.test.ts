import { expect, test, vi } from "vitest";
import { AdminClientError, createAdminClient } from "./admin-client.js";

const invitation = {
  createdAt: "2026-10-01T00:00:00.000Z",
  email: "new@lace.test",
  expiresAt: "2026-10-04T00:00:00.000Z",
  id: "invitation-1",
  invitedBy: "Ada Admin",
  role: "editor" as const,
  state: "pending" as const,
};
const accountToken = "A".repeat(43);
const acceptLink = `https://lace.test/admin/accept-invite#token=${accountToken}`;

test("creates an enabled user with a credentialed POST and validates the response", async () => {
  const user = { disabled: false, email: "new@lace.test", id: "new-user", role: "editor" };
  const input = { email: user.email, role: "editor" } as const;
  const payload = { delivery: { status: "sent" }, user };
  const fetcher = vi.fn(async () => Response.json(payload, { status: 201 }));
  await expect(createAdminClient(fetcher as typeof fetch).createUser(input)).resolves.toEqual(
    payload,
  );
  expect(fetcher).toHaveBeenCalledWith(
    "/api/v1/admin/users",
    expect.objectContaining({
      body: JSON.stringify(input),
      credentials: "same-origin",
      method: "POST",
    }),
  );
  await expect(
    createAdminClient(async () => Response.json({ ...payload, link: acceptLink })).createUser(
      input,
    ),
  ).rejects.toBeInstanceOf(AdminClientError);
});

test("uses validated credentialed user, status, and token endpoints", async () => {
  const account = { disabled: false, email: "editor@lace.test", id: "user-1", role: "editor" };
  const token = {
    capabilities: ["content:build:read"],
    createdAt: "2026-09-20T00:00:00.000Z",
    id: "token-1",
    name: "Local site",
    tokenPrefix: "lace_123",
  };
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/settings/status"))
      return Response.json({
        configuredModels: 2,
        mcp: { enabled: false, endpoint: "https://lace.test/mcp" },
        email: { provider: "none" as const },
        engineVersion: "0.1.0-alpha.4",
        ready: true,
      });
    if (path.includes("/users?after="))
      return Response.json({ items: [], total: 1, disabledCount: 0 });
    if (path.endsWith("/users"))
      return Response.json({ items: [account], total: 1, disabledCount: 0, nextCursor: "next" });
    if (path.endsWith("/user-1")) return Response.json({ ...account, role: "admin" });
    if (path.endsWith("/api-tokens") && init?.method === "POST")
      return Response.json({ ...token, token: "secret" }, { status: 201 });
    if (path.endsWith("/api-tokens")) return Response.json({ items: [token] });
    return Response.json({ ...token, revokedAt: "2026-09-21T00:00:00.000Z" });
  });
  const client = createAdminClient(fetcher as typeof fetch);
  await expect(client.listUsers()).resolves.toEqual({
    items: [account],
    nextCursor: "next",
    total: 1,
    disabledCount: 0,
  });
  await expect(client.listUsers("a&b")).resolves.toEqual({ items: [], total: 1, disabledCount: 0 });
  expect(fetcher).toHaveBeenLastCalledWith("/api/v1/admin/users?after=a%26b", expect.anything());
  await expect(client.updateUser("user-1", { role: "admin" })).resolves.toMatchObject({
    role: "admin",
  });
  await expect(client.loadSettingsStatus()).resolves.toEqual({
    configuredModels: 2,
    mcp: { enabled: false, endpoint: "https://lace.test/mcp" },
    email: { provider: "none" as const },
    engineVersion: "0.1.0-alpha.4",
    ready: true,
  });
  await expect(client.listTokens()).resolves.toEqual({ items: [token] });
  await expect(client.createToken("Local site")).resolves.toMatchObject({ token: "secret" });
  await expect(client.revokeToken("token-1")).resolves.toMatchObject({
    revokedAt: "2026-09-21T00:00:00.000Z",
  });
  expect(fetcher.mock.calls.every(([, init]) => init?.credentials === "same-origin")).toBe(true);
  await expect(
    createAdminClient(async () => Response.json({ items: [{ token: "secret" }] })).listTokens(),
  ).rejects.toBeInstanceOf(AdminClientError);
});

test("uses validated import-token endpoints and media hashes", async () => {
  const token = {
    capabilities: ["content:import", "content:publish"],
    createdAt: "2026-10-31T00:00:00.000Z",
    createdBy: { email: "admin@lace.test", id: "admin-1" },
    expiresAt: "2026-11-03T00:00:00.000Z",
    id: "import-1",
    name: "Framer",
    tokenPrefix: "abcdefgh",
  };
  const bodies: unknown[] = [];
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.body !== undefined) bodies.push(JSON.parse(String(init.body)));
    if (path.endsWith("/import-tokens") && init?.method === "POST")
      return Response.json({ ...token, token: "secret" }, { status: 201 });
    if (path.endsWith("/import-tokens")) return Response.json({ items: [token] });
    return Response.json({ ...token, revokedAt: "2026-11-01T00:00:00.000Z" });
  });
  const client = createAdminClient(fetcher as typeof fetch);
  await expect(client.listImportTokens()).resolves.toEqual({ items: [token] });
  await expect(
    client.createImportToken({ allowPublish: true, expiresInDays: 3, name: "Framer" }),
  ).resolves.toMatchObject({
    capabilities: ["content:import", "content:publish"],
    token: "secret",
  });
  expect(bodies).toEqual([{ allowPublish: true, expiresInDays: 3, name: "Framer" }]);
  await expect(client.revokeImportToken("import/1")).resolves.toMatchObject({
    revokedAt: "2026-11-01T00:00:00.000Z",
  });
  expect(fetcher.mock.calls.at(-1)?.[0]).toBe("/api/v1/admin/import-tokens/import%2F1");
  await expect(
    createAdminClient(async () =>
      Response.json({ items: [{ ...token, token: "secret" }] }),
    ).listImportTokens(),
  ).rejects.toBeInstanceOf(AdminClientError);
});

test("sends credentialed invitation, reset, and sign-out commands for other users", async () => {
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/api/v1/admin/invitations" && init?.method === "POST")
      return Response.json(
        {
          delivery: { reason: "not_configured", status: "failed" },
          invitation,
          link: acceptLink,
        },
        { status: 201 },
      );
    if (path === "/api/v1/admin/invitations") return Response.json({ items: [invitation] });
    if (path.endsWith("/resend"))
      return Response.json({ delivery: { status: "sent" }, invitation });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (path.endsWith("/password-reset")) return Response.json({ delivery: { status: "sent" } });
    return Response.json({ revoked: 3 });
  });
  const client = createAdminClient(fetcher as typeof fetch);
  await expect(client.listInvitations()).resolves.toEqual({ items: [invitation] });
  await expect(
    client.createInvitation({ email: "new@lace.test", role: "editor" }),
  ).resolves.toMatchObject({ link: acceptLink });
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/admin/invitations",
    expect.objectContaining({
      body: JSON.stringify({ email: "new@lace.test", role: "editor" }),
      method: "POST",
    }),
  );
  await expect(client.resendInvitation("invitation/1")).resolves.toEqual({
    delivery: { status: "sent" },
    invitation,
  });
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/admin/invitations/invitation%2F1/resend",
    expect.objectContaining({ body: "{}", method: "POST" }),
  );
  await expect(client.revokeInvitation("invitation-1")).resolves.toBeUndefined();
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/admin/invitations/invitation-1",
    expect.objectContaining({ method: "DELETE" }),
  );
  await expect(client.sendPasswordReset("user-1")).resolves.toEqual({
    delivery: { status: "sent" },
  });
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/admin/users/user-1/password-reset",
    expect.objectContaining({ body: "{}", method: "POST" }),
  );
  await expect(client.signOutUser("user-1")).resolves.toEqual({ revoked: 3 });
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/admin/users/user-1/sessions/revoke",
    expect.objectContaining({ body: "{}", method: "POST" }),
  );
  expect(fetcher.mock.calls.every(([, init]) => init?.credentials === "same-origin")).toBe(true);
  // A sent invitation never carries a link, and an unsent one always does.
  await expect(
    createAdminClient(async () =>
      Response.json({ delivery: { status: "sent" }, invitation, link: acceptLink }),
    ).createInvitation({ email: "new@lace.test", role: "editor" }),
  ).rejects.toBeInstanceOf(AdminClientError);
  await expect(
    createAdminClient(async () =>
      Response.json({ delivery: { reason: "rejected", status: "failed" } }),
    ).sendPasswordReset("user-1"),
  ).rejects.toBeInstanceOf(AdminClientError);
});

test("carries account tokens only in JSON bodies of public account requests", async () => {
  const fetcher = vi.fn(async (path: string, _init?: RequestInit) => {
    if (path.endsWith("/inspect"))
      return Response.json({
        email: "new@lace.test",
        expiresAt: "2026-10-04T00:00:00.000Z",
        role: "editor",
      });
    if (path.endsWith("/accept")) return Response.json({ email: "new@lace.test" }, { status: 201 });
    if (path.endsWith("/request")) return new Response(null, { status: 202 });
    return new Response(null, { status: 204 });
  });
  const client = createAdminClient(fetcher as typeof fetch);
  await expect(client.inspectInvitation(accountToken)).resolves.toMatchObject({ role: "editor" });
  await expect(
    client.acceptInvitation({ password: "long-password-123", token: accountToken }),
  ).resolves.toEqual({ email: "new@lace.test" });
  await expect(client.requestPasswordReset("someone@lace.test")).resolves.toBeUndefined();
  await expect(
    client.confirmPasswordReset({ password: "long-password-123", token: accountToken }),
  ).resolves.toBeUndefined();
  expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
    "/api/v1/invitations/inspect",
    "/api/v1/invitations/accept",
    "/api/v1/password-reset/request",
    "/api/v1/password-reset/confirm",
  ]);
  for (const [path, init] of fetcher.mock.calls) {
    expect(path).not.toContain(accountToken);
    expect(init).toMatchObject({ credentials: "same-origin", method: "POST" });
  }
  expect(fetcher.mock.calls[3]?.[1]?.body).toBe(
    JSON.stringify({ password: "long-password-123", token: accountToken }),
  );

  const invalid = createAdminClient(async () =>
    Response.json(
      {
        error: {
          code: "INVITATION_INVALID",
          details: { issues: [{ code: "invalid", message: "Bad token.", path: "/token" }] },
          message: "The invitation is invalid or has expired.",
        },
      },
      { status: 410 },
    ),
  );
  const error = await invalid.acceptInvitation({ password: "x", token: accountToken }).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AdminClientError);
  expect(error).toMatchObject({ code: "INVITATION_INVALID", issues: undefined, status: 410 });
});

test("reads and changes the signed-in user's own account", async () => {
  const sessionItem = {
    browser: "Firefox",
    createdAt: "2026-10-01T00:00:00.000Z",
    current: true,
    id: "session-1",
    lastActiveAt: "2026-10-02T00:00:00.000Z",
    os: "Linux",
  };
  const summary = {
    permissions: ["content:read"],
    user: { displayName: "Ada Lovelace", email: "ada@lace.test", id: "user-1", role: "viewer" },
  };
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/api/v1/account") return Response.json(summary);
    if (path === "/api/v1/account/sessions") return Response.json({ items: [sessionItem] });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({ revoked: 2 });
  });
  const client = createAdminClient(fetcher as typeof fetch);
  await expect(client.updateProfile({ displayName: "Ada Lovelace" })).resolves.toEqual(summary);
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/account",
    expect.objectContaining({
      body: JSON.stringify({ displayName: "Ada Lovelace" }),
      method: "PATCH",
    }),
  );
  await expect(
    client.changePassword({
      currentPassword: "old-password",
      newPassword: "new-password-123",
      signOutOtherSessions: true,
    }),
  ).resolves.toEqual({ revoked: 2 });
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/account/password",
    expect.objectContaining({ method: "POST" }),
  );
  await expect(client.listSessions()).resolves.toEqual({ items: [sessionItem] });
  await expect(client.deleteSession("session/2")).resolves.toBeUndefined();
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/account/sessions/session%2F2",
    expect.objectContaining({ method: "DELETE" }),
  );
  await expect(client.revokeOtherSessions()).resolves.toEqual({ revoked: 2 });
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/account/sessions/revoke-others",
    expect.objectContaining({ body: "{}", method: "POST" }),
  );
  await expect(
    createAdminClient(async () =>
      Response.json({ items: [{ ...sessionItem, token: "secret" }] }),
    ).listSessions(),
  ).rejects.toBeInstanceOf(AdminClientError);
});

test("setup transport validates state and submits the existing guarded payload", async () => {
  const fetcher = vi.fn(async (path: string) =>
    Response.json(
      path.endsWith("/state")
        ? { setupComplete: false }
        : { id: "admin", email: "admin@lace.test", role: "admin", disabled: false },
    ),
  );
  const client = createAdminClient(fetcher as typeof fetch);
  expect(await client.loadSetupState()).toEqual({ setupComplete: false });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/v1/setup/state",
    expect.objectContaining({ cache: "no-store", credentials: "same-origin" }),
  );
  const input = {
    email: "admin@lace.test",
    password: "correct horse battery staple",
    token: "A".repeat(43),
  };
  await client.setupAdmin(input);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/v1/setup/admin",
    expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify(input),
    }),
  );
  await expect(client.setupAdmin({ ...input, password: "short" })).rejects.toMatchObject({
    status: 422,
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  await expect(
    createAdminClient(async () =>
      Response.json({ setupComplete: false, email: "private" }),
    ).loadSetupState(),
  ).rejects.toBeInstanceOf(AdminClientError);
});

test("setup transport strips even credential-reflecting server errors", async () => {
  const client = createAdminClient(async () =>
    Response.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "private-secret",
          details: { password: "private-secret" },
        },
      },
      { status: 404 },
    ),
  );
  await expect(
    client.setupAdmin({
      email: "admin@lace.test",
      password: "correct horse battery staple",
      token: "A".repeat(43),
    }),
  ).rejects.toMatchObject({ status: 404, message: "Administrator setup could not be confirmed." });
});
