import { actorId, unixMilliseconds } from "@lacecms/domain";
import { describe, expect, test, vi } from "vitest";
import {
  AccountError,
  AccountUseCases,
  EMAIL_SENT,
  INVITATION_TTL_MS,
  RateLimitExceededError,
  accountLink,
  emailFailed,
  invitationEmailTemplate,
  passwordChangedEmailTemplate,
  passwordResetEmailTemplate,
  summarizeUserAgent,
  unconfiguredEmailSender,
} from "../dist/index.js";

const NOW = 1_800_000_000_000;
const BASE = "https://cms.example.com/";
const TOKEN = "T".repeat(43);
const admin = { id: actorId("admin-1"), role: "admin" };
const editor = { id: actorId("editor-1"), role: "editor" };

function memorySecurity() {
  const users = new Map([
    ["admin-1", { disabled: false, email: "admin@example.com", name: "Ada <Admin>" }],
    ["editor-1", { disabled: false, email: "editor@example.com", name: "Ed" }],
    ["off-1", { disabled: true, email: "off@example.com", name: "Off" }],
  ]);
  const sessions = [
    {
      createdAt: NOW - 10,
      id: "s-current",
      lastActiveAt: NOW - 1,
      userAgent: undefined,
      userId: "editor-1",
    },
    {
      createdAt: NOW - 20,
      id: "s-other",
      lastActiveAt: NOW - 2,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
      userId: "editor-1",
    },
  ];
  const invitation = {
    createdAt: unixMilliseconds(NOW),
    email: "new@example.com",
    expiresAt: unixMilliseconds(NOW + INVITATION_TTL_MS),
    id: "inv-1",
    invitedBy: "admin-1",
    invitedByName: "Ada <Admin>",
    role: "editor",
  };
  return {
    sessions,
    users,
    acceptInvitation: vi.fn(async () => ({ status: "invalid" })),
    changePassword: vi.fn(async (input) =>
      input.currentPassword === "right password"
        ? { revoked: input.keepSessionId === undefined ? 0 : 1, status: "changed" }
        : { status: "invalid_credentials" },
    ),
    confirmPasswordReset: vi.fn(async () => ({ status: "invalid" })),
    createInvitation: vi.fn(async (input) =>
      input.email === "taken@example.com"
        ? { status: "conflict" }
        : {
            invitation: { ...invitation, email: input.email, role: input.role },
            status: "created",
            token: TOKEN,
          },
    ),
    deleteOtherSessions: vi.fn(async () => 1),
    deleteSession: vi.fn(async ({ sessionId, userId }) =>
      sessions.some((session) => session.id === sessionId && session.userId === userId),
    ),
    deleteUserSessions: vi.fn(async ({ userId }) => (users.has(userId) ? 2 : null)),
    inspectInvitation: vi.fn(async () => null),
    issuePasswordReset: vi.fn(async ({ target }) => {
      const entry = [...users.entries()].find(([id, value]) =>
        "email" in target ? value.email === target.email : id === target.userId,
      );
      if (entry === undefined) return { status: "not_found" };
      if (entry[1].disabled) return { status: "disabled" };
      return { email: entry[1].email, status: "issued", token: TOKEN, userId: entry[0] };
    }),
    listInvitations: vi.fn(async () => [
      invitation,
      { ...invitation, expiresAt: unixMilliseconds(NOW - 1), id: "inv-old" },
    ]),
    listSessions: vi.fn(async ({ userId }) =>
      sessions.filter((session) => session.userId === userId),
    ),
    readUserProfile: vi.fn(async (id) => users.get(id) ?? null),
    reissueInvitation: vi.fn(async () => ({ status: "not_found" })),
    revokeInvitation: vi.fn(async () => "revoked"),
    updateDisplayName: vi.fn(async () => true),
  };
}

function useCases(overrides = {}) {
  const security = overrides.security ?? memorySecurity();
  const email = overrides.email ?? {
    from: "Lace <cms@example.com>",
    provider: "log",
    send: vi.fn(async () => EMAIL_SENT),
  };
  const accounts = new AccountUseCases({
    clock: { now: () => unixMilliseconds(NOW) },
    email,
    ...(overrides.limiter === undefined ? {} : { limiter: overrides.limiter }),
    publicBaseUrl: BASE,
    security,
  });
  return { accounts, email, security };
}

