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
    expect(requests.some((request) => /background=1|autoplay=1/u.test(request))).toBe(false);
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
    for (const key of ["about-ambient-0", "about-ambient-1"]) {
      const ambient = page.locator(`[data-lace-block-key="${key}"]`);
      await browserExpect(ambient).toHaveAttribute("data-lace-ambient", "fallback");
      await browserExpect(ambient.locator('[data-lace-part="source"]')).toBeVisible();
      if (key.endsWith("0")) {
        await browserExpect(ambient.getByRole("button")).toBeVisible();
        expect(await ambient.locator("iframe").count()).toBe(0);
      } else {
        await browserExpect(ambient.locator("iframe")).toHaveCount(1);
        expect(await ambient.locator("iframe").getAttribute("src")).not.toContain("background");
      }
    }
    // Gallery ambient items fall back to the ordinary player under reduced motion.
    for (const key of ["about-gallery-0", "about-gallery-1"]) {
      const video = page.locator(
        `[data-lace-block-key="${key}"] [data-lace-video][data-lace-playback="ambient"]`,
      );
      await browserExpect(video).toHaveAttribute("data-lace-ambient", "fallback");
      await browserExpect(video.locator("iframe")).toHaveCount(1);
      expect(await video.locator("iframe").getAttribute("src")).not.toContain("background");
      await browserExpect(video.locator('[data-lace-part="source"]')).toBeVisible();
    }
    expect(requests.some((request) => /background=1/u.test(request))).toBe(false);
    const motion = await browser.newContext({ reducedMotion: "no-preference" });
    await motion.route("https://**/*", (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>Stub player</p>" }),
    );
    const moving = await motion.newPage();
    await moving.goto(url, { waitUntil: "domcontentloaded" });
    const ambient = moving.locator('[data-lace-block-key="about-ambient-0"]');
    await browserExpect(ambient).toHaveAttribute("data-lace-ambient", "active");
    await browserExpect(ambient.locator("iframe")).toHaveCount(1);
    await browserExpect(ambient.locator("iframe")).toHaveAttribute(
      "src",
      "https://player.vimeo.com/video/76979871?h=abc123def&background=1",
    );
    await browserExpect(ambient.locator("iframe")).toHaveAttribute("tabindex", "-1");
    await browserExpect(ambient.locator("iframe")).toHaveAttribute(
      "allow",
      "autoplay; encrypted-media",
    );
    expect(await ambient.locator("button").evaluate((button) => button.inert)).toBe(true);
    await browserExpect(ambient.locator("img")).toBeVisible();
    expect(
      await ambient
        .locator("[data-lace-video-area]")
        .evaluate((area) => getComputedStyle(area).aspectRatio),
    ).toBe("1 / 1");
    const source = ambient.locator('[data-lace-part="source"]');
    expect(await source.evaluate((link) => getComputedStyle(link).clipPath)).toBe("inset(50%)");
    await source.focus();
    expect(await source.evaluate((link) => getComputedStyle(link).clipPath)).toBe("none");
    await moving.evaluate(() => {
      const original = document.querySelector('[data-lace-block-key="about-ambient-0"]');
      for (let i = 0; i < 4; i++) {
        const copy = original.cloneNode(true);
        copy.dataset.laceBlockKey = `duplicate-${i}`;
        delete copy.dataset.laceAmbient;
        copy.querySelector("[data-lace-video-area] > iframe").remove();
        original.after(copy);
      }
      document.dispatchEvent(new Event("astro:page-load"));
      document.dispatchEvent(new Event("astro:page-load"));
    });
    const ambientBlocks = moving.locator(
      '[data-lace-block="videoEmbed"][data-lace-playback="ambient"]',
    );
    await browserExpect(ambientBlocks).toHaveCount(6);
    for (const item of await ambientBlocks.all())
      await browserExpect(item.locator("iframe")).toHaveCount(1);
    // Gallery ambient items mount once each, even after repeated initialization,
    // and neither script mounts a player into the other's markup.
    const galleryAmbient = moving.locator(
      '[data-lace-block="gallery"] [data-lace-video][data-lace-playback="ambient"]',
    );
    await browserExpect(galleryAmbient).toHaveCount(2);
    for (const item of await galleryAmbient.all()) {
      await browserExpect(item).toHaveAttribute("data-lace-ambient", "active");
      await browserExpect(item.locator("iframe")).toHaveCount(1);
      await browserExpect(item.locator("iframe")).toHaveAttribute("tabindex", "-1");
      await browserExpect(item.locator("iframe")).toHaveAttribute(
        "src",
        "https://player.vimeo.com/video/76979871?h=abc123def&background=1",
      );
      const link = item.locator('[data-lace-part="source"]');
      expect(await link.evaluate((element) => getComputedStyle(element).clipPath)).toBe(
        "inset(50%)",
      );
    }
    expect(
      await moving
        .locator('[data-lace-block-key="about-gallery-0"] [data-lace-video-area]')
        .first()
        .evaluate((area) => getComputedStyle(area).aspectRatio),
    ).toBe("9 / 16");
    const player = moving.locator(
      '[data-lace-block-key="about-gallery-0"] [data-lace-video][data-lace-playback="player"]',
    );
    await browserExpect(player.locator("iframe")).toHaveCount(1);
    expect(await player.locator("iframe").getAttribute("allow")).not.toContain("autoplay");
    expect(await player.getAttribute("data-lace-ambient")).toBeNull();
    for (const key of ["about-vimeo", "about-vimeo-second"])
      expect(await moving.locator(`[data-lace-block-key="${key}"] iframe`).count()).toBe(0);
    await motion.close();
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
    for (const key of ["about-ambient-0", "about-ambient-1"]) {
      const block = fallback.locator(`[data-lace-block-key="${key}"]`);
      await browserExpect(block.locator('[data-lace-part="source"]')).toBeVisible();
      expect(await block.locator("iframe").count()).toBe(key.endsWith("0") ? 0 : 1);
      if (key.endsWith("1")) {
        expect(await block.locator("iframe").getAttribute("src")).not.toContain("background");
        const area = await block.locator("[data-lace-video-area]").boundingBox();
        const frame = await block.locator("iframe").boundingBox();
        expect(frame.width).toBeCloseTo(area.width, 0);
        expect(frame.height).toBeCloseTo(area.height, 0);
      }
    }
    for (const key of ["about-gallery-0", "about-gallery-1"]) {
      const video = fallback.locator(
        `[data-lace-block-key="${key}"] [data-lace-video][data-lace-playback="ambient"]`,
      );
      await browserExpect(video.locator("iframe")).toHaveCount(1);
      expect(await video.locator("iframe").getAttribute("src")).not.toContain("background");
      await browserExpect(video.locator('[data-lace-part="source"]')).toBeVisible();
    }
    await noScript.close();
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
