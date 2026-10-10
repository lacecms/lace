import { expect, test, type Browser, type Locator, type Page, type Route } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";
import { sessionPath, sessionSummary } from "./support/session.js";

type Role = "admin" | "editor";

// Match API calls by pathname prefix so Vite module URLs under /src/shared/api
// are never intercepted.
const isApiRequest = (url: URL) => url.pathname.startsWith("/api/");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const createdAt = "2026-09-20T09:00:00.000Z";
const updatedAt = "2026-09-24T15:30:00.000Z";

const heroBlock = {
  defaultValue: { heading: "Hero" },
  description: "A large heading at the top of the page.",
  fields: { heading: { required: true, type: "text" } },
  label: "Hero",
  type: "hero",
  version: 1,
};
const richTextBlock = {
  fields: { body: { required: false, type: "richText" } },
  label: "Rich text",
  type: "richText",
  version: 1,
};
const models = [
  {
    blockDefinitions: [heroBlock, richTextBlock],
    blocks: ["hero", "richText"],
    fields: {},
    key: "home",
    kind: "page",
    label: "Home",
    path: "/",
    version: 1,
  },
  {
    blockDefinitions: [heroBlock, richTextBlock],
    blocks: ["hero", "richText"],
    fields: {
      category: { options: ["news", "guide"], required: false, type: "select" },
      cover: { required: false, type: "media" },
      featured: { required: false, type: "boolean" },
      publishedOn: { required: false, type: "date" },
      summary: { label: "Summary", required: false, type: "text" },
    },
    key: "posts",
    kind: "collection",
    label: "Posts",
    listFields: ["category", "featured"],
    route: "/posts/:slug",
    version: 1,
  },
];

const blocks = [
  {
    data: { heading: "Welcome to Lace" },
    key: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
    position: 0,
    schemaVersion: 1,
    type: "hero",
  },
  {
    data: {
      body: {
        content: [
          { content: [{ text: "Stories from the team.", type: "text" }], type: "paragraph" },
        ],
        type: "doc",
      },
    },
    key: "01J8Z3K4M5N6P7Q8R9S0T1V2W4",
    position: 1,
    schemaVersion: 1,
    type: "richText",
  },
];

function entry(id: string, modelKey: string, title: string, slug?: string) {
  const model = models.find((candidate) => candidate.key === modelKey)!;
  return {
    draft: {
      blocks,
      createdAt,
      entryId: id,
      fields:
        modelKey === "posts"
          ? {
              category: "news",
              cover: "media-1",
              featured: true,
              publishedOn: "2026-09-20",
              summary: "Launch notes",
            }
          : {},
      id: `${id}-draft`,
      revision: 2,
      ...(slug === undefined ? {} : { slug }),
      state: "draft",
      title,
      updatedAt,
      updatedBy: { id: "editor-1", role: "editor" },
    },
    id,
    model:
      model.kind === "page"
        ? { key: model.key, kind: model.kind, path: model.path }
        : { key: model.key, kind: model.kind, route: model.route },
    updatedBy: { displayName: "Eddie Editor", id: "editor-1" },
  };
}

function summary(
  id: string,
  modelKey: string,
  title: string,
  status: "changed" | "draft",
  slug?: string,
) {
  return {
    draftRevision: 2,
    id,
    listValues: modelKey === "posts" ? { category: "news", featured: true } : {},
    modelKey,
    ...(status === "draft"
      ? {}
      : { publishedAt: createdAt, publishedSnapshotId: `${id}-published` }),
    ...(slug === undefined ? {} : { slug }),
    status,
    title,
    updatedAt,
    updatedBy: { displayName: "Eddie Editor", id: "editor-1" },
  };
}

function media(id: string, filename: string, usageCount: number) {
  return {
    createdAt,
    createdBy: { displayName: "Eddie Editor", id: "editor-1" },
    filename,
    height: 600,
    id,
    mimeType: "image/png",
    size: 2048,
    status: "active",
    updatedAt: createdAt,
    url: `https://lace.test/api/v1/public/media/${id}`,
    usageCount,
    width: 800,
  };
}