describe("administrator invitations", () => {
  test("deny actors without users:manage before any port call", async () => {
    const { accounts, email, security } = useCases();
    await expect(
      accounts.invite(editor, { email: "x@example.com", role: "viewer" }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(accounts.listInvitations(editor)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    await expect(accounts.resendInvitation(editor, "inv-1")).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    await expect(accounts.revokeInvitation(editor, "inv-1")).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    await expect(accounts.sendPasswordReset(editor, "admin-1")).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    await expect(accounts.signOutUser(editor, "admin-1")).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(security.createInvitation).not.toHaveBeenCalled();
    expect(security.issuePasswordReset).not.toHaveBeenCalled();
    expect(security.deleteUserSessions).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  test("a sent invitation carries no link and normalizes the address", async () => {
    const { accounts, email, security } = useCases();
    const result = await accounts.invite(admin, { email: " New@Example.com ", role: "editor" });
    expect(security.createInvitation).toHaveBeenCalledWith({
      email: "new@example.com",
      invitedBy: "admin-1",
      now: NOW,
      role: "editor",
    });
    expect(result).toEqual({
      delivery: { status: "sent" },
      invitation: {
        createdAt: NOW,
        email: "new@example.com",
        expiresAt: NOW + INVITATION_TTL_MS,
        id: "inv-1",
        invitedBy: "Ada <Admin>",
        role: "editor",
        state: "pending",
      },
    });
    const message = email.send.mock.calls[0][0];
    expect(message.to).toBe("new@example.com");
    expect(message.text).toContain(`${BASE}admin/accept-invite#token=${TOKEN}`);
    expect(message.text).toContain("Editor");
    expect(message.text).toContain("72 hours");
    expect(message.html).toContain("Ada &lt;Admin&gt;");
  });

  test("an undelivered invitation returns the accept link once", async () => {
    const { accounts } = useCases({ email: unconfiguredEmailSender });
    const result = await accounts.invite(admin, { email: "new@example.com", role: "viewer" });
    expect(result.delivery).toEqual({ reason: "not_configured", status: "failed" });
    expect(result.link).toBe(`${BASE}admin/accept-invite#token=${TOKEN}`);
    const failing = useCases({
      email: {
        from: "x@example.com",
        provider: "smtp",
        send: async () => emailFailed("unavailable"),
      },
    });
    expect(
      (await failing.accounts.invite(admin, { email: "n@example.com", role: "viewer" })).link,
    ).toContain("#token=");
  });

  test("conflicts and missing invitations map to closed errors", async () => {
    const { accounts, security } = useCases();
    await expect(
      accounts.invite(admin, { email: "taken@example.com", role: "viewer" }),
    ).rejects.toEqual(new AccountError("CONFLICT"));
    await expect(accounts.resendInvitation(admin, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    security.reissueInvitation.mockResolvedValueOnce({ status: "conflict" });
    await expect(accounts.resendInvitation(admin, "accepted")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    security.revokeInvitation.mockResolvedValueOnce("conflict");
    await expect(accounts.revokeInvitation(admin, "accepted")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    security.revokeInvitation.mockResolvedValueOnce("not_found");
    await expect(accounts.revokeInvitation(admin, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("listed invitations derive pending and expired states without tokens", async () => {
    const { accounts } = useCases();
    const items = await accounts.listInvitations(admin);
    expect(items.map((item) => [item.id, item.state])).toEqual([
      ["inv-1", "pending"],
      ["inv-old", "expired"],
    ]);
    for (const item of items) expect(JSON.stringify(item)).not.toContain(TOKEN);
  });

  test("public inspection and acceptance fail with the invalid-invitation outcome", async () => {
    const { accounts, security } = useCases();
    await expect(accounts.inspectInvitation({ token: TOKEN })).rejects.toMatchObject({
      code: "INVITATION_INVALID",
    });
    await expect(
      accounts.acceptInvitation({ password: "x".repeat(12), token: TOKEN }),
    ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
    security.acceptInvitation.mockResolvedValueOnce({ status: "conflict" });
    await expect(
      accounts.acceptInvitation({ password: "x".repeat(12), token: TOKEN }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    security.acceptInvitation.mockResolvedValueOnce({
      status: "accepted",
      user: { disabled: false, email: "new@example.com", id: "u-2", role: "editor" },
    });
    await expect(
      accounts.acceptInvitation({ displayName: "  Ada  ", password: "x".repeat(12), token: TOKEN }),
    ).resolves.toEqual({ email: "new@example.com" });
    expect(security.acceptInvitation).toHaveBeenLastCalledWith(
      expect.objectContaining({ displayName: "Ada" }),
    );
  });
});

describe("password recovery", () => {
  test("reset requests are uniform for unknown and disabled accounts and defer delivery", async () => {
    const { accounts, email, security } = useCases();
    const deferred = [];
    const defer = (task) => deferred.push(task);
    for (const address of ["nobody@example.com", "OFF@example.com"])
      await expect(
        accounts.requestPasswordReset({ defer, email: address }),
      ).resolves.toBeUndefined();
    expect(deferred).toHaveLength(0);
    expect(email.send).not.toHaveBeenCalled();
    await expect(
      accounts.requestPasswordReset({ defer, email: " Editor@Example.com" }),
    ).resolves.toBeUndefined();
    expect(security.issuePasswordReset).toHaveBeenLastCalledWith({
      now: NOW,
      target: { email: "editor@example.com" },
    });
    expect(deferred).toHaveLength(1);
    await deferred[0];
    expect(email.send.mock.calls[0][0]).toMatchObject({ to: "editor@example.com" });
    expect(email.send.mock.calls[0][0].text).toContain(
      `${BASE}admin/reset-password#token=${TOKEN}`,
    );
  });

  test("the response never waits for a slow sender", async () => {
    let release;
    const slow = {
      from: "x@example.com",
      provider: "smtp",
      send: () => new Promise((resolve) => (release = resolve)),
    };
    const { accounts } = useCases({ email: slow });
    const deferred = [];
    await accounts.requestPasswordReset({
      defer: (task) => deferred.push(task),
      email: "editor@example.com",
    });
    expect(deferred).toHaveLength(1);
    release(EMAIL_SENT);
  });

  test("per-email limits refuse a fourth request before issuing", async () => {
    const counts = new Map();
    const limiter = {
      check: vi.fn(async ({ operation, subject }) => {
        const key = `${operation}:${subject}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return { allowed: counts.get(key) <= 3, retryAfterSeconds: 1200 };
      }),
    };
    const { accounts, security } = useCases({ limiter });
    for (let index = 0; index < 3; index += 1)
      await accounts.requestPasswordReset({ defer: () => undefined, email: "Editor@example.com" });
    await expect(
      accounts.requestPasswordReset({ defer: () => undefined, email: "editor@EXAMPLE.com" }),
    ).rejects.toEqual(new RateLimitExceededError(1200));
    expect(limiter.check).toHaveBeenLastCalledWith({
      now: NOW,
      operation: "reset",
      subject: "editor@example.com",
    });
    expect(security.issuePasswordReset).toHaveBeenCalledTimes(3);
  });

  test("confirmation failures share one invalid-reset outcome", async () => {
    const { accounts, security } = useCases();
    await expect(
      accounts.confirmPasswordReset({ password: "x".repeat(12), token: TOKEN }),
    ).rejects.toMatchObject({ code: "RESET_INVALID" });
    security.confirmPasswordReset.mockResolvedValueOnce({ status: "reset", userId: "editor-1" });
    await expect(
      accounts.confirmPasswordReset({ password: "x".repeat(12), token: TOKEN }),
    ).resolves.toBeUndefined();
  });

  test("administrator resets report delivery and hand over undelivered links once", async () => {
    const sent = useCases();
    await expect(sent.accounts.sendPasswordReset(admin, "editor-1")).resolves.toEqual({
      delivery: { status: "sent" },
    });
    expect(sent.security.issuePasswordReset).toHaveBeenCalledWith({
      now: NOW,
      requestedBy: "admin-1",
      target: { userId: "editor-1" },
    });
    const unsent = useCases({ email: unconfiguredEmailSender });
    await expect(unsent.accounts.sendPasswordReset(admin, "editor-1")).resolves.toEqual({
      delivery: { reason: "not_configured", status: "failed" },
      link: `${BASE}admin/reset-password#token=${TOKEN}`,
    });
    await expect(sent.accounts.sendPasswordReset(admin, "off-1")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(sent.accounts.sendPasswordReset(admin, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("self-service", () => {
  test("password changes require the current password and defer the notice", async () => {
    const { accounts, email, security } = useCases();
    const deferred = [];
    const defer = (task) => deferred.push(task);
    await expect(
      accounts.changePassword(editor, "s-current", {
        currentPassword: "wrong",
        defer,
        newPassword: "x".repeat(12),
        signOutOtherSessions: true,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(deferred).toHaveLength(0);
    await expect(
      accounts.changePassword(editor, "s-current", {
        currentPassword: "right password",
        defer,
        newPassword: "x".repeat(12),
        signOutOtherSessions: true,
      }),
    ).resolves.toEqual({ revoked: 1 });
    expect(security.changePassword).toHaveBeenLastCalledWith(
      expect.objectContaining({ keepSessionId: "s-current", userId: "editor-1" }),
    );
    expect(deferred).toHaveLength(1);
    await deferred[0];
    expect(email.send.mock.calls[0][0]).toMatchObject({
      subject: "Your Lace CMS password was changed",
      to: "editor@example.com",
    });
    await accounts.changePassword(editor, "s-current", {
      currentPassword: "right password",
      defer,
      newPassword: "x".repeat(12),
      signOutOtherSessions: false,
    });
    expect(security.changePassword.mock.lastCall[0]).not.toHaveProperty("keepSessionId");
  });

  test("no password-changed notice is scheduled without an email provider", async () => {
    const { accounts } = useCases({ email: unconfiguredEmailSender });
    const defer = vi.fn();
    await accounts.changePassword(editor, "s-current", {
      currentPassword: "right password",
      defer,
      newPassword: "x".repeat(12),
      signOutOtherSessions: false,
    });
    expect(defer).not.toHaveBeenCalled();
  });

  test("sessions mark the current one and the current session cannot be deleted", async () => {
    const { accounts, security } = useCases();
    const sessions = await accounts.listSessions(editor, "s-current");
    expect(sessions).toEqual([
      {
        browser: "Unknown",
        createdAt: NOW - 10,
        current: true,
        id: "s-current",
        lastActiveAt: NOW - 1,
        os: "Unknown",
      },
      {
        browser: "Firefox",
        createdAt: NOW - 20,
        current: false,
        id: "s-other",
        lastActiveAt: NOW - 2,
        os: "Linux",
      },
    ]);
    await expect(accounts.deleteSession(editor, "s-current", "s-current")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(security.deleteSession).not.toHaveBeenCalled();
    await expect(accounts.deleteSession(editor, "s-current", "foreign")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(accounts.deleteSession(editor, "s-current", "s-other")).resolves.toBeUndefined();
    await expect(accounts.deleteOtherSessions(editor, "s-current")).resolves.toEqual({
      revoked: 1,
    });
    await expect(accounts.deleteOtherSessions(editor, null)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  test("display names are trimmed and bounded", async () => {
    const { accounts, security } = useCases();
    await accounts.updateDisplayName(editor, "  Ada Lovelace ");
    expect(security.updateDisplayName).toHaveBeenCalledWith({
      displayName: "Ada Lovelace",
      now: NOW,
      userId: "editor-1",
    });
    await expect(accounts.updateDisplayName(editor, "   ")).rejects.toThrow(TypeError);
  });

  test("administrators sign users out everywhere", async () => {
    const { accounts } = useCases();
    await expect(accounts.signOutUser(admin, "editor-1")).resolves.toEqual({ revoked: 2 });
    await expect(accounts.signOutUser(admin, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

test("user agents classify into coarse browser and OS families", () => {
  const cases = [
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
      "Edge",
      "Windows",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      "Safari",
      "macOS",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Safari",
      "iOS",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1",
      "Chrome",
      "iOS",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
      "Chrome",
      "Android",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0",
      "Opera",
      "Linux",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
      "Firefox",
      "Windows",
    ],
    ["curl/8.6.0", "Unknown", "Unknown"],
    [undefined, "Unknown", "Unknown"],
  ];
  for (const [agent, browser, os] of cases)
    expect(summarizeUserAgent(agent)).toEqual({ browser, os });
});

test("account templates escape every paragraph and state expiry in hours", () => {
  const hostile = "<script>alert(1)</script>";
  const invitation = invitationEmailTemplate({
    expiresInHours: 72,
    inviterName: hostile,
    link: `${BASE}admin/accept-invite#token=${TOKEN}`,
    role: "viewer",
    siteUrl: `${BASE}"><img>`,
  });
  expect(invitation.html).not.toContain("<script>");
  expect(invitation.html).not.toContain('"><img>');
  expect(invitation.html).toContain(`<a href="${BASE}admin/accept-invite#token=${TOKEN}">`);
  expect(invitation.text).toContain("expires in 72 hours");
  expect(invitation.text).toContain("Viewer");
  expect(invitation.text).toContain("ignore this email");
  const reset = passwordResetEmailTemplate({
    expiresInHours: 1,
    link: accountLink(BASE, "admin/reset-password", TOKEN),
    requestedByAdministrator: false,
    siteUrl: hostile,
  });
  expect(reset.html).not.toContain("<script>");
  expect(reset.text).toContain("expires in 1 hour.");
  const changed = passwordChangedEmailTemplate({ siteUrl: hostile });
  expect(changed.html).not.toContain("<script>");
  expect(() => accountLink("https://cms.example.com", "admin/accept-invite", TOKEN)).toThrow(
    TypeError,
  );
});
