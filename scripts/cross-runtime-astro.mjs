import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { assertSecretFree, scanTree } from "./consumer-security.mjs";
import { expected } from "./cross-runtime-api.mjs";
const exec = promisify(execFile);
export async function astroJourney(f, seed) {
  console.info(`34A ${f.kind} Astro: build actual authenticated export`);
  const directory = await mkdtemp(join(tmpdir(), `lace-34a-astro-${f.kind}-`));
  try {
    const sentinel = "static-build-credential-sentinel-34b-private-value";
    const secrets = [seed.token, sentinel];
    const built = await exec("pnpm", ["exec", "astro", "build", "--outDir", directory], {
      cwd: resolve("apps/site"),
      timeout: 90000,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        LACE_AUTH_SECRET: sentinel,
        AWS_SECRET_ACCESS_KEY: sentinel,
        LACE_SITE_DATA_MODE: "live",
        LACE_API_BASE_URL: f.origin,
        LACE_BUILD_TOKEN: seed.token,
        LACE_PUBLIC_BASE_URL: "https://media.34a.test/",
        LACE_EXPECTED_PUBLISHED_VERSION: "5",
      },
    });
    assertSecretFree(built.stdout + built.stderr, secrets, `${f.kind} Astro build diagnostics`);
    await scanTree(directory, secrets, `${f.kind} generated static output`);
    const files = (await readdir(directory, { recursive: true, withFileTypes: true }))
      .filter((file) => file.isFile())
      .map((file) => join(file.parentPath, file.name));
    const htmlFiles = files.filter((file) => file.endsWith(".html")).sort();
    const manifest = { routes: [], media: [], blocks: {} };
    for (const file of files) {
      const text = await readFile(file, "utf8");
      assert.ok(!text.includes(seed.token), "static output contains build credential");
      assert.doesNotMatch(text, /DRAFT ONLY|UNPUBLISHED SENTINEL|UNPUBLISHED ROUTE CONFLICT/u);
    }
    for (const file of htmlFiles) {
      const path =
        "/" +
        relative(directory, file)
          .replace(/index\.html$/u, "")
          .replace(/\/$/u, "");
      manifest.routes.push(path);
      const html = await readFile(file, "utf8");
      const entry = expected.site.find((entry) => entry.path === path);
      assert.ok(entry, `unexpected route ${path}`);
      assert.ok(html.includes(entry.title), `${path} published title absent`);
      const keys = [...html.matchAll(/data-lace-block-key="([^"]+)"/gu)].map((m) => m[1]);
      assert.deepEqual(
        keys,
        entry.blocks.map((b) => b.key),
        `${path} block order`,
      );
      manifest.blocks[path] = keys;
      for (const match of html.matchAll(
        /https:\/\/media\.34a\.test\/api\/v1\/public\/media\/([^"\s<>]+)/gu,
      )) {
        assert.equal(match[1], seed.cover, "unexpected media reference");
        manifest.media.push("<cover>");
      }
    }
    assert.deepEqual(manifest.routes.sort(), expected.routes);
    assert.deepEqual(manifest.media, ["<cover>"]);
    return manifest;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
