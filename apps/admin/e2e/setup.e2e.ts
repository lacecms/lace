import { expect, test, type Page } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";
import { sessionPath, sessionSummary } from "./support/session.js";

const email = "admin@lace.test";
const password = "correct horse battery staple";
const token = "A".repeat(43);

async function installation(
  page: Page,
  mode: "fresh" | "invalid" | "interrupted" | "stale" | "read-failure" | "complete" = "fresh",
) {
  let complete = mode === "complete";
  let signedIn = false;
  let submits = 0;
  let reads = 0;
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (path === "/api/v1/setup/state") {
        reads += 1;
        if (mode === "read-failure" && reads === 1)
          return json({ error: { code: "INTERNAL_ERROR", message: "Unavailable" } }, 500);
        return json({ setupComplete: complete });
      }
      if (path === sessionPath)
        return json(signedIn ? sessionSummary({ email, id: "admin", role: "admin" }) : null);
      if (path === "/api/v1/setup/admin") {
        submits += 1;
        expect(route.request().postDataJSON()).toEqual({ email, password, token });
        if (mode === "invalid" && submits === 1)
          return json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
        if (mode === "interrupted" && submits === 1) return route.abort();
        complete = true;
        if (mode === "stale")
          return json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
        return json({ id: "admin", role: "admin", email, disabled: false }, 201);
      }
      if (path === "/api/auth/sign-in/email") {
        signedIn = true;
        return json({ user: { id: "admin" } });
      }
      return json({ items: [] });
    },
  );
  return { submits: () => submits, reads: () => reads };
}

async function fill(page: Page) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Bootstrap token", { exact: true }).fill(token);
}

test("keyboard first-admin setup and sign-in pass axe and narrow reduced-motion layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const server = await installation(page);
  await page.goto("/admin/");
  await expect(page.getByRole("heading", { name: "Create your administrator" })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await expectNoAccessibilityViolations(page, "setup at 375px");
  await page.keyboard.type(email);
  await page.keyboard.press("Tab");
  await page.keyboard.type(password);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Show password" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Tab");
  await page.keyboard.type(token);
  await page.keyboard.press("Tab");
  const submit = page.getByRole("button", { name: "Create administrator" });
  await expect(submit).toBeFocused();
  expect(
    await submit.evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        (style.outlineStyle !== "none" && style.outlineWidth !== "0px") ||
        style.boxShadow !== "none"
      );
    }),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "Setup is complete. Sign in with your administrator account.",
  );
  expect(server.submits()).toBe(1);
  expect(page.url()).not.toContain(token);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await page.keyboard.type(email);
  await page.keyboard.press("Tab");
  await page.keyboard.type(password);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Content", exact: true })).toBeVisible();
});

for (const mode of ["invalid", "interrupted"] as const) {
  test(`${mode} setup remains accessible and requires explicit retry`, async ({ page }) => {
    const server = await installation(page, mode);
    await page.goto("/admin/setup");
    await fill(page);
    await page.getByRole("button", { name: "Create administrator" }).click();
    await expect(page.getByRole("alert")).toContainText("same token and email");
    await expectNoAccessibilityViolations(page, `${mode} setup error`);
    expect(server.submits()).toBe(1);
    await page.getByRole("button", { name: "Create administrator" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(server.submits()).toBe(2);
  });
}

test("stale client confirms closure and later setup visits reach sign-in", async ({ page }) => {
  const server = await installation(page, "stale");
  await page.goto("/admin/setup");
  await fill(page);
  await page.getByRole("button", { name: "Create administrator" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(server.submits()).toBe(1);
  await page.goto("/admin/setup");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Bootstrap token")).toHaveCount(0);
});

test("state failure is accessible and its retry performs no setup mutation", async ({ page }) => {
  const server = await installation(page, "read-failure");
  await page.goto("/admin/");
  await expect(page.getByRole("alert")).toContainText("Could not check setup");
  await expect(page.getByLabel("Bootstrap token")).toHaveCount(0);
  await expectNoAccessibilityViolations(page, "setup-state failure");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Create your administrator" })).toBeVisible();
  expect(server.submits()).toBe(0);
});
