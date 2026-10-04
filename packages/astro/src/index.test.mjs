import { readdir, readFile } from "node:fs/promises";
import { LacePublishedSiteError } from "@lacecms/sdk";
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
