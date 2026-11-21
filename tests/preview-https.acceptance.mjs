import { test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { describePreviewBytes } from "@lacecms/application";
import { unixMilliseconds } from "@lacecms/domain";
import { claimPreviewFixture } from "@lacecms/test-utils";
import { nodePreviewFixture } from "../packages/platform-node/src/test-support/preview-fixture.ts";
import { runLocalContentSync } from "../packages/platform-node/src/runtime/content-sync.ts";
import { createNodeAdminAssets } from "../apps/api/src/server/admin-assets.ts";

const adminRequire = createRequire(new URL("../apps/admin/package.json", import.meta.url));
const nodeRequire = createRequire(
  new URL("../packages/platform-node/package.json", import.meta.url),
);
const { chromium, expect: browserExpect } = adminRequire("@playwright/test");
const { CreateBucketCommand, S3Client } = nodeRequire("@aws-sdk/client-s3");
const adminAssets = createNodeAdminAssets(
  fileURLToPath(new URL("../apps/admin/dist/", import.meta.url)),
);
const html = (value) =>
  new Response(value, { headers: { "content-type": "text/html; charset=utf-8" } });

async function startHttps(cleanups) {
  const directory = await mkdtemp(join(tmpdir(), "lace-preview-https-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, "tls"));
  const key = join(directory, "tls/key.pem");
  const cert = join(directory, "tls/cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-subj",
      "/CN=Local Lace Preview Fixture",
      "-days",
      "1",
    ],
    { stdio: "ignore" },
  );
  const routes = new Map();
  const server = createServer(
    { key: await readFile(key), cert: await readFile(cert) },
    async (incoming, outgoing) => {
      try {
        const host = incoming.headers.host;
        const target = incoming.url ?? "/";
        const body = ["GET", "HEAD"].includes(incoming.method)
          ? undefined
          : Readable.toWeb(incoming);
        const request = new Request(`https://${host}${target}`, {
          method: incoming.method,
          headers: incoming.headers,
          ...(body && { body, duplex: "half" }),
        });
        const route = routes.get(host);
        const result = route ? await route(request, target) : new Response(null, { status: 404 });
        outgoing.writeHead(result.status, {
          ...Object.fromEntries(result.headers),
          "set-cookie": result.headers.getSetCookie(),
        });
        outgoing.end(Buffer.from(await result.arrayBuffer()));
      } catch (error) {
        outgoing.writeHead(500).end();
        console.error(error);
      }
    },
  );
  await new Promise((resolve, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", resolve),
  );
  cleanups.push(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return { routes, port: server.address().port };
}

async function installPreview(cleanups, server, s3, adminName, previewName) {
  const admin = `https://${adminName}:${server.port}`;
  const preview = `https://${previewName}:${server.port}`;
  const bucket = `lace-preview-${randomUUID()}`;
  await s3.client.send(new CreateBucketCommand({ Bucket: bucket }));
  const fixture = await nodePreviewFixture(cleanups, {
    admin,
    preview,
    endpoint: s3.endpoint,
    bucket,
    runnerEnvironment: {
      LACE_PREVIEW_ENABLED: "true",
      LACE_PREVIEW_ORIGIN: preview,
      LACE_PREVIEW_RUNNER_ORIGIN: "http://preview-runner.lace.test/",
      LACE_PREVIEW_BUILDER_URL: "http://builder.lace.test/",
      LACE_PREVIEW_BUILDER_SECRET: "test-builder-only-credential-for-preview",
      LACE_PREVIEW_RUNNER_SECRET: "test-executor-only-credential-for-preview",
      LACE_BUILD_SITE_ID: "main-site",
      LACE_BUILD_SITE_LABEL: "Main site",
      LACE_BUILD_SITE_URL: "https://published.example.org/",
    },
    assets: {
      fetch: async (request) =>
        new URL(request.url).pathname === "/admin/preview-fixture"
          ? html(
              '<!doctype html><title>Lace admin fixture</title><h1>Lace admin</h1><iframe title="Preview" sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"></iframe>',
            )
          : adminAssets.fetch(request),
    },
  });
  const { runtime, run, config } = fixture;
  for (const origin of [admin, preview]) {
    server.routes.set(new URL(origin).host, (request, target) => {
      runtime.setRequestPeer(request, "127.0.0.1", target);
      return runtime.app.fetch(request);
    });
  }
  let ids = 0;
  expect(
    await runLocalContentSync({
      check: false,
      clock: { now: () => unixMilliseconds(Date.now()) },
      ids: { next: () => `browser-content-${++ids}` },
      models: config.runtime.content,
      target: runtime.repository,
      write: () => undefined,
    }),
  ).toBe(0);
  const { id: entryId } = runtime.database.connection
    .prepare("select id from content_entries where model_key = 'home'")
    .get();
  await run("update content_snapshots set revision = 8 where entry_id = ?", [entryId]);
  await stageBrowserDraft(runtime, run, "browser", "Protected draft");
  await run("delete from preview_current where generation_id = 'browser'", []);
  await run("update preview_generations set entry_id = ? where id = 'browser'", [entryId]);
  await run("insert into preview_current (entry_id, generation_id) values (?, 'browser')", [
    entryId,
  ]);
  return {
    admin,
    preview,
    site: `${preview}/p/browser/`,
    entry: `${admin}/admin/content/home/${entryId}`,
    runtime,
    run,
  };
}

async function stageBrowserDraft(runtime, run, id, title) {
  const claim = await claimPreviewFixture(runtime.repository.preview, run, Date.now(), id);
  const prefix = `/p/${id}/`;
  const markup = `<!doctype html><title>Site fixture</title><link rel="stylesheet" href="${prefix}site.css">
    <h1>${title}</h1><script src="${prefix}site.js"></script>`;
  const script = `const heading = document.querySelector("h1");
    try { void parent.document.title; heading.dataset.parent = "read"; }
    catch { heading.dataset.parent = "isolated"; }
    if (heading.dataset.parent === "isolated") {
      try { top.location.href = ${JSON.stringify(prefix)}; } catch {}
    }
    navigator.serviceWorker.register(${JSON.stringify(prefix + "site.js")}).then(
      () => heading.dataset.worker = "registered",
      () => heading.dataset.worker = "blocked",
    );`;
  const content = await Promise.all(
    [
      ["index.html", "text/html; charset=utf-8", markup],
      ["site.js", "text/javascript; charset=utf-8", script],
      ["site.css", "text/css; charset=utf-8", "h1 { color: rgb(120, 13, 141); }"],
    ].map(async ([path, contentType, value]) => {
      const body = new TextEncoder().encode(value);
      return { body, file: { path, contentType, ...(await describePreviewBytes(body)) } };
    }),
  );
  const packages = runtime.previewPackages;
  const output = await packages.prepare(claim, {
    schemaVersion: 1,
    html: "index.html",
    files: content.map(({ file }) => file),
  });
  for (const { file, body } of content)
    expect(await packages.stage(claim, file.path, file, body)).toBe(true);
  expect(await packages.complete(claim, output, [])).toBe(true);
}

async function signedIn(context, admin) {
  const page = await context.newPage();
  await page.goto(`${admin}/admin/preview-fixture`);
  const status = await page.evaluate(
    async () =>
      (
        await fetch("/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "admin@lace.test",
            password: "correct horse battery staple",
          }),
        })
      ).status,
  );
  expect(status).toBe(200);
  return page;
}

async function openFrame(page, preview) {
  const start = new URL("/access/start", preview);
  start.searchParams.set("return", "/p/browser/");
  await page.locator("iframe").evaluate((frame, url) => {
    frame.src = url;
  }, start.href);
  return page.frameLocator("iframe");
}

async function signInOnScreen(page) {
  await page.getByLabel("Email").fill("admin@lace.test");
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function assertAdminPreviewScreen(browser, same, cross) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = await signedIn(context, same.admin);
  await page.goto(same.entry);
  const title = page.getByRole("textbox", { name: "Title" });
  const unsaved = `${await title.inputValue()} unsaved`;
  await title.fill(unsaved);
  const open = page.getByRole("button", { name: "Open preview" });
  await open.focus();
  await page.keyboard.press("Enter");
  const screen = page.getByRole("dialog");
  await browserExpect(screen.getByRole("heading")).toBeFocused();
  await browserExpect(screen).toContainText("Captured revision 7");
  await browserExpect(screen).toContainText("The saved draft is revision 8.");
  await browserExpect(screen.locator("time").last()).toHaveAttribute("datetime", /^\d{4}-/u);
  const frame = screen.locator("iframe");
  const draft = frame.contentFrame().getByRole("heading", { name: "Protected draft" });
  await browserExpect(draft).toHaveAttribute("data-parent", "isolated");
  await browserExpect(draft).toHaveCSS("color", "rgb(120, 13, 141)");
  expect((await frame.boundingBox()).width).toBeGreaterThan(1_000);
  const narrow = screen.getByRole("button", { name: "Narrow" });
  await narrow.focus();
  await page.keyboard.press("Space");
  await browserExpect(narrow).toHaveAttribute("aria-pressed", "true");
  expect((await frame.boundingBox()).width).toBe(390);
  await page.setViewportSize({ width: 375, height: 800 });
  expect((await frame.boundingBox()).width).toBeLessThanOrEqual(375);
  await page.setViewportSize({ width: 1280, height: 900 });
  await browserExpect(draft).toBeVisible();

  await stageBrowserDraft(same.runtime, same.run, "browser-two", "Protected second draft");
  const another = await context.newPage();
  await another.goto(`${same.preview}/view/browser-two`);
  await browserExpect(
    another.frameLocator("iframe").getByText("Protected second draft"),
  ).toBeVisible();
  await browserExpect(draft).toBeVisible();
  await another.close();

  await context.clearCookies({ name: "__Host-lace-preview" });
  await frame
    .contentFrame()
    .locator("body")
    .evaluate(() => location.reload());
  await browserExpect(screen.getByRole("status")).toContainText(
    "The preview could not be opened here.",
  );
  const reload = screen.getByRole("button", { name: "Reload preview" });
  await reload.click();
  await browserExpect(draft).toBeVisible();

  await context.clearCookies({ domain: new URL(same.admin).hostname });
  await reload.click();
  await browserExpect(screen.getByRole("status")).toContainText("Open in a new tab to sign in");
  const loginOpened = context.waitForEvent("page");
  await screen.getByRole("link", { name: "Open in new tab" }).click();
  const login = await loginOpened;
  await login.waitForURL((url) => url.pathname === "/admin/login");
  await signInOnScreen(login);
  await login.waitForURL(`${same.preview}/view/browser`);
  await browserExpect(login.frameLocator("iframe").getByText("Protected draft")).toBeVisible();
  expect(
    await login.evaluate(() => ({ opener: window.opener, referrer: document.referrer })),
  ).toEqual({
    opener: null,
    referrer: "",
  });
  await login.close();
  await reload.click();
  await browserExpect(draft).toBeVisible();
  await page.keyboard.press("Control+s");
  await page.keyboard.press("Escape");
  await browserExpect(open).toBeFocused();
  await browserExpect(title).toHaveValue(unsaved);
  expect(page.url()).toBe(same.entry);

  const other = await signedIn(context, cross.admin);
  await other.goto(cross.entry);
  await other.getByRole("button", { name: "Open preview" }).click();
  const fallback = other.getByRole("dialog");
  await browserExpect(fallback.locator("iframe")).toHaveCount(0);
  await browserExpect(fallback.getByRole("link", { name: "Open in new tab" })).toBeVisible();
  await context.close();
}

test("HTTPS preview handoff works in a same-site iframe and falls back to a first-party viewer", async () => {
  const endpoint = process.env.LACE_TEST_PREVIEW_S3_URL;
  if (!endpoint || new URL(endpoint).hostname !== "127.0.0.1")
    throw new Error("The HTTPS fixture requires LACE_TEST_PREVIEW_S3_URL on loopback.");
  const cleanups = [];
  const client = new S3Client({
    endpoint,
    forcePathStyle: true,
    region: "us-east-1",
    credentials: { accessKeyId: "test-access-key", secretAccessKey: "test-secret-key" },
  });
  cleanups.push(() => client.destroy());
  try {
    const server = await startHttps(cleanups);
    const same = await installPreview(
      cleanups,
      server,
      { endpoint, client },
      "cms.preview-check.example.com",
      "preview.preview-check.example.com",
    );
    const cross = await installPreview(
      cleanups,
      server,
      { endpoint, client },
      "cms.other.test",
      "preview.example.net",
    );
    const foreign = `https://foreign.preview-check.example.com:${server.port}`;
    server.routes.set(new URL(foreign).host, () =>
      html(`<!doctype html><iframe src="${same.site}"></iframe>`),
    );
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--no-proxy-server",
        "--host-resolver-rules=MAP *.preview-check.example.com 127.0.0.1, MAP *.other.test 127.0.0.1, MAP preview.example.net 127.0.0.1",
        "--test-third-party-cookie-phaseout",
      ],
    });
    cleanups.push(() => browser.close());
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await signedIn(context, same.admin);
    const frame = await openFrame(page, same.preview);
    const heading = frame.getByRole("heading", { name: "Protected draft" });
    await browserExpect(heading).toHaveAttribute("data-parent", "isolated");
    await browserExpect(heading).toHaveAttribute("data-worker", "blocked");
    await browserExpect(heading).toHaveCSS("color", "rgb(120, 13, 141)");
    expect(page.url()).toBe(`${same.admin}/admin/preview-fixture`);
    const previewCookies = await context.cookies(same.preview);
    expect(previewCookies.map(({ name }) => name)).toEqual(["__Host-lace-preview"]);
    expect(previewCookies[0]).toMatchObject({
      domain: "preview.preview-check.example.com",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    });
    const foreignPage = await context.newPage();
    const refused = foreignPage.waitForResponse((response) => response.url() === same.site);
    await foreignPage.goto(foreign);
    expect((await refused).status()).toBe(200);
    await browserExpect(
      foreignPage.frameLocator("iframe").getByText("Protected draft"),
    ).toHaveCount(0);

    const other = await signedIn(context, cross.admin);
    const crossFrame = await openFrame(other, cross.preview);
    const fallback = crossFrame.getByRole("link", { name: "Open preview in a new tab" });
    await browserExpect(fallback).toBeVisible();
    const opened = context.waitForEvent("page");
    await fallback.click();
    const viewer = await opened;
    await viewer.waitForURL(`${cross.preview}/view/browser`);
    await browserExpect(viewer.getByText("Draft preview · Revision 7")).toBeVisible();
    await browserExpect(viewer.locator("time")).toHaveAttribute("datetime", /^\d{4}-/u);
    await browserExpect(viewer.frameLocator("iframe").getByText("Protected draft")).toBeVisible();
    expect(
      await viewer.evaluate(() => ({ opener: window.opener, referrer: document.referrer })),
    ).toEqual({ opener: null, referrer: "" });
    const workerScript = new Request(`${same.preview}/p/browser/site.js`, {
      headers: {
        "service-worker": "script",
        cookie: `${previewCookies[0].name}=${previewCookies[0].value}`,
      },
    });
    expect((await server.routes.get(new URL(same.preview).host)(workerScript)).status).toBe(404);

    const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
    const login = await anonymous.newPage();
    await login.goto(`${cross.preview}/view/browser`);
    expect(new URL(login.url()).pathname).toBe("/admin/login");
    await signInOnScreen(login);
    await login.waitForURL(`${cross.preview}/view/browser`);
    await browserExpect(login.frameLocator("iframe").getByText("Protected draft")).toBeVisible();
    await assertAdminPreviewScreen(browser, same, cross);
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
});