const token = {
  capabilities: ["content:build:read"],
  createdAt,
  id: "token-1",
  lastUsedAt: updatedAt,
  name: "Production site",
  tokenPrefix: "lace_bt_ab12",
};

const buildStatuses = [
  "pending",
  "running",
  "accepted",
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
] as const;
const buildLabel = (status: (typeof buildStatuses)[number]) =>
  status[0]!.toUpperCase() + status.slice(1);
const builds = buildStatuses.map((status, index) => ({
  id: `build-${status}`,
  reason: "publication",
  status,
  targetVersion: buildStatuses.length - index,
  requestedBy: "admin-1",
  requestedAt: createdAt,
  ...(status === "pending" ? {} : { startedAt: createdAt }),
  ...(["pending", "running"].includes(status) ? {} : { completedAt: updatedAt }),
  ...(["accepted", "cancelled", "unknown"].includes(status)
    ? { providerBuildId: `dep-${status}` }
    : {}),
  ...(status === "failed" ? { error: "build_failed" } : {}),
}));

const accountToken = "e2eAccountToken_0123456789abcdefghijklmnopqr".slice(0, 43);
const link = `http://127.0.0.1:4173/admin/accept-invite#token=${accountToken}`;
const invitation = {
  createdAt,
  email: "pending@lace.test",
  expiresAt: "2099-01-01T00:00:00.000Z",
  id: "invitation-1",
  invitedBy: "Ada Admin",
  role: "editor",
  state: "pending",
};
const accountSessions = [
  {
    browser: "Chrome",
    createdAt,
    current: true,
    id: "session-1",
    lastActiveAt: updatedAt,
    os: "macOS",
  },
  {
    browser: "Safari",
    createdAt,
    current: false,
    id: "session-2",
    lastActiveAt: createdAt,
    os: "iOS",
  },
];

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}

