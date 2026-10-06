import { readdir, readFile } from "node:fs/promises";
import { LacePublishedSiteError, createPublishedSiteLoader } from "@lacecms/sdk";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { afterEach, expect, test } from "vitest";
import { createAstroSiteLoader } from "../dist/index.js";

const token = "lace_build_astro-secret-token";
const env = Object.freeze({
  LACE_API_BASE_URL: "http://api:3000/",
  LACE_BUILD_TOKEN: token,
  LACE_PUBLIC_BASE_URL: "https://media.example/lace/",
});
const fixture = JSON.parse(
  await readFile(new URL("../../../apps/site/src/fixtures/published-export.json", import.meta.url)),
);

function exportServer() {
  const conditions = [];
  let version = 7;
  return {
    conditions,
    publish(next) {
      version = next;
    },
    fetch: async (url, init) => {
      const headers = new Headers(init.headers);
      expect(String(url)).toBe("http://api:3000/api/v1/public/build-export");
      expect(headers.get("authorization")).toBe(`Bearer ${token}`);
      conditions.push(headers.get("if-none-match"));
      const etag = `"${version}"`;
      if (headers.get("if-none-match") === etag)
        return new Response(null, { headers: { etag }, status: 304 });
      const exported = structuredClone(fixture);
      exported.version = version;
      exported.entries[0].entry.published.title = `Home v${version}`;
      return Response.json(exported, { headers: { etag } });
    },
  };
}

const saved = { ...process.env };
afterEach(() => {
  for (const name of Object.keys(process.env)) if (!(name in saved)) delete process.env[name];
  Object.assign(process.env, saved);
  delete globalThis.window;
});

test("a static build reads one export shared by every route", async () => {
  const server = exportServer();
  const getSite = createAstroSiteLoader({ env, fetch: server.fetch });
  const [left, right] = await Promise.all([getSite(), getSite()]);
  expect(left).toBe(right);
  expect(await getSite()).toBe(left);
  expect(server.conditions).toEqual([null]);
  expect(left.byPath("/")?.title).toBe("Home v7");
  expect(left.mediaUrl("post-media")).toBe(
    "https://media.example/lace/api/v1/public/media/post-media",
  );
});

test("dev mode revalidates with the entity tag on every call", async () => {
  const server = exportServer();
  const getSite = createAstroSiteLoader({ dev: true, env, fetch: server.fetch });
  const first = await getSite();
  expect(await getSite()).toBe(first);
  server.publish(8);
  const changed = await getSite();
  expect(changed.byPath("/")?.title).toBe("Home v8");
  expect(server.conditions).toEqual([null, '"7"', '"7"']);
});

test("the process environment is the default", async () => {
  Object.assign(process.env, env);
  const server = exportServer();
  const site = await createAstroSiteLoader({ fetch: server.fetch })();
  expect(site.version).toBe(7);
});

test("hints follow the loader message and the token never appears", async () => {
  const getSite = createAstroSiteLoader({
    env,
    fetch: async () =>
      Response.json(
        { error: { code: "AUTHORIZATION_DENIED", message: "Denied." } },
        { status: 403 },
      ),
    hints: { rejected_token: "Create a new token in Admin Settings." },
  });
  const error = await getSite().catch((cause) => cause);
  expect(error).toBeInstanceOf(LacePublishedSiteError);
  expect(error.code).toBe("rejected_token");
  expect(error.message).toMatch(
    /rejected LACE_BUILD_TOKEN .* Create a new token in Admin Settings\.$/u,
  );
  expect(error.message).not.toContain(token);
  const missing = await createAstroSiteLoader({ env: {} })().catch((cause) => cause);
  expect(missing.code).toBe("missing_configuration");
});

test("evaluating the server module in a browser fails", async () => {
  globalThis.window = {};
  await expect(import("../dist/index.js?browser")).rejects.toThrow(/server-only/u);
});

