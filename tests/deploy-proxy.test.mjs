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
