import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { expect } from "vitest";

// Reuse the monorepo's installed browser-test runtime.
const { chromium } = createRequire(new URL("../../admin/package.json", import.meta.url))(
  "@playwright/test",
);

const types = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".webp": "image/webp",
};

/**
 * Checks the natural gallery image of the built post at a wide and a narrow
 * viewport: intrinsic width without the theme crop when it fits, shrunk to
 * its cell with its own proportions otherwise, never overflowing the page.
 */
export async function verifyNaturalGalleryImage(siteRoot) {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path.includes("..")) {
      response.writeHead(400).end();
      return;
    }
    try {
      const file = path.endsWith("/") ? `${path}index.html` : path;
      const body = await readFile(join(siteRoot, "dist", file));
      response
        .writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" })
        .end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/blog/first-post/`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await context.route("https://**/*", (route) => route.abort());
    const page = await context.newPage();
    const measure = () =>
      page.evaluate(() => {
        const image = document.querySelector(
          '[data-lace-block-key="post-gallery"] [data-lace-size="natural"] [data-lace-part="media"]',
        );
        const cell = image.closest('[data-lace-part="item"]').getBoundingClientRect();
        const box = image.getBoundingClientRect();
        const style = getComputedStyle(image);
        return {
          aspectRatio: style.aspectRatio,
          cellWidth: cell.width,
          complete: image.complete && image.naturalWidth > 0,
          height: box.height,
          objectFit: style.objectFit,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          width: box.width,
        };
      });
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url, { waitUntil: "load" });
      await page
        .locator(
          '[data-lace-block-key="post-gallery"] [data-lace-size="natural"] [data-lace-part="media"]',
        )
        .scrollIntoViewIfNeeded();
      await page.waitForFunction(() =>
        [
          ...document.querySelectorAll(
            '[data-lace-block-key="post-gallery"] [data-lace-size="natural"] [data-lace-part="media"]',
          ),
        ].every((image) => image.complete && image.naturalWidth > 0),
      );
      const natural = await measure();
      expect(natural.complete, `${width}px loads the image`).toBe(true);
      // Only the presentational ratio of its own width and height attributes applies.
      expect(natural.aspectRatio, `${width}px has no crop`).toBe("auto 600 / 400");
      expect(natural.objectFit).toBe("fill");
      expect(natural.overflow, `${width}px has no horizontal overflow`).toBeLessThanOrEqual(0);
      expect(natural.width).toBeLessThanOrEqual(natural.cellWidth);
      expect(natural.width / natural.height).toBeCloseTo(600 / 400, 1);
      if (width === 1280) expect(natural.width).toBe(600);
      else expect(natural.width).toBeLessThan(600);
    }
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
