import { loadBrowser, visible } from "./acceptance-browser.mjs";

/** The administrator's tour steps, in navigation order. */
export const administratorTourSteps = Object.freeze([
  "Content",
  "Pages",
  "Collections",
  "Media",
  "Builds",
  "Users",
  "Settings",
]);

/**
 * Drives the packaged admin served by the generated Node API: browser-first
 * setup with the operator's bootstrap token, sign-in, the introductory tour
 * (permitted steps, persisted completion, replay) and a Media upload.
 */
export async function nodeBrowserJourney(options) {
  const { base, diagnostics, email, password, png, secretValues, token, workspace } = options;
  const browser = await loadBrowser(workspace);
  try {
    const context = await browser.newContext({ baseURL: base.slice(0, -1) });
    const tab = await context.newPage();
    tab.on("console", (message) => diagnostics.push(message.text()));

    console.info("Acceptance: node-browser-setup");
    // An unconfigured installation opens setup instead of the sign-in page.
    await tab.goto("/admin/");
    await visible(tab.getByRole("heading", { name: "Create your administrator" }), "node-setup");
    await tab.getByLabel("Email", { exact: true }).fill(email);
    await tab.getByLabel("Password", { exact: true }).fill(password);
    await tab.getByLabel("Bootstrap token", { exact: true }).fill(token);
    await tab.getByRole("button", { name: "Create administrator" }).click();
    await visible(tab.getByRole("heading", { name: "Sign in" }), "node-browser-setup");
    await visible(
      tab.getByRole("status").filter({ hasText: "Setup is complete" }),
      "node-browser-setup",
    );
    if (tab.url().includes(token)) throw new Error("node-browser-setup: token in URL");

    console.info("Acceptance: node-browser-login");
    await tab.getByRole("textbox", { name: "Email" }).fill(email);
    await tab.getByLabel("Password", { exact: true }).fill(password);
    await tab.getByRole("button", { name: "Sign in" }).click();
    await visible(tab.getByRole("heading", { name: "Content", exact: true }), "node-browser-login");
    for (const cookie of await context.cookies()) secretValues.add(cookie.value);

    console.info("Acceptance: node-browser-tour");
    await tab.getByRole("button", { name: "Start tour" }).click();
    for (const [index, title] of administratorTourSteps.entries()) {
      const dialog = tab.getByRole("dialog", {
        name: `${title}, Step ${index + 1} of ${administratorTourSteps.length}`,
      });
      await visible(dialog, `node-browser-tour-${title}`);
      const last = index === administratorTourSteps.length - 1;
      await dialog.getByRole("button", { name: last ? "Finish" : "Next" }).click();
    }
    await tab.getByRole("dialog").waitFor({ state: "detached", timeout: 30_000 });
    await tab.reload();
    await visible(tab.getByRole("heading", { name: "Content", exact: true }), "node-browser-tour");
    if ((await tab.getByRole("button", { name: "Start tour" }).count()) !== 0)
      throw new Error("node-browser-tour: completion did not persist across a reload");
    const sidebar = tab.getByRole("complementary", { name: "Admin navigation" });
    await sidebar.getByRole("button", { name: /account menu/u }).click();
    await tab.getByRole("menuitem", { name: "Introduction" }).click();
    await visible(
      tab.getByRole("dialog", { name: `Content, Step 1 of ${administratorTourSteps.length}` }),
      "node-browser-tour-replay",
    );
    await tab.keyboard.press("Escape");
    await tab.getByRole("dialog").waitFor({ state: "detached", timeout: 30_000 });

    await sidebar.getByRole("link", { name: "Settings", exact: true }).click();
    await visible(tab.getByText("CMS version", { exact: true }), "node-cms-version");
    await visible(tab.getByText("0.1.0-alpha.4", { exact: true }), "node-cms-release");
    console.info("Acceptance: node-browser-media");
    await sidebar.getByRole("link", { name: "Media", exact: true }).click();
    await tab.getByLabel("Upload images").setInputFiles({
      name: "onboarding.png",
      mimeType: "image/png",
      buffer: png,
    });
    await visible(
      tab
        .getByRole("list", { name: "Media library" })
        .getByRole("button", { name: "onboarding.png" }),
      "node-browser-media",
    );
  } finally {
    await browser.close();
  }
}
