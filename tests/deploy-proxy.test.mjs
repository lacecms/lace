import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { MAX_MEDIA_BYTES } from "../packages/application/dist/index.js";

const MiB = 1024 * 1024;
const repositoryConfig = "deploy/nginx.conf";
const templateConfig = "packages/create-lace/templates/deploy/nginx.conf";

const units = { "": 1, k: 1024, m: MiB, g: 1024 * MiB };

const bytes = (size) => {
  const match = /^(\d+)([kmg]?)$/i.exec(size ?? "");
  if (!match) throw new Error(`Unreadable nginx size: ${size}`);
  return Number(match[1]) * units[match[2].toLowerCase()];
};

const directives = (body) =>
  body
    .split(";")
    .map((line) => line.replace(/#[^\n]*/g, "").trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/));

const parse = (source) => {
  const locations = new Map();
  const serverLevel = source.replace(/location\s+([^{]+?)\s*\{([^}]*)\}/g, (_, match, body) => {
    locations.set(match, directives(body));
    return "";
  });
  const server = /server\s*\{([\s\S]*)\}/.exec(serverLevel)?.[1] ?? "";
  return { server: directives(server), locations };
};

const values = (list, name) => list.filter(([key]) => key === name).map(([, ...rest]) => rest);

test("both proxy configurations are identical", async () => {
  const [repository, template] = await Promise.all([
    readFile(repositoryConfig, "utf8"),
    readFile(templateConfig, "utf8"),
  ]);
  expect(template).toBe(repository);
});

test("the proxy keeps JSON bodies at 1 MiB and streams media up to the API ceiling", async () => {
  const { server, locations } = parse(await readFile(repositoryConfig, "utf8"));

  expect(values(server, "client_max_body_size")).toEqual([["1m"]]);

  const media = locations.get("= /api/v1/admin/media");
  expect(media, "exact media upload location").toBeDefined();
  const [[limit]] = values(media, "client_max_body_size");
  expect(bytes(limit)).toBeGreaterThan(MAX_MEDIA_BYTES);
  expect(bytes(limit)).toBeLessThanOrEqual(MAX_MEDIA_BYTES + MiB);
  expect(values(media, "proxy_request_buffering")).toEqual([["off"]]);

  const api = locations.get("/api/");
  expect(values(media, "proxy_pass")).toEqual(values(api, "proxy_pass"));
  expect(values(media, "proxy_set_header")).toEqual(values(api, "proxy_set_header"));
});

const ASSET_CACHE = ['"public,', "max-age=2592000,", 'immutable"'];

test("the proxy caches hashed assets for 30 days and keeps pages revalidating", async () => {
  const { locations } = parse(await readFile(repositoryConfig, "utf8"));

  const assets = locations.get("/_astro/");
  expect(assets, "hashed asset location").toBeDefined();
  // Without `always`, nginx leaves the header off 404 responses.
  expect(values(assets, "add_header")).toEqual([["Cache-Control", ...ASSET_CACHE]]);
  expect(values(assets, "try_files")).toEqual([["$uri", "=404"]]);
  expect(values(assets, "root")).toEqual(values(locations.get("/"), "root"));

  expect(values(locations.get("/"), "add_header")).toEqual([
    ["Cache-Control", '"no-cache"', "always"],
  ]);
  expect(values(locations.get("= /_headers"), "return")).toEqual([["404"]]);
});

test("the starter Pages header rules match the proxy asset cache", async () => {
  const { locations } = parse(await readFile(repositoryConfig, "utf8"));
  const [[, ...proxyValue]] = values(locations.get("/_astro/"), "add_header");
  const rules = await readFile("packages/create-lace/templates/site/public/_headers", "utf8");
  expect(rules).toBe(`/_astro/*\n  Cache-Control: ${proxyValue.join(" ").replaceAll('"', "")}\n`);
});

test("MCP and canonical discovery reach the API without buffering or credential query logging", async () => {
  const source = await readFile(repositoryConfig, "utf8");
  const { locations } = parse(source);
  for (const path of [
    "= /mcp",
    "/mcp/",
    "= /.well-known/oauth-protected-resource/mcp",
    "= /.well-known/oauth-authorization-server/api/auth",
  ]) {
    expect(values(locations.get(path), "proxy_pass")).toEqual([["http://api:3000"]]);
    expect(values(locations.get(path), "proxy_buffering")).toEqual([["off"]]);
    expect(values(locations.get(path), "proxy_set_header")).toContainEqual(["Host", "$http_host"]);
  }
  const format = /log_format lace_safe '([^']+)'/u.exec(source)[1];
  expect(format).toContain("$uri");
  expect(format).not.toMatch(
    /\$request(?:\s|$)|\$request_uri|\$args|\$http_referer|\$http_authorization/,
  );
});
