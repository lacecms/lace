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
import { claimPreviewFixture } from "@lacecms/test-utils";
import { nodePreviewFixture } from "../packages/platform-node/src/test-support/preview-fixture.ts";
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
    assets: {
      fetch: async (request) =>
        new URL(request.url).pathname === "/admin/preview-fixture"
          ? html(
              '<!doctype html><title>Lace admin fixture</title><h1>Lace admin</h1><iframe title="Preview" sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"></iframe>',
            )
          : adminAssets.fetch(request),
    },
  });
  const { runtime, run } = fixture;
  for (const origin of [admin, preview]) {
    server.routes.set(new URL(origin).host, (request, target) => {
      runtime.setRequestPeer(request, "127.0.0.1", target);
      return runtime.app.fetch(request);
    });
  }
  const claim = await claimPreviewFixture(runtime.repository.preview, run, Date.now(), "browser");
  const markup = `<!doctype html><title>Site fixture</title><link rel="stylesheet" href="/p/browser/site.css">
    <h1>Protected draft</h1><script src="/p/browser/site.js"></script>`;
  const script = `const heading = document.querySelector("h1");
    try { void parent.document.title; heading.dataset.parent = "read"; }
    catch { heading.dataset.parent = "isolated"; }
    if (heading.dataset.parent === "isolated") {
      try { top.location.href = "/p/browser/"; } catch {}
    }
    navigator.serviceWorker.register("/p/browser/site.js").then(
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
  return { admin, preview, site: `${preview}/p/browser/` };
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
      "cms.lace.test",
      "preview.lace.test",
    );
    const cross = await installPreview(
      cleanups,
      server,
      { endpoint, client },
      "cms.other.test",
      "preview.example.net",
    );
    const foreign = `https://foreign.lace.test:${server.port}`;
    server.routes.set(new URL(foreign).host, () =>
      html(`<!doctype html><iframe src="${same.site}"></iframe>`),
    );
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--no-proxy-server",
        "--host-resolver-rules=MAP *.lace.test 127.0.0.1, MAP *.other.test 127.0.0.1, MAP preview.example.net 127.0.0.1",
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
      domain: "preview.lace.test",
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
    await login.getByLabel("Email").fill("admin@lace.test");
    await login.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
    await login.getByRole("button", { name: "Sign in", exact: true }).click();
    await login.waitForURL(`${cross.preview}/view/browser`);
    await browserExpect(login.frameLocator("iframe").getByText("Protected draft")).toBeVisible();
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
});
