import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";

const root = resolve(import.meta.dirname, "../../..");
const acceptanceDirectory = resolve(root, ".lace-acceptance");
const accountPath = resolve(acceptanceDirectory, "account.json");
const state = JSON.parse(readFileSync(resolve(acceptanceDirectory, "state.json"), "utf8")) as {
  mailpitPort: number;
  port: number;
};
const origin = `http://127.0.0.1:${state.port}`;
const mailpit = `http://127.0.0.1:${state.mailpitPort}`;

/** Reads the newest accept link sent to one address from the acceptance stack's Mailpit. */
async function invitationLink(address: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const search = await fetch(
      `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
    );
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    const newest = messages[0];
    if (newest !== undefined) {
      const message = (await (await fetch(`${mailpit}/api/v1/message/${newest.ID}`)).json()) as {
        Text: string;
      };
      const link = /https?:\/\/\S+\/admin\/accept-invite#token=[A-Za-z0-9_-]{43}/u.exec(
        message.Text,
      )?.[0];
      if (link !== undefined) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No invitation email reached ${address}.`);
}
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWOoiDoBAALoAZu/6UVvAAAAAElFTkSuQmCC",
  "base64",
);

test.beforeAll(async () => {
  if (existsSync(accountPath)) return;
  const bootstrap = spawnSync("pnpm", ["acceptance:bootstrap"], { cwd: root, encoding: "utf8" });
  expect(bootstrap.status, bootstrap.stderr).toBe(0);
  const token = bootstrap.stdout.trim().split("\n").at(-1);
  expect(token).toBeTruthy();
  const account = {
    email: "acceptance-admin@example.test",
    password: randomBytes(24).toString("base64url"),
  };
  const response = await fetch(`${origin}/api/v1/setup/admin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...account, token }),
  });
  expect(response.status, await response.text()).toBe(201);
  writeFileSync(accountPath, JSON.stringify(account), { mode: 0o600 });
});

test("administrator completes the local editorial flow and preserves published output", async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const account = JSON.parse(readFileSync(accountPath, "utf8")) as {
    email: string;
    password: string;
  };
  await page.goto("/admin/login");
  await page.getByRole("textbox", { name: "Email" }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Sidebar, breadcrumbs, and overview cards repeat names, so scope each query.
  const main = page.getByRole("main");
  const sidebar = page.getByRole("complementary", { name: "Admin navigation" });
  await expect(page.getByRole("heading", { name: "Content", exact: true })).toBeVisible();
  await expect(main.getByRole("link", { name: "home" })).toBeVisible();
  await expectNoAccessibilityViolations(page, "content home");
  await main.getByRole("link", { name: "notes" }).click();
  await expect(page.getByText("No entries yet")).toBeVisible();

  await sidebar.getByRole("link", { name: "Media", exact: true }).click();
  await expect(page.getByText("No media yet")).toBeVisible();
  await page.getByLabel("Upload images").setInputFiles({
    name: "acceptance.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(
    page
      .getByRole("list", { name: "Upload queue" })
      .getByRole("listitem")
      .filter({ hasText: "acceptance.png" }),
  ).toContainText("Uploaded");
  await expect(
    page
      .getByRole("list", { name: "Media library" })
      .getByRole("button", { name: "acceptance.png" }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page, "media library");

  await sidebar.getByRole("link", { name: "Content", exact: true }).click();
  await main.getByRole("link", { name: "home" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("Acceptance home");
  await page.getByRole("button", { name: "Add block" }).click();
  await page
    .getByRole("dialog", { name: "Add block" })
    .getByRole("button", { name: "Image" })
    .click();
  await page.getByRole("textbox", { name: "Alt" }).fill("Acceptance image");
  await page.getByRole("button", { name: "Choose media for Media" }).click();
  await page
    .getByRole("dialog", { name: "Choose media for Media" })
    .getByRole("button", { name: "acceptance.png", exact: true })
    .click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/Saved revision 2/u)).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Confirm publication" }).click();
  await expect(page.getByRole("region", { name: "Publication status" })).toContainText("Published");
  await expectNoAccessibilityViolations(page, "entry editor");

  await sidebar.getByRole("link", { name: "Content", exact: true }).click();
  await main.getByRole("link", { name: "notes" }).click();
  await page.getByRole("button", { name: "Create entry" }).click();
  await page
    .getByRole("dialog", { name: "Create entry" })
    .getByRole("textbox", { name: "Title" })
    .fill("Acceptance note");
  await page
    .getByRole("dialog", { name: "Create entry" })
    .getByRole("button", { name: "Create entry" })
    .click();
  await expect(main.getByRole("link", { name: "Acceptance note" })).toBeVisible();
  await expectNoAccessibilityViolations(page, "collection list");
  await main.getByRole("link", { name: "Acceptance note" }).click();
  await page.getByRole("textbox", { name: "Slug" }).fill("acceptance-note");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/Saved revision 2/u)).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Confirm publication" }).click();
  await expect(page.getByRole("region", { name: "Publication status" })).toContainText("Published");

  await sidebar.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Create build token" }).click();
  const tokenDialog = page.getByRole("dialog", { name: "Create build token" });
  await tokenDialog.getByRole("textbox", { name: "Token name" }).fill("acceptance-site");
  await tokenDialog.getByRole("button", { name: "Create build token" }).click();
  const token = await page
    .getByRole("dialog", { name: "Copy your build token" })
    .getByTestId("issued-token-value")
    .textContent();
  expect(token).toBeTruthy();
  const environmentPath = resolve(acceptanceDirectory, ".env");
  const environment = readFileSync(environmentPath, "utf8");
  writeFileSync(
    environmentPath,
    environment
      .replace(/^LACE_SITE_DATA_MODE=.*$/mu, "LACE_SITE_DATA_MODE=live")
      .replace(/^LACE_BUILD_TOKEN=.*$/mu, `LACE_BUILD_TOKEN=${token}`),
    { mode: 0o600 },
  );
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("issued-token-value")).toHaveCount(0);
  await expectNoAccessibilityViolations(page, "settings");
  const restart = spawnSync("pnpm", ["acceptance:restart-site"], { cwd: root, encoding: "utf8" });
  expect(restart.status, restart.stderr).toBe(0);
  await expect.poll(async () => (await request.get(`${origin}/`)).status()).toBe(200);
  await expect(page).not.toHaveURL(/token/u);
  const home = await request.get(`${origin}/`);
  expect(await home.text()).toContain("Acceptance home");
  const note = await request.get(`${origin}/notes/acceptance-note`);
  expect(note.status()).toBe(200);
  expect(await note.text()).toContain("Acceptance note");

  const exportBefore = await request.get(`${origin}/api/v1/public/build-export`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(exportBefore.status()).toBe(200);
  const publishedBefore = await exportBefore.json();
  await sidebar.getByRole("link", { name: "Content", exact: true }).click();
  await main.getByRole("link", { name: "notes" }).click();
  await main.getByRole("link", { name: "Acceptance note" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("Unpublished note");
  await page.getByRole("textbox", { name: "Slug" }).fill("unpublished-note");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/Saved revision 3/u)).toBeVisible();
  const exportAfter = await request.get(`${origin}/api/v1/public/build-export`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(await exportAfter.json()).toEqual(publishedBefore);
  const restartAgain = spawnSync("pnpm", ["acceptance:restart-site"], {
    cwd: root,
    encoding: "utf8",
  });
  expect(restartAgain.status, restartAgain.stderr).toBe(0);
  expect((await request.get(`${origin}/notes/acceptance-note`)).status()).toBe(200);
  expect((await request.get(`${origin}/notes/unpublished-note`)).status()).toBe(404);

  const userPassword = randomBytes(24).toString("base64url");
  await sidebar.getByRole("link", { name: "Users", exact: true }).click();
  for (const role of ["editor", "viewer"] as const) {
    await page.getByRole("button", { name: "Invite user" }).click();
    const inviteDialog = page.getByRole("dialog", { name: "Invite user" });
    await inviteDialog
      .getByRole("textbox", { name: "Email" })
      .fill(`acceptance-${role}@example.test`);
    await inviteDialog.getByRole("combobox", { name: "Role", exact: true }).click();
    await page.getByRole("option", { name: role === "editor" ? "Editor" : "Viewer" }).click();
    await inviteDialog.getByRole("button", { name: "Send invitation" }).click();
    // Mailpit accepted the message, so the dialog closes without showing a link.
    await expect(inviteDialog).toHaveCount(0);
    await expect(
      page
        .getByRole("table", { name: "Pending invitations" })
        .getByRole("row", { name: new RegExp(`acceptance-${role}@example\\.test`, "u") }),
    ).toBeVisible();
  }
  await expectNoAccessibilityViolations(page, "users");
  for (const role of ["editor", "viewer"] as const) {
    const member = await browser.newPage();
    const link = await invitationLink(`acceptance-${role}@example.test`);
    expect(new URL(link).origin).toBe(origin);
    await member.goto(link);
    await expect(member.getByRole("textbox", { name: "Email" })).toHaveValue(
      `acceptance-${role}@example.test`,
    );
    expect(member.url()).not.toContain("#token=");
    await member.getByLabel("Password", { exact: true }).fill(userPassword);
    await member.getByRole("button", { name: "Create account" }).click();
    await expect(member.getByRole("heading", { name: "Content", exact: true })).toBeVisible();
    await member.close();
  }
  await page.reload();
  await expect(
    page
      .getByRole("table", { name: "Users" })
      .getByRole("row", { name: /acceptance-viewer@example\.test/u }),
  ).toBeVisible();
  for (const role of ["editor", "viewer"] as const) {
    const member = await browser.newPage();
    await member.goto(`${origin}/admin/login`);
    await member.getByRole("textbox", { name: "Email" }).fill(`acceptance-${role}@example.test`);
    await member.getByLabel("Password", { exact: true }).fill(userPassword);
    await member.getByRole("button", { name: "Sign in" }).click();
    const memberSidebar = member.getByRole("complementary", { name: "Admin navigation" });
    await expect(member.getByRole("heading", { name: "Content", exact: true })).toBeVisible();
    await expect(member.getByRole("link", { name: "Users" })).toHaveCount(0);
    await expect(member.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await member.goto(`${origin}/admin/users`);
    await expect(member.getByText("Access denied")).toBeVisible();
    await memberSidebar.getByRole("link", { name: "Content", exact: true }).click();
    await member.getByRole("main").getByRole("link", { name: "home" }).click();
    await expect(member.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
    if (role === "editor") {
      await member.getByRole("textbox", { name: "Title" }).fill("Editor private draft");
      await member.getByRole("button", { name: "Save draft" }).click();
      await expect(member.getByText(/Saved revision 3/u)).toBeVisible();
    } else {
      await expect(member.getByRole("button", { name: "Save draft" })).toHaveCount(0);
      await memberSidebar.getByRole("link", { name: "Media", exact: true }).click();
      await expect(member.getByRole("button", { name: "Upload images" })).toHaveCount(0);
    }
    await member.close();
  }
});
