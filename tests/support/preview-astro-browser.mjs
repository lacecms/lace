import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect } from "vitest";

const adminRequire = createRequire(new URL("../../apps/admin/package.json", import.meta.url));
const { chromium, expect: browserExpect } = adminRequire("@playwright/test");

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject).listen(0, "127.0.0.1", resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}

export async function servePublished(exported) {
  const token = "fixture-published-build-token";
  const requests = [];
  const running = await listen((request, response) => {
    requests.push({
      path: request.url,
      tokenAccepted: request.headers.authorization === `Bearer ${token}`,
    });
    if (request.url !== "/api/v1/public/build-export" || !requests.at(-1).tokenAccepted) {
      response.writeHead(403).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json", etag: `"${exported.version}"` });
    response.end(JSON.stringify(exported));
  });
  return {
    ...running,
    requests,
    environment: {
      LACE_API_BASE_URL: running.origin,
      LACE_BUILD_TOKEN: token,
      LACE_BUILD_SITE_URL: "https://published.example/journal/",
    },
  };
}

/** Serves the same entrypoint and manifest-only asset URLs as the preview gateway. */
export async function verifyPreviewBrowser(packages) {
  const service = await listen(async (request, response) => {
    const [, id, path] = /^\/p\/([\w-]+)\/(.*)$/u.exec(request.url?.split("?")[0] ?? "") ?? [];
    const result = packages.get(id);
    const file = result?.manifest.files.find(
      (item) => item.path === (path || result.manifest.html),
    );
    if (file === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": file.contentType, "cache-control": "no-store" });
    response.end(await readFile(join(result.directory, file.path)));
  });
  let browser;
  try {
    browser = await chromium.launch();
    const results = [];
    for (const [id] of packages) {
      for (const [width, padding] of [
        [1280, "18px"],
        [360, "6px"],
      ]) {
        const page = await browser.newPage({ viewport: { width, height: 820 } });
        const resources = [];
        const failures = [];
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        page.on("requestfailed", (request) => failures.push(request.url()));
        page.on("response", (response) => {
          const path = new URL(response.url()).pathname;
          if (path === "/favicon.ico") return;
          resources.push(path);
          if (!response.ok()) failures.push(path);
        });
        await page.goto(`${service.origin}/p/${id}/`);
        await browserExpect(page.getByRole("heading", { name: "Saved draft title" })).toBeVisible();
        await browserExpect(page.locator("#note-actions")).toHaveCSS("padding", padding);
        expect(
          await page.evaluate(async () => {
            await document.fonts.ready;
            return document.fonts.check("16px Notebook");
          }),
        ).toBe(true);
        await page.getByRole("button", { name: "Open notebook" }).click();
        await browserExpect(page.getByRole("button", { name: "Notebook opened" })).toBeVisible();
        await page.getByRole("button", { name: "Open full-size image: Draft cover" }).click();
        await browserExpect(page.getByRole("dialog")).toBeVisible();
        await browserExpect
          .poll(() =>
            page
              .getByRole("dialog")
              .locator("img")
              .evaluate((image) => image.naturalWidth),
          )
          .toBe(1080);
        await page.getByRole("button", { name: "Close" }).click();
        await page.getByRole("link", { name: "Details on this page" }).click();
        await browserExpect(page).toHaveURL(`${service.origin}/p/${id}/#details`);
        const published = page.getByRole("link", { name: "Published about" });
        await browserExpect(published).toHaveAttribute(
          "href",
          "https://published.example/journal/about",
        );
        await browserExpect(published).toHaveAttribute("target", "_blank");
        await browserExpect(published).toHaveAttribute("rel", "nofollow noopener noreferrer");
        expect(resources.every((path) => path.startsWith(`/p/${id}/`))).toBe(true);
        expect(failures).toEqual([]);
        expect(pageErrors).toEqual([]);
        for (const pattern of [
          /\.css$/u,
          /paper\..+\.svg$/u,
          /\.woff2$/u,
          /labels\..+\.js$/u,
          /\.webp$/u,
          /draft-cover\.png$/u,
        ])
          expect(resources.some((path) => pattern.test(path))).toBe(true);
        results.push({ id, width, requests: resources.length });
        await page.close();
      }
    }
    return results;
  } finally {
    await browser?.close();
    await service.close();
  }
}
