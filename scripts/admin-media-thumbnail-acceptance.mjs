import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { openProductRuntime, password } from "../tests/support/cross-runtime-fixture.mjs";
import {
  fixtureImagesBinding,
  seedThumbnailMedia,
} from "../tests/support/media-thumbnails-fixture.mjs";
import { loadBrowser } from "./acceptance-browser.mjs";

const viewport = { width: 1440, height: 900 };
const [target = "both", output = ".lace-acceptance/admin-media-thumbnails"] = process.argv.slice(2);
assert.ok(["baseline", "both", "node", "worker"].includes(target));
const evidence = resolve(output);
const mediaRoute = /^\/api\/v1\/admin\/media\/[^/]+\/(preview|thumbnail)$/u;
const gridSelector = '[aria-label="Media library"]';
const baseline = target === "baseline";

function instrumentRuntime(fixture) {
  const stats = { originalReads: 0, transformations: 0 };
  if (baseline) return stats;
  const { storage } = fixture.runtime.deletionDispatcher.options;
  const get = storage.get.bind(storage);
  storage.get = (key) => {
    if (key.startsWith("media/")) stats.originalReads++;
    return get(key);
  };
  const { generator } = fixture.runtime.thumbnails.dependencies;
  const generate = generator.generate.bind(generator);
  generator.generate = (input) => {
    stats.transformations++;
    return generate(input);
  };
  return stats;
}

async function signIn(page) {
  await page.goto("/admin/");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("admin@cross-runtime.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: "Content", exact: true }).waitFor();
}

async function verifyPickerAndSummary(fixture, page, thumbnailPath, imageRequests, phase) {
  const response = await fixture.call("/api/v1/admin/models/posts/entries", {
    method: "POST",
    cookie: fixture.cookies.admin,
    json: {
      slug: `mp1-picker-${phase}`,
      title: "MP1 gallery",
      fields: { publishedAt: "2026-11-24" },
      blocks: [
        {
          key: "01J00000000000000000000901",
          type: "gallery",
          schemaVersion: 6,
          position: 1024,
          data: { images: [] },
        },
      ],
    },
  });
  assert.equal(response.status, 201, "gallery draft for picker acceptance");
  const { id } = await response.json();
  const before = imageRequests.length;
  await page.route(`**${thumbnailPath}`, (route) => route.fulfill({ status: 503 }));
  await page.goto(`/admin/content/posts/${id}`);
  await page.getByRole("button", { name: "Add Images and videos item", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Add media to Images and videos" });
  const choices = picker.getByRole("list", { name: "Media choices for Images and videos" });
  const gif = choices.getByRole("button", { name: "mp1-animation.gif", exact: true });
  await gif.getByTestId("thumbnail-fallback").waitFor();
  assert.equal(await choices.getByRole("button").count(), 24);
  await gif.click();
  await picker.getByRole("button", { name: "Load more media" }).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[aria-label="Media choices for Images and videos"] li').length ===
      48,
  );
  assert.equal(await gif.getAttribute("aria-pressed"), "true");
  await picker.getByRole("button", { name: "Add 1 image", exact: true }).click();
  await picker.waitFor({ state: "detached" });
  const summary = page.getByRole("button", {
    name: "Expand Images and videos item 1",
    exact: true,
  });
  await summary.waitFor();
  await summary.locator("..").getByTestId("thumbnail-fallback").waitFor();
  const checks = imageRequests.slice(before);
  assert.ok(checks.includes("thumbnail"));
  assert.ok(checks.every((kind) => kind === "thumbnail"));
  return { firstPageItems: 24, appendedItems: 24, originals: 0, fallbackDisplayed: true };
}

async function readBatches(page, grid, more, listRequests, imageRequests, total, label) {
  const tiles = grid.getByRole("button");
  const batches = [];
  let displayed = 0;
  const started = performance.now();
  await page.getByRole("link", { name: "Media", exact: true }).click();
  while (displayed < total) {
    await page.waitForFunction(
      ({ selector, count }) => document.querySelectorAll(`${selector} li`).length > count,
      { selector: gridSelector, count: displayed },
    );
    const beforeScroll = listRequests.length;
    const nextCount = await tiles.count();
    for (let index = displayed; index < nextCount; index += 6) {
      await tiles.nth(index).scrollIntoViewIfNeeded();
    }
    await tiles.last().scrollIntoViewIfNeeded();
    await page.waitForFunction(
      (selector) => [...document.querySelectorAll(`${selector} img`)].every((img) => img.complete),
      gridSelector,
    );
    assert.equal(listRequests.length, beforeScroll, "scroll leaves continuation manual");
    assert.equal(
      await grid.getByTestId("thumbnail-fallback").count(),
      0,
      "all fixture images render",
    );
    const bodyBytes = await page.evaluate((pattern) => {
      const matches = new RegExp(pattern);
      return performance
        .getEntriesByType("resource")
        .filter((entry) => matches.test(new URL(entry.name).pathname))
        .reduce((bytes, entry) => bytes + entry.decodedBodySize, 0);
    }, mediaRoute.source);
    batches.push({
      displayed: nextCount,
      imageRequests: imageRequests.length,
      bodyBytes,
      elapsedMs: Math.round(performance.now() - started),
    });
    if (displayed === 0) {
      await tiles.first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(evidence, `${label}-grid.png`) });
    }
    displayed = nextCount;
    if (displayed === total) break;
    await more.click();
  }
  assert.equal(await more.count(), 0, "continuation disappears on the last page");
  return batches;
}

