import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";
import { generateProject } from "../dist/index.js";

const exec = promisify(execFile);
const workspace = fileURLToPath(new URL("../../../", import.meta.url));
const astro = join(workspace, "apps/site/node_modules/astro/bin/astro.mjs");
const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function project() {
  const parent = await mkdtemp(join(tmpdir(), "lace-onboarding-test-"));
  roots.push(parent);
  const result = await generateProject({ target: join(parent, "site") });
  // Focused template tests reuse installed tools; packaged isolation is checked by acceptance.
  await symlink(join(workspace, "apps/site/node_modules"), join(result.path, "site/node_modules"));
  return result;
}

async function fixture() {
  return JSON.parse(
    await readFile(join(workspace, "apps/site/src/fixtures/published-export.json"), "utf8"),
  );
}

/** Serves the build export like the Lace API, honoring entity tags. */
async function exportServer(token, current) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.headers["if-none-match"] ?? null);
    if (
      request.url !== "/api/v1/public/build-export" ||
      request.headers.authorization !== `Bearer ${token}`
    ) {
      response.writeHead(403, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "AUTHORIZATION_DENIED", message: "Denied" } }));
      return;
    }
    const exported = current();
    const etag = `"${exported.version}"`;
    if (request.headers["if-none-match"] === etag) {
      response.writeHead(304, { etag }).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json", etag });
    response.end(JSON.stringify(exported));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    requests,
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function outputText(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  return (
    await Promise.all(files.map((entry) => readFile(join(entry.parentPath, entry.name), "utf8")))
  ).join("\n");
}

test("generated block sources are user-owned and identical to the reference site", async () => {
  const generated = await project();
  const lock = JSON.parse(await readFile(join(generated.path, "site/lace.site.json"), "utf8"));
  const shared = [
    "lace.site.json",
    "src/env.d.ts",
    lock.blockMap,
    ...Object.values(lock.items).flatMap((item) => Object.keys(item.files)),
  ];
  expect(shared).toHaveLength(8);
  for (const path of shared) {
    expect(generated.manifest.files[`site/${path}`]).toEqual({ owner: "user" });
    expect(await readFile(join(generated.path, "site", path), "utf8")).toBe(
      await readFile(join(workspace, "apps/site", path), "utf8"),
    );
  }
  for (const removed of ["src/lib/site-data.ts", "src/lib/rendering.ts", "src/lib/rich-text.ts"])
    expect(generated.manifest.files[`site/${removed}`]).toBeUndefined();
});

test("generated Astro builds all five blocks from one export and rejects unsupported content", async () => {
  const generated = await project();
  const exported = await fixture();
  exported.entries = exported.entries.slice(0, 2);
  let served = exported;
  const token = "private-test-build-credential";
  const server = await exportServer(token, () => served);
  const env = {
    ...process.env,
    ASTRO_TELEMETRY_DISABLED: "1",
    LACE_API_BASE_URL: server.url,
    LACE_PUBLIC_BASE_URL: "https://public.example/lace/",
    LACE_BUILD_TOKEN: token,
  };
  const build = (overrides = {}) =>
    exec(process.execPath, [astro, "build"], {
      cwd: join(generated.path, "site"),
      env: { ...env, ...overrides },
    });
  try {
    await build();
    expect(server.requests).toEqual([null]);
    const home = await readFile(join(generated.path, "site/dist/index.html"), "utf8");
    const post = await readFile(
      join(generated.path, "site/dist/blog/first-post/index.html"),
      "utf8",
    );
    expect([...home.matchAll(/data-lace-block="([^"]+)"/gu)].map((match) => match[1])).toEqual([
      "hero",
      "cta",
    ]);
    expect([...post.matchAll(/data-lace-block="([^"]+)"/gu)].map((match) => match[1])).toEqual([
      "richText",
      "image",
      "quote",
    ]);
    expect(home).toContain('data-lace-model="home" data-lace-entry="home-entry"');
    expect(post).toContain('data-lace-block-key="post-image"');
    expect(post).toContain('data-lace-part="caption"');
    expect(post).toContain("Content belongs in the CMS");
    expect(post).toContain("https://public.example/lace/api/v1/public/media/post-media");
    const output = await outputText(join(generated.path, "site/dist"));
    expect(output).not.toContain(token);
    expect(output).not.toContain("DRAFT ONLY");
    expect(output).not.toContain("javascript:");

    served = structuredClone(exported);
    served.entries[0].entry.published.blocks[0].type = "unknownBlock";
    await expect(build()).rejects.toThrow(/no component for block type unknownBlock/u);
    served = structuredClone(exported);
    served.entries[1].entry.published.blocks[0].data.content.content[1].content[0].marks = [
      { type: "link", attrs: { href: "javascript:alert(1)" } },
    ];
    await expect(build()).rejects.toThrow(
      /block post-rich-text of model posts .* at field content/u,
    );
    served = { ...exported, entries: exported.entries.slice(1) };
    await expect(build()).rejects.toThrow(/publish the home page in Admin/u);
    const missing = await build({ LACE_BUILD_TOKEN: "" }).catch((error) => error);
    expect(missing.message).toMatch(/LACE_BUILD_TOKEN.*Admin Settings/su);
    const rejected = await build({ LACE_BUILD_TOKEN: "wrong-token" }).catch((error) => error);
    expect(rejected.message).toMatch(/rejected LACE_BUILD_TOKEN.*Admin Settings/su);
    expect(rejected.message).not.toContain(token);
  } finally {
    await server.close();
  }
}, 90_000);

test("generated Astro dev revalidates the export so publications appear on reload", async () => {
  const generated = await project();
  const exported = await fixture();
  exported.entries = exported.entries.slice(0, 2);
  let served = exported;
  const token = "private-dev-build-credential";
  const server = await exportServer(token, () => served);
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(
    process.execPath,
    [astro, "dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: join(generated.path, "site"),
      env: {
        // Vitest exports NODE_ENV, MODE, DEV and PROD, which would leak into Astro's mode.
        HOME: process.env.HOME,
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
        // Keeps Astro in the foreground even when it detects a coding agent.
        ASTRO_DEV_BACKGROUND: "1",
        ASTRO_TELEMETRY_DISABLED: "1",
        LACE_API_BASE_URL: server.url,
        LACE_BUILD_TOKEN: token,
      },
      stdio: "pipe",
    },
  );
  let log = "";
  child.stdout.on("data", (chunk) => (log += chunk));
  child.stderr.on("data", (chunk) => (log += chunk));
  const page = async (path) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`);
        const text = await response.text();
        // The HTTP server can answer before Astro has registered its routes.
        if (!text.includes("Cannot GET")) return { status: response.status, text };
      } catch {
        /* Not listening yet. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`astro dev did not start:\n${log}`);
  };
  try {
    const first = await page("/");
    expect(first.text, log).toContain("The static Lace starter");
    expect((await page("/")).text).toContain("The static Lace starter");
    served = structuredClone(exported);
    served.version = 8;
    served.entries[0].entry.published.blocks[0].data.heading = "Published again";
    expect((await page("/")).text, JSON.stringify(server.requests)).toContain("Published again");
    expect((await page("/blog/first-post/")).text).toContain("First published post");
    expect(server.requests.slice(0, 3)).toEqual([null, '"7"', '"7"']);
    expect(server.requests.at(-1)).toBe('"8"');
  } finally {
    child.kill();
    await server.close();
  }
}, 90_000);