/** Mocks every admin API the routes read, with populated realistic data. */
async function mockAdmin(page: Page, options: { role?: Role; signedIn?: boolean } = {}) {
  const role = options.role ?? "admin";
  let signedIn = options.signedIn ?? true;
  const entries = {
    "entry-1": entry("entry-1", "posts", "Launch notes", "launch-notes"),
    "entry-home": entry("entry-home", "home", "Home"),
  } as Record<string, ReturnType<typeof entry> & { published?: unknown }>;
  const lists: Record<string, ReturnType<typeof summary>[]> = {
    home: [summary("entry-home", "home", "Home", "changed")],
    posts: [
      summary("entry-1", "posts", "Launch notes", "changed", "launch-notes"),
      summary("entry-2", "posts", "Draft ideas", "draft", "draft-ideas"),
    ],
  };
  const library = [media("media-1", "hero.png", 1), media("media-2", "team.png", 0)];
  const tokens: Array<Omit<typeof token, "lastUsedAt"> & { lastUsedAt?: string }> = [token];
  const invitations: Array<Omit<typeof invitation, "role"> & { role: string }> = [
    invitation,
    {
      ...invitation,
      email: "late@lace.test",
      id: "invitation-0",
      role: "viewer",
      state: "expired",
    },
  ];
  await page.route(isApiRequest, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path === "/api/v1/setup/state") return json(route, { setupComplete: true });
    if (path === sessionPath)
      return json(
        route,
        signedIn
          ? sessionSummary({
              displayName: `Ada ${role === "admin" ? "Admin" : "Editor"}`,
              id: `${role}-1`,
              role,
            })
          : null,
      );
    if (path === "/api/auth/sign-in/email" && method === "POST") {
      signedIn = true;
      return json(route, { redirect: false, token: "session", user: { id: `${role}-1` } });
    }
    if (path === "/api/auth/sign-out") {
      signedIn = false;
      return json(route, { success: true });
    }
    if (path === "/api/v1/admin/content-models") return json(route, { items: models });
    const list = /^\/api\/v1\/admin\/models\/([^/]+)\/entries$/u.exec(path);
    if (list !== null && method === "GET") {
      const items = lists[list[1]!] ?? [];
      return json(route, {
        items,
        totals: {
          all: items.length,
          changed: items.filter((item) => item.status === "changed").length,
          draft: items.filter((item) => item.status === "draft").length,
          published: 0,
        },
      });
    }
    const single = /^\/api\/v1\/admin\/entries\/([^/]+)(\/draft|\/publish)?$/u.exec(path);
    if (single !== null) {
      const current = entries[single[1]!];
      if (current === undefined)
        return json(route, { error: { code: "NOT_FOUND", message: "Not found." } }, 404);
      if (single[2] === "/draft" && method === "PUT") {
        const { expectedRevision: _expectedRevision, ...draft } = request.postDataJSON() as Record<
          string,
          unknown
        >;
        entries[single[1]!] = {
          ...current,
          draft: { ...current.draft, ...draft, revision: current.draft.revision + 1 },
        } as typeof current;
        return json(route, entries[single[1]!]);
      }
      if (single[2] === "/publish" && method === "POST") {
        entries[single[1]!] = {
          ...current,
          published: { ...current.draft, id: `${single[1]}-published`, state: "published" },
        };
        return json(route, {
          build: { status: "queued", targetVersion: 1 },
          entry: entries[single[1]!],
          publication: "published",
        });
      }
      return json(route, current);
    }
    if (path.endsWith("/preview")) return route.fulfill({ body: png, contentType: "image/png" });
    if (path === "/api/v1/admin/media" && method === "GET") return json(route, { items: library });
    const mediaDetail = /^\/api\/v1\/admin\/media\/([^/]+)$/u.exec(path);
    if (mediaDetail !== null) {
      const found = library.find((item) => item.id === mediaDetail[1]);
      if (found === undefined)
        return json(route, { error: { code: "NOT_FOUND", message: "Not found." } }, 404);
      return json(route, {
        ...found,
        usage:
          found.usageCount === 0
            ? []
            : [
                {
                  entryId: "entry-1",
                  locations: [{ field: "cover", source: "field", states: ["draft"] }],
                  modelKey: "posts",
                  status: "changed",
                  title: "Launch notes",
                },
              ],
      });
    }
    if (path === "/api/v1/admin/users" && method === "GET")
      return json(route, {
        items: [
          { disabled: false, email: "admin@lace.test", id: "admin-1", role: "admin" },
          { disabled: false, email: "eddie@lace.test", id: "editor-1", role: "editor" },
          { disabled: true, email: "vera@lace.test", id: "viewer-1", role: "viewer" },
        ],
      });
    if (path === "/api/v1/admin/invitations" && method === "GET")
      return json(route, { items: invitations });
    if (path === "/api/v1/admin/invitations" && method === "POST") {
      const body = request.postDataJSON() as { email: string; role: Role };
      const created = { ...invitation, email: body.email, id: "invitation-2", role: body.role };
      invitations.push(created);
      // Email is not configured in this fixture, so the link is handed over once.
      return json(
        route,
        { delivery: { reason: "not_configured", status: "failed" }, invitation: created, link },
        201,
      );
    }
    if (/^\/api\/v1\/admin\/invitations\/[^/]+\/resend$/u.test(path))
      return json(route, { delivery: { status: "sent" }, invitation });
    if (/^\/api\/v1\/admin\/users\/[^/]+\/password-reset$/u.test(path))
      return json(route, { delivery: { status: "sent" } });
    if (/^\/api\/v1\/admin\/users\/[^/]+\/sessions\/revoke$/u.test(path))
      return json(route, { revoked: 2 });
    if (path === "/api/v1/invitations/inspect")
      return json(route, {
        email: "new@lace.test",
        expiresAt: invitation.expiresAt,
        role: "editor",
      });
    if (path === "/api/v1/invitations/accept") return json(route, { email: "new@lace.test" }, 201);
    if (path === "/api/v1/password-reset/request") return route.fulfill({ status: 202 });
    if (path === "/api/v1/password-reset/confirm") return route.fulfill({ status: 204 });
    if (path === "/api/v1/account" && method === "PATCH") {
      const { displayName } = request.postDataJSON() as { displayName: string };
      return json(route, sessionSummary({ displayName, id: `${role}-1`, role }));
    }
    if (path === "/api/v1/account/password" && method === "POST")
      return json(route, { revoked: 1 });
    if (path === "/api/v1/account/sessions") return json(route, { items: accountSessions });
    if (path === "/api/v1/account/sessions/revoke-others") return json(route, { revoked: 1 });
    if (path === "/api/v1/admin/build-site")
      return json(route, { site: { id: "main-site", label: "Main site" } });
    if (path === "/api/v1/admin/site-builds") return json(route, { items: builds });
    const buildDetail = /^\/api\/v1\/admin\/site-builds\/([^/]+)$/u.exec(path);
    if (buildDetail !== null) {
      const found = builds.find((item) => item.id === buildDetail[1]);
      return found === undefined
        ? json(route, { error: { code: "NOT_FOUND", message: "Not found." } }, 404)
        : json(route, found);
    }
    if (path === "/api/v1/admin/settings/email-test" && method === "POST")
      return json(route, { reason: "rejected", status: "failed" });
    if (path === "/api/v1/admin/settings/status")
      return json(route, {
        configuredModels: 2,
        email: { from: "Lace <cms@lace.test>", provider: "smtp" as const },
        engineVersion: "0.1.0-alpha.4",
        ready: true,
      });
    if (path === "/api/v1/admin/api-tokens" && method === "GET")
      return json(route, { items: tokens });
    if (path === "/api/v1/admin/api-tokens" && method === "POST") {
      const { name } = request.postDataJSON() as { name: string };
      const { lastUsedAt: _lastUsedAt, ...unused } = token;
      const created = { ...unused, id: "token-2", name, tokenPrefix: "lace_bt_cd34" };
      tokens.push(created);
      return json(route, { ...created, token: "lace_bt_cd34_once-shown-secret" }, 201);
    }
    return route.fallback();
  });
}