async function browse(fixture, browser, total, phase) {
  const label = baseline ? "baseline" : `${fixture.kind}-${phase}`;
  const stats = instrumentRuntime(fixture);
  const context = await browser.newContext({ baseURL: fixture.origin, viewport });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    const imageRequests = [];
    const listRequests = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      const representation = mediaRoute.exec(url.pathname)?.[1];
      if (representation) imageRequests.push(representation);
      if (url.pathname === "/api/v1/admin/media" && request.method() === "GET")
        listRequests.push({
          limit: url.searchParams.get("limit"),
          after: url.searchParams.has("after"),
        });
    });
    await signIn(page);
    const grid = page.getByRole("list", { name: "Media library" });
    const more = page.getByRole("button", { name: "Load more media" });
    const batches = await readBatches(page, grid, more, listRequests, imageRequests, total, label);
    const browsing = {
      originals: imageRequests.filter((kind) => kind === "preview").length,
      thumbnails: imageRequests.filter((kind) => kind === "thumbnail").length,
    };
    const search = page.getByRole("searchbox", { name: "Search media" });
    await search.fill("mp1-animation.gif");
    await search.press("Enter");
    await page.waitForFunction(
      (selector) => document.querySelectorAll(`${selector} li`).length === 1,
      gridSelector,
    );
    assert.equal(listRequests.at(-1).after, false, "filter starts on the first page");
    const requestsBeforeOpen = imageRequests.length;
    const workDuringBrowsing = { ...stats };
    if (!baseline) {
      assert.deepEqual(
        batches.map(({ displayed }) => displayed),
        [24, 48, 72, 96, 120],
      );
      assert.ok(listRequests.every(({ limit }) => limit === "24"));
      assert.equal(batches[0].imageRequests, 24);
      assert.ok(batches[0].bodyBytes > 0 && batches[0].bodyBytes <= 24 * 96 * 1024);
      assert.equal(browsing.thumbnails, total);
      assert.equal(browsing.originals, 0);
      assert.ok(imageRequests.every((request) => request === "thumbnail"));
      if (phase === "warm") {
        assert.deepEqual(workDuringBrowsing, { originalReads: 0, transformations: 0 });
      } else {
        assert.equal(workDuringBrowsing.originalReads, total);
        assert.ok(workDuringBrowsing.transformations >= total);
      }
    }
    const tile = grid.getByRole("button", { name: "mp1-animation.gif", exact: true });
    const thumbnailPath = await tile.locator("img").getAttribute("src");
    await tile.click();
    const dialog = page.getByRole("dialog", { name: "mp1-animation.gif" });
    const preview = dialog.locator("img");
    await preview.waitFor();
    await page.waitForFunction(
      () => document.querySelector('[role="dialog"] img')?.naturalWidth === 480,
    );
    assert.match(await preview.getAttribute("src"), /\/preview$/u);
    const openRequests = imageRequests.slice(requestsBeforeOpen);
    if (!baseline)
      assert.deepEqual(
        openRequests.filter((kind) => kind === "preview"),
        ["preview"],
      );
    await page.screenshot({ path: join(evidence, `${label}-gif-preview.png`) });
    const libraryListRequests = listRequests.slice();
    const picker = baseline
      ? undefined
      : await verifyPickerAndSummary(fixture, page, thumbnailPath, imageRequests, phase);
    const report = {
      viewport,
      batches,
      listRequests: libraryListRequests,
      browsing,
      ...(!baseline && { workDuringBrowsing }),
      openRequests,
      originalGifDisplayed: true,
      ...(picker && { picker }),
    };
    await writeFile(
      join(evidence, `${baseline ? "baseline-node" : label}.json`),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.info(label, JSON.stringify(report));
  } finally {
    await context.close();
  }
}

async function run(kind, browser) {
  let d1;
  const fixture = await openProductRuntime(kind, {
    workerImages: fixtureImagesBinding(),
    instrumentD1: (database) => (d1 = database),
  });
  try {
    const { thumbnails } = fixture.runtime;
    const prepare = thumbnails?.prepare;
    if (thumbnails) thumbnails.prepare = async () => {};
    const sqlite = fixture.runtime.database?.connection;
    let total;
    try {
      total = await seedThumbnailMedia(fixture, {
        removeHash: (id) =>
          sqlite
            ? sqlite.prepare("update media set sha256 = null where id = ?").run(id)
            : d1.prepare("update media set sha256 = null where id = ?").bind(id).run(),
        resetUploadRate: () => (sqlite ?? d1).prepare("delete from rate_limit_buckets").run(),
      });
    } finally {
      if (thumbnails) thumbnails.prepare = prepare;
    }
    await browse(fixture, browser, total, "cold");
    if (!baseline) {
      await fixture.restart();
      await browse(fixture, browser, total, "warm");
    }
  } finally {
    await fixture.close();
  }
}

await mkdir(evidence, { recursive: true });
const browser = await loadBrowser(resolve("."));
try {
  for (const kind of target === "both" ? ["node", "worker"] : [baseline ? "node" : target]) {
    await run(kind, browser);
  }
} finally {
  await browser.close();
}