test("the adapter exports only its server module and the two generic components", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  expect(Object.keys(manifest.exports)).toEqual([".", "./LaceBlocks.astro", "./RichText.astro"]);
  expect(manifest.files).toEqual(["dist"]);
  expect(manifest.peerDependencies).toEqual({ astro: "^7.3.1" });
  expect(Object.keys(manifest.dependencies).sort()).toEqual(["@lacecms/render", "@lacecms/sdk"]);
  const components = (await readdir(new URL("./", import.meta.url))).filter((name) =>
    name.endsWith(".astro"),
  );
  expect(components.sort()).toEqual(["LaceBlocks.astro", "RichText.astro", "RichTextNodes.astro"]);
});

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test.each([
  ["published-site static", false, (baseUrl) => createPublishedSiteLoader({ baseUrl, token })],
  [
    "published-site dev",
    true,
    (baseUrl) => createPublishedSiteLoader({ baseUrl, token, revalidate: true }),
  ],
  [
    "Astro static",
    false,
    (baseUrl) => createAstroSiteLoader({ env: { ...env, LACE_API_BASE_URL: baseUrl } }),
  ],
  [
    "Astro dev",
    true,
    (baseUrl) => createAstroSiteLoader({ dev: true, env: { ...env, LACE_API_BASE_URL: baseUrl } }),
  ],
])("%s works with default fetch through a gzip proxy", async (_name, dev, factory) => {
  let version = 7;
  const requests = [];
  const origin = createServer((request, response) => {
    if (
      request.url !== "/api/v1/public/build-export" ||
      request.headers.authorization !== `Bearer ${token}`
    ) {
      response.writeHead(403).end();
      return;
    }
    const etag = `"${version}"`;
    if (request.headers["if-none-match"]?.replace(/^W\//u, "") === etag) {
      response.writeHead(304, { etag }).end();
      return;
    }
    const exported = structuredClone(fixture);
    exported.version = version;
    exported.entries[0].entry.published.title = `Home v${version}`;
    response
      .writeHead(200, { "content-type": "application/json", etag })
      .end(JSON.stringify(exported));
  });
  const originUrl = await listen(origin);
  const proxy = createServer(async (request, response) => {
    try {
      const condition = request.headers["if-none-match"];
      requests.push({ condition, encoding: request.headers["accept-encoding"] });
      const upstream = await fetch(`${originUrl}${request.url}`, {
        headers: {
          authorization: request.headers.authorization,
          ...(condition === undefined ? {} : { "if-none-match": condition }),
        },
      });
      const etag = upstream.headers.get("etag");
      if (upstream.status === 304) {
        response.writeHead(304, { etag }).end();
        return;
      }
      const compressed = gzipSync(await upstream.text());
      response
        .writeHead(upstream.status, {
          "content-encoding": "gzip",
          "content-length": compressed.length,
          "content-type": "application/json",
          etag: `W/${etag}`,
          vary: "Accept-Encoding",
        })
        .end(compressed);
    } catch {
      response.writeHead(502).end();
    }
  });
  try {
    const proxyUrl = await listen(proxy);
    const getSite = factory(proxyUrl);
    const [first, concurrent] = await Promise.all([getSite(), getSite()]);
    expect(concurrent).toBe(first);
    expect(first.byPath("/")?.title).toBe("Home v7");
    expect(await getSite()).toBe(first);
    version = 8;
    const changed = await getSite();
    if (dev) {
      expect(changed.version).toBe(8);
      expect(changed.byPath("/")?.title).toBe("Home v8");
      expect(await getSite()).toBe(changed);
      expect(requests.map(({ condition }) => condition)).toEqual([
        undefined,
        'W/"7"',
        '"7"',
        'W/"8"',
      ]);
    } else {
      expect(changed).toBe(first);
      expect(requests).toHaveLength(1);
    }
    expect(requests.every(({ encoding }) => encoding.includes("gzip"))).toBe(true);
  } finally {
    await close(proxy);
    await close(origin);
  }
});