async function openAdmin(page: Page, path: string, ready: (page: Page) => Locator) {
  await page.goto(`/admin${path}`);
  await expect(ready(page)).toBeVisible();
}

const routes: ReadonlyArray<readonly [string, string, (page: Page) => Locator]> = [
  [
    "content home",
    "/content",
    (page) => page.getByRole("heading", { name: "Content", exact: true }),
  ],
  ["collection list", "/content/posts", (page) => page.getByRole("table", { name: /entries/u })],
  [
    "page editor",
    "/content/home/entry-home",
    (page) => page.getByRole("textbox", { name: "Title" }),
  ],
  [
    "collection entry editor",
    "/content/posts/entry-1",
    (page) => page.getByRole("textbox", { name: "Title" }),
  ],
  ["media library", "/media", (page) => page.getByRole("list", { name: "Media library" })],
  ["builds", "/builds", (page) => page.getByRole("heading", { name: "Builds", exact: true })],
  ["users", "/users", (page) => page.getByRole("table", { name: "Pending invitations" })],
  ["account", "/account", (page) => page.getByText("This device")],
  ["settings", "/settings", (page) => page.getByText("Production site")],
  ["not found", "/does-not-exist", (page) => page.getByRole("main").getByText("Page not found")],
];

/** Public account screens, opened without a session from their emailed links. */
const publicRoutes: ReadonlyArray<readonly [string, string, (page: Page) => Locator]> = [
  [
    "accept invitation",
    `/accept-invite#token=${accountToken}`,
    (page) => page.getByLabel("Password", { exact: true }),
  ],
  [
    "invalid invitation",
    "/accept-invite",
    (page) => page.getByRole("heading", { name: "Invitation not valid" }),
  ],
  ["forgot password", "/forgot-password", (page) => page.getByRole("textbox", { name: "Email" })],
  [
    "reset password",
    `/reset-password#token=${accountToken}`,
    (page) => page.getByLabel("New password", { exact: true }),
  ],
  [
    "invalid reset link",
    "/reset-password",
    (page) => page.getByRole("heading", { name: "Reset link not valid" }),
  ],
];

