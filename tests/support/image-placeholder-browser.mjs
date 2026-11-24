import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { expect } from "vitest";
import { loadBrowser } from "../../scripts/acceptance-browser.mjs";

const contentTypes = { ".html": "text/html", ".css": "text/css", ".webp": "image/webp" };

/** Checks visible paint, geometry and requests with scripts disabled on the built site. */
export async function verifyImagePlaceholderPaint(siteRoot, heroVariants, sharp) {
  const requests = [];
  let release;
  const held = new Promise((done) => {
    release = done;
  });
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const file = path === "/" ? "/index.html" : path;
    try {
      const body = await readFile(join(siteRoot, "dist", file));
      const type = contentTypes[extname(file)] ?? "application/octet-stream";
      if (heroVariants.includes(path)) await held;
      response.writeHead(200, { "content-type": type, "content-length": body.length }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", resolve),
  );
  let browser;
  try {
    browser = await loadBrowser(join(siteRoot, "../.."));
    const page = await browser.newPage({
      javaScriptEnabled: false,
      viewport: { width: 1280, height: 900 },
    });
    await page.route("https://**/*", (route) => route.abort());
    page.on("request", (request) =>
      requests.push({ path: new URL(request.url()).pathname, type: request.resourceType() }),
    );
    const navigation = await page.goto(`http://127.0.0.1:${server.address().port}/`, {
      waitUntil: "domcontentloaded",
    });
    const htmlBytes = (await navigation.body()).byteLength;
    const image = page.locator('[data-lace-block-key="home-hero"] img[data-lace-part="media"]');
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => requests.filter(({ path }) => heroVariants.includes(path)).length)
      .toBe(1);
    const bounds = await image.boundingBox();
    expect(bounds?.width).toBeGreaterThan(0);
    expect(bounds?.height).toBeGreaterThan(0);
    expect(
      await image.evaluate((element) => ({
        loaded: element.complete,
        background: getComputedStyle(element).backgroundImage.startsWith(
          'url("data:image/svg+xml,',
        ),
      })),
    ).toEqual({ loaded: false, background: true });
    const clip = {
      x: Math.round(bounds.x + bounds.width / 2),
      y: Math.round(bounds.y + bounds.height / 2),
      width: 12,
      height: 12,
    };
    const sample = async () =>
      (await sharp(await page.screenshot({ clip })).stats()).channels
        .slice(0, 3)
        .map(({ mean }) => Math.round(mean));
    let before;
    await expect
      .poll(async () => {
        before = await sample();
        return before[2] - before[0];
      })
      .toBeGreaterThan(60);
    const variant = page.waitForResponse((response) =>
      heroVariants.includes(new URL(response.url()).pathname),
    );
    release();
    const loaded = await variant;
    await image.evaluate((element) => element.decode());
    let after;
    await expect
      .poll(async () => {
        after = await sample();
        return after[0] - after[2];
      })
      .toBeGreaterThan(60);
    expect(await image.boundingBox()).toEqual(bounds);
    expect(requests.filter(({ path }) => path.includes("/build-media/"))).toEqual([]);
    const imageRequests = requests.filter(({ type }) => type === "image").map(({ path }) => path);
    expect(imageRequests).toEqual([new URL(loaded.url()).pathname]);
    return {
      htmlBytes,
      imageRequests,
      imageBytes: (await loaded.body()).byteLength,
      bounds,
      before,
      after,
      thumbnailRequests: 0,
    };
  } finally {
    release();
    await browser?.close();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
}
