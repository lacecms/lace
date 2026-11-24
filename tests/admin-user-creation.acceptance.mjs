import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, onTestFinished, test } from "vitest";
import { createNodeAdminAssets } from "../apps/api/dist/server/admin-assets.js";
import { expectNoAccessibilityViolations } from "../apps/admin/e2e/support/accessibility.js";
import { InMemoryObjectStorage } from "../packages/test-utils/dist/index.js";
import config from "../lace.config.ts";
import { node } from "./support/operational-platforms.mjs";

const apiRequire = createRequire(new URL("../apps/api/package.json", import.meta.url));
const adminRequire = createRequire(new URL("../apps/admin/package.json", import.meta.url));
const { getRequestListener } = apiRequire("@hono/node-server");
const { chromium, expect: browserExpect } = adminRequire("@playwright/test");
const password = "Local browser acceptance password";
const adminEmail = "administrator@example.test";
const memberEmail = "created@example.test";
const inviteEmail = "invited@example.test";

async function startRuntime(delivery) {
  const server = createServer();
  await new Promise((done, reject) => server.once("error", reject).listen(0, "127.0.0.1", done));
  const directory = await mkdtemp(join(tmpdir(), "lace-browser-accounts-"));
  let runtime;
  onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    runtime?.close();
    await rm(directory, { force: true, recursive: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const databasePath = join(directory, "accounts.sqlite");
  node.migrateNodeDatabase(databasePath);
  const messages = [];
  runtime = node.createNodeRuntime({
    config,
    adminAssets: createNodeAdminAssets(resolve("apps/admin/dist")),
    storage: new InMemoryObjectStorage(),
    logger: { log() {} },
    settings: node.parseNodeRuntimeSettings({
      LACE_AUTH_SECRET: "local-browser-account-acceptance-secret",
      LACE_DATABASE_PATH: databasePath,
      LACE_PUBLIC_BASE_URL: origin + "/",
      LACE_MINIO_ENDPOINT: "http://127.0.0.1:9000",
      LACE_MINIO_BUCKET: "lace-browser-accounts",
      LACE_MINIO_ACCESS_KEY: "local-fixture-key",
      LACE_MINIO_SECRET_KEY: "local-fixture-secret",
      LACE_MINIO_REGION: "us-east-1",
      LACE_MINIO_TIMEOUT_MS: "1000",
    }),
    ...(delivery === "accepted" && {
      email: {
        from: "cms@example.test",
        provider: "smtp",
        async send(message) {
          messages.push(message);
          return { status: "sent" };
        },
      },
    }),
  });
  server.on("request", getRequestListener(runtime.app.fetch));
  const setup = await runtime.security.createSetupToken();
  const response = await fetch(origin + "/api/v1/setup/admin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password, token: setup.token }),
  });
  expect(response.status).toBe(201);
  return { origin, messages };
}

async function signIn(page, email) {
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await browserExpect(page.getByRole("heading", { name: "Content", exact: true })).toBeVisible();
}

async function linkAfterDelivery(page, delivery, messages, recipient, handoffName, path) {
  if (delivery === "accepted") {
    await browserExpect(page.getByRole("dialog")).toHaveCount(0);
    const message = messages.find(({ to }) => to === recipient);
    expect(message?.text).toContain(path);
    return message.text.split("\n").find((line) => line.startsWith("http") && line.includes(path));
  }
  const dialog = page.getByRole("dialog", { name: handoffName });
  await browserExpect(dialog).toBeVisible();
  await expectNoAccessibilityViolations(page, handoffName);
  const link = await dialog.getByTestId("once-shown-link").textContent();
  await dialog.getByRole("button", { name: "Done" }).click();
  await browserExpect(page.getByTestId("once-shown-link")).toHaveCount(0);
  return link;
}

test.each(["disabled", "accepted"])(
  "browser account creation and first sign-in with delivery %s",
  async (delivery) => {
    const { origin, messages } = await startRuntime(delivery);
    const browser = await chromium.launch();
    onTestFinished(() => browser.close());
    const page = await (await browser.newContext()).newPage();
    await page.goto(origin + "/admin/login");
    await signIn(page, adminEmail);
    await page.goto(origin + "/admin/users");
    const rejected = await page.request.post(origin + "/api/v1/admin/users", {
      data: { email: memberEmail, role: "editor" },
      headers: { origin: "https://untrusted.example.test" },
    });
    expect(rejected.status()).toBe(403);

    const users = page.getByRole("table", { name: "Users" });
    const memberRow = users.getByRole("row").filter({ hasText: memberEmail });
    await page.getByRole("button", { name: "Create user" }).click();
    const create = page.getByRole("dialog", { name: "Create user" });
    await browserExpect(create).toBeVisible();
    await expectNoAccessibilityViolations(page, "create user");
    await create.getByRole("textbox", { name: "Email" }).fill(memberEmail);
    await create.getByRole("combobox", { name: "Role" }).click();
    await page.getByRole("option", { name: "Editor" }).click();
    await create.getByRole("button", { name: "Create user" }).click();
    const firstLink = await linkAfterDelivery(
      page,
      delivery,
      messages,
      memberEmail,
      "Share the first-password link",
      "/admin/reset-password#token=",
    );
    expect(new URL(firstLink).origin).toBe(origin);
    await browserExpect(memberRow).toContainText("Active");
    await browserExpect(memberRow).toContainText("Editor");

    const member = await browser.newPage();
    const premature = await member.request.post(origin + "/api/auth/sign-in/email", {
      data: { email: memberEmail, password },
      headers: { origin },
    });
    expect(premature.status()).toBe(401);
    await member.goto(firstLink);
    await member.getByLabel("New password", { exact: true }).fill(password);
    await member.getByLabel("Confirm new password").fill(password);
    await member.getByRole("button", { name: "Change password" }).click();
    await browserExpect(member.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await signIn(member, memberEmail);
    const session = await member.request.get(origin + "/api/v1/admin/session");
    expect(await session.json()).toMatchObject({ user: { email: memberEmail, role: "editor" } });
    await member.goto(origin + "/admin/users");
    await browserExpect(member.getByRole("heading", { name: "Access denied" })).toBeVisible();

    await page.getByRole("button", { name: "Invite user" }).click();
    const invite = page.getByRole("dialog", { name: "Invite user" });
    await invite.getByRole("textbox", { name: "Email" }).fill(inviteEmail);
    await invite.getByRole("button", { name: "Send invitation" }).click();
    const acceptLink = await linkAfterDelivery(
      page,
      delivery,
      messages,
      inviteEmail,
      "Share the invitation link",
      "/admin/accept-invite#token=",
    );
    await browserExpect(
      page
        .getByRole("table", { name: "Pending invitations" })
        .getByRole("row")
        .filter({ hasText: inviteEmail }),
    ).toBeVisible();
    await browserExpect(users.getByRole("row").filter({ hasText: inviteEmail })).toHaveCount(0);
    const invitee = await browser.newPage();
    await invitee.goto(acceptLink);
    await invitee.getByLabel("Password", { exact: true }).fill(password);
    await invitee.getByRole("button", { name: "Create account" }).click();
    await browserExpect(
      invitee.getByRole("heading", { name: "Content", exact: true }),
    ).toBeVisible();
  },
  90_000,
);