/** Stores the admin theme preference before any admin script runs. */
async function seedTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((value) => localStorage.setItem("lace:admin-theme", value), theme);
}

for (const theme of ["light", "dark"] as const) {
  test(`sign-in passes the accessibility audit (${theme} theme)`, async ({ page }) => {
    await seedTheme(page, theme);
    await mockAdmin(page, { signedIn: false });
    await openAdmin(page, "/login", (current) => current.getByRole("textbox", { name: "Email" }));
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expectNoAccessibilityViolations(page, "sign-in");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/email/iu).first()).toBeVisible();
    await expectNoAccessibilityViolations(page, "sign-in with validation errors");
  });

  for (const [screen, path, ready] of routes)
    test(`${screen} passes the accessibility audit (${theme} theme)`, async ({ page }) => {
      await seedTheme(page, theme);
      await mockAdmin(page);
      await openAdmin(page, path, ready);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expectNoAccessibilityViolations(page, screen);
    });

  for (const [screen, path, ready] of publicRoutes)
    test(`${screen} passes the accessibility audit (${theme} theme)`, async ({ page }) => {
      await seedTheme(page, theme);
      await mockAdmin(page, { signedIn: false });
      await openAdmin(page, path, ready);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(new URL(page.url()).hash).toBe("");
      await expectNoAccessibilityViolations(page, screen);
    });

  test(`account screen states pass the accessibility audit (${theme} theme)`, async ({ page }) => {
    await seedTheme(page, theme);
    await mockAdmin(page, { signedIn: false });
    await openAdmin(page, "/forgot-password", (current) =>
      current.getByRole("textbox", { name: "Email" }),
    );
    await page.getByRole("textbox", { name: "Email" }).fill("someone@lace.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/If an account exists for/u)).toBeVisible();
    await expectNoAccessibilityViolations(page, "forgot-password confirmation");

    await openAdmin(page, "/login?reset=true", (current) =>
      current.getByText(/Your password was changed/u),
    );
    await expectNoAccessibilityViolations(page, "sign-in after a password reset");

    await mockAdmin(page);
    await openAdmin(page, "/account", (current) => current.getByText("This device"));
    await page.getByLabel("Current password", { exact: true }).fill("old-password");
    await page.getByLabel("New password", { exact: true }).fill("new-password-123");
    await page.getByLabel("Confirm new password", { exact: true }).fill("other-password-123");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("The new passwords do not match.")).toBeVisible();
    await expectNoAccessibilityViolations(page, "account with a password validation message");
    await page.getByRole("button", { name: "Sign out all other sessions" }).click();
    await expect(page.getByRole("dialog", { name: "Sign out all other sessions?" })).toBeVisible();
    await expectNoAccessibilityViolations(page, "sign-out-other-sessions dialog");
  });

  test(`email delivery results pass the accessibility audit (${theme} theme)`, async ({ page }) => {
    await seedTheme(page, theme);
    await mockAdmin(page);
    await openAdmin(page, "/settings", (current) =>
      current.getByRole("button", { name: "Send test email" }),
    );
    await page.getByRole("button", { name: "Send test email" }).click();
    await expect(
      page.getByRole("group", { name: "Email delivery" }).getByRole("alert"),
    ).toContainText("The provider rejected the sender or recipient");
    await expectNoAccessibilityViolations(page, "email delivery failure");
  });

  test(`access denied passes the accessibility audit (${theme} theme)`, async ({ page }) => {
    await seedTheme(page, theme);
    await mockAdmin(page, { role: "editor" });
    await openAdmin(page, "/users", (current) => current.getByText("Access denied"));
    await expectNoAccessibilityViolations(page, "access denied");
  });

  test(`main dialogs pass the accessibility audit while open (${theme} theme)`, async ({
    page,
  }) => {
    await seedTheme(page, theme);
    await mockAdmin(page);
    await openAdmin(page, "/content/posts/entry-1", (current) =>
      current.getByRole("textbox", { name: "Title" }),
    );

    await page.getByRole("button", { name: "Add block" }).click();
    await expect(page.getByRole("dialog", { name: "Add block" })).toBeVisible();
    await expectNoAccessibilityViolations(page, "add-block menu");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Replace media for Cover" }).click();
    const picker = page.getByRole("dialog", { name: "Choose media for Cover" });
    await expect(picker.getByRole("button", { name: "team.png" })).toBeVisible();
    await expectNoAccessibilityViolations(page, "media picker");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("button", { name: "Confirm publication" })).toBeVisible();
    await expectNoAccessibilityViolations(page, "publication confirmation");
    await page.keyboard.press("Escape");

    await page.goto("/admin/users");
    await page.getByRole("button", { name: "Invite user" }).click();
    const inviteDialog = page.getByRole("dialog", { name: "Invite user" });
    await expect(inviteDialog).toBeVisible();
    await expectNoAccessibilityViolations(page, "invite-user dialog");
    await inviteDialog.getByRole("textbox", { name: "Email" }).fill("new@lace.test");
    await inviteDialog.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByTestId("once-shown-link")).toHaveText(link);
    await expectNoAccessibilityViolations(page, "once-shown invitation link dialog");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("once-shown-link")).toHaveCount(0);

    await page.getByRole("button", { name: "Send password reset to eddie@lace.test" }).click();
    await expect(page.getByRole("dialog", { name: "Send password reset?" })).toBeVisible();
    await expectNoAccessibilityViolations(page, "send-password-reset dialog");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Sign out eddie@lace.test everywhere" }).click();
    await expect(page.getByRole("dialog", { name: "Sign out everywhere?" })).toBeVisible();
    await expectNoAccessibilityViolations(page, "sign-out-everywhere dialog");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Revoke invitation for pending@lace.test" }).click();
    await expect(page.getByRole("dialog", { name: "Revoke invitation?" })).toBeVisible();
    await expectNoAccessibilityViolations(page, "revoke-invitation dialog");
    await page.keyboard.press("Escape");

    await page.goto("/admin/settings");
    await page.getByRole("button", { name: "Create build token" }).click();
    const tokenDialog = page.getByRole("dialog", { name: "Create build token" });
    await expect(tokenDialog).toBeVisible();
    await expectNoAccessibilityViolations(page, "build-token dialog");
    await tokenDialog.getByRole("textbox", { name: "Token name" }).fill("Preview site");
    await tokenDialog.getByRole("button", { name: "Create build token" }).click();
    await expect(page.getByTestId("issued-token-value")).toBeVisible();
    await expectNoAccessibilityViolations(page, "once-shown token dialog");
  });
}

