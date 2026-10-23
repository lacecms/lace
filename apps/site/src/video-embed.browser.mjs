import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect } from "vitest";

// Reuse the monorepo's installed browser-test runtime.
const { chromium, expect: browserExpect } = createRequire(
  new URL("../../admin/package.json", import.meta.url),
)("@playwright/test");

export async function verifyVideoEmbeds(siteRoot) {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path.includes("..")) {
      response.writeHead(400).end();
      return;
    }
    try {
      const file = path.endsWith("/") ? `${path}index.html` : path;
      const body = await readFile(join(siteRoot, "dist", file));
      const type = file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html";
      response.writeHead(200, { "content-type": type }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/about/`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const requests = [];
    await context.route("https://**/*", (route) => route.abort());
    await context.route(
      /https:\/\/(?:www.youtube-nocookie.com|player.vimeo.com)\//u,
      async (route) => {
        requests.push(route.request().url());
        await route.fulfill({ contentType: "text/html", body: "<p>Stub player</p>" });
      },
    );
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const block = page.locator('[data-lace-block-key="about-vimeo"]');
    await browserExpect(
      block.getByRole("button", { name: "Load video: Vimeo film", exact: true }),
    ).toBeVisible();
    expect(requests.filter((request) => request.includes("vimeo"))).toHaveLength(0);
    expect(await block.locator("iframe").count()).toBe(0);
    for (const activation of ["pointer", "Enter", "Space"]) {
      if (activation !== "pointer") await page.goto(url, { waitUntil: "domcontentloaded" });
      const button = block.getByRole("button");
      if (activation === "pointer") await button.click();
      else {
        await button.focus();
        await button.press(activation);
      }
      await browserExpect(block.locator("iframe")).toHaveCount(1);
      await browserExpect(block.locator("iframe")).toBeFocused();
      expect(await block.locator("iframe").getAttribute("src")).toBe(
        "https://player.vimeo.com/video/76979871?h=abc123def",
      );
      expect(await block.locator("iframe").getAttribute("allow")).not.toContain("autoplay");
      await block.dispatchEvent("click");
      expect(await block.locator("iframe").count()).toBe(1);
      expect(await page.locator('[data-lace-block-key="about-vimeo-second"] iframe').count()).toBe(
        0,
      );
      await browserExpect(block.getByRole("link", { name: "Watch on Vimeo" })).toBeVisible();
    }
    await context.close();
    const noScript = await browser.newContext({ javaScriptEnabled: false });
    await noScript.route(/https:\/\//u, (route) => route.abort());
    const fallback = await noScript.newPage();
    await fallback.goto(url, { waitUntil: "domcontentloaded" });
    await browserExpect(
      fallback
        .locator('[data-lace-block-key="about-vimeo"]')
        .getByRole("link", { name: "Watch on Vimeo" }),
    ).toBeVisible();
    expect(await fallback.locator('[data-lace-block-key="about-vimeo"] iframe').count()).toBe(0);
    await noScript.close();
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