/** Presses Tab until `target` has focus, proving it is reachable in tab order. */
async function tabTo(page: Page, target: Locator, limit = 60) {
  for (let presses = 0; presses < limit; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      await expectVisibleFocus(page);
      return;
    }
    await page.keyboard.press("Tab");
    await expectVisibleFocus(page);
  }
  await expect(target, `not reached within ${limit} Tab presses`).toBeFocused();
}

async function expectVisibleFocus(page: Page) {
  const indication = await page.evaluate(() => {
    const element = document.activeElement;
    if (element === null || element === document.body) return "body";
    const style = getComputedStyle(element);
    return style.outlineStyle !== "none" && style.outlineWidth !== "0px"
      ? "outline"
      : style.boxShadow !== "none"
        ? "shadow"
        : `none on ${element.tagName.toLowerCase()} ${element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40) ?? ""}`;
  });
  expect(indication).not.toMatch(/^none/u);
}

test("an administrator completes the editorial flow with the keyboard alone", async ({ page }) => {
  await mockAdmin(page, { signedIn: false });
  await page.goto("/admin/login");
  const email = page.getByRole("textbox", { name: "Email" });
  await expect(email).toBeFocused();
  await page.keyboard.type("admin@lace.test");
  await tabTo(page, page.getByLabel("Password", { exact: true }));
  await page.keyboard.type("correct horse battery staple");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Content", exact: true })).toBeVisible();

  const sidebar = page.getByRole("complementary", { name: "Admin navigation" });
  await tabTo(page, sidebar.getByRole("link", { name: /Posts/u }));
  await page.keyboard.press("Enter");
  const row = page.getByRole("main").getByRole("link", { name: "Launch notes" });
  await expect(row).toBeVisible();
  await tabTo(page, row);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Launch notes");

  await tabTo(page, page.getByRole("button", { name: "Add block" }));
  await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", { name: "Add block" });
  await expect(menu.getByRole("searchbox", { name: "Filter blocks" })).toBeFocused();
  await page.keyboard.type("hero");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByRole("article").last()).toBeFocused();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved revision 3");

  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await publish.focus();
  await expectVisibleFocus(page);
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("button", { name: "Confirm publication" });
  await tabTo(page, confirm);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Published. Build pending.")).toBeVisible();

  await tabTo(page, sidebar.getByRole("link", { name: "Users", exact: true }));
  await page.keyboard.press("Enter");
  const invite = page.getByRole("button", { name: "Invite user" });
  await tabTo(page, invite);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Invite user" });
  await expect(dialog.getByRole("textbox", { name: "Email" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(invite).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.type("new@lace.test");
  await tabTo(page, dialog.getByRole("button", { name: "Send invitation" }));
  await page.keyboard.press("Enter");
  const shown = page.getByRole("dialog", { name: "Share the invitation link" });
  await expect(shown.getByRole("button", { name: "Copy link" })).toBeFocused();
  await tabTo(page, shown.getByRole("button", { name: "Done" }));
  await page.keyboard.press("Enter");
  await expect(shown).toHaveCount(0);
  await expect(invite).toBeFocused();

  await sidebar.getByRole("button", { name: /account menu/u }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  for (let step = 0; step < 10; step += 1) {
    if (
      await page
        .getByRole("menuitem", { name: "Account" })
        .evaluate((item) => item === document.activeElement)
    )
      break;
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
  const signOutOthers = page.getByRole("button", { name: "Sign out all other sessions" });
  await tabTo(page, signOutOthers);
  await page.keyboard.press("Enter");
  const othersDialog = page.getByRole("dialog", { name: "Sign out all other sessions?" });
  await tabTo(page, othersDialog.getByRole("button", { name: "Sign out other sessions" }));
  await page.keyboard.press("Enter");
  await expect(page.getByText("Signed out 1 other session.")).toBeVisible();
});

test("account screens reached from links work with the keyboard alone", async ({ page }) => {
  await mockAdmin(page, { signedIn: false });
  await page.goto("/admin/login");
  await tabTo(page, page.getByRole("link", { name: "Forgot password?" }));
  await page.keyboard.press("Enter");
  const email = page.getByRole("textbox", { name: "Email" });
  await expect(email).toBeFocused();
  await page.keyboard.type("someone@lace.test");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/If an account exists for someone@lace\.test/u)).toBeVisible();

  await page.goto(`/admin/reset-password#token=${accountToken}`);
  const password = page.getByLabel("New password", { exact: true });
  await expect(password).toBeFocused();
  expect(new URL(page.url()).hash).toBe("");
  await page.keyboard.type("new-password-123");
  await tabTo(page, page.getByLabel("Confirm new password", { exact: true }));
  await page.keyboard.type("new-password-123");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Your password was changed/u)).toBeVisible();

  await page.goto(`/admin/accept-invite#token=${accountToken}`);
  const choose = page.getByLabel("Password", { exact: true });
  await expect(choose).toBeFocused();
  expect(new URL(page.url()).hash).toBe("");
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain(accountToken);
  await page.keyboard.type("long-password-123");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Content", exact: true })).toBeVisible();
});

async function narrowPage(browser: Browser) {
  const page = await browser.newPage({ viewport: { height: 740, width: 375 } });
  await mockAdmin(page);
  return page;
}

test("every route fits a 375px viewport without horizontal scrolling", async ({ browser }) => {
  const page = await narrowPage(browser);
  for (const [screen, path, ready] of routes) {
    await openAdmin(page, path, ready);
    if (path === "/settings")
      await expect(page.getByRole("group", { name: "CMS version" })).toContainText("0.1.0-alpha.4");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `${screen} scrolls horizontally`,
    ).toBeLessThanOrEqual(375);
  }
  await page.close();
});

test("public account screens fit a 375px viewport without horizontal scrolling", async ({
  browser,
}) => {
  const page = await browser.newPage({ viewport: { height: 740, width: 375 } });
  await mockAdmin(page, { signedIn: false });
  for (const [screen, path, ready] of publicRoutes) {
    await openAdmin(page, path, ready);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `${screen} scrolls horizontally`,
    ).toBeLessThanOrEqual(375);
  }
  await page.close();
});

test("the entry column stacks below the blocks on a narrow screen", async ({ browser }) => {
  const page = await narrowPage(browser);
  await openAdmin(page, "/content/posts/entry-1", (current) =>
    current.getByRole("textbox", { name: "Title" }),
  );
  const lastBlock = page.getByRole("article").last();
  const publication = page.getByRole("region", { name: "Publication status" });
  const summaryField = page.getByRole("textbox", { name: "Summary" });
  const blockBox = await lastBlock.boundingBox();
  const publicationBox = await publication.boundingBox();
  expect(blockBox).not.toBeNull();
  expect(publicationBox).not.toBeNull();
  expect(publicationBox!.y).toBeGreaterThanOrEqual(blockBox!.y + blockBox!.height);
  expect((await summaryField.boundingBox())!.y).toBeGreaterThan(blockBox!.y + blockBox!.height);

  await page.getByRole("button", { name: "Add block" }).focus();
  await tabTo(page, summaryField);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.close();
});

test("every build status popover works by keyboard and passes the accessibility audit", async ({
  page,
}) => {
  await mockAdmin(page);
  await openAdmin(page, "/builds", (current) =>
    current.getByRole("table", { name: "Build history" }),
  );
  const table = page.getByRole("table", { name: "Build history" });
  for (const status of buildStatuses) {
    const trigger = table.getByRole("button", { name: `About the ${buildLabel(status)} status` });
    await tabTo(page, trigger, 120);
    await page.keyboard.press("Enter");
    const popover = page.getByRole("dialog", { name: buildLabel(status) });
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("Public site");
    if (status === "accepted") {
      await expect(popover).toContainText("Lace has not confirmed that the public site changed.");
      await expectNoAccessibilityViolations(page, "accepted status popover");
    }
    await page.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await table.getByRole("button", { name: "View build for version 5" }).click();
  const detail = page.getByRole("region", { name: "Build details" });
  await detail.getByRole("button", { name: "About the Accepted status" }).press("Space");
  await expect(page.getByRole("dialog", { name: "Accepted" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail.getByRole("button", { name: "Retry build" })).toBeVisible();
});

test("a build status popover fits a 375px viewport", async ({ browser }) => {
  const page = await narrowPage(browser);
  await openAdmin(page, "/builds", (current) =>
    current.getByRole("table", { name: "Build history" }),
  );
  await page.getByRole("button", { name: "About the Unknown status" }).click();
  const popover = page.getByRole("dialog", { name: "Unknown" });
  await expect(popover).toBeVisible();
  const box = await popover.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.close();
});
