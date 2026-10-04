import { execFile } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";

// Verifies docs/lace-astro-site.md in generated projects: an independent Astro
// site that is not the starter connects through the documented files only.
const exec = promisify(execFile);
const workspace = fileURLToPath(new URL("..", import.meta.url));
const fixtureSite = join(workspace, "tests/fixtures/existing-astro-site");
const astro = join(workspace, "apps/site/node_modules/astro/bin/astro.mjs");
const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function outputText(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  return (
    await Promise.all(files.map((entry) => readFile(join(entry.parentPath, entry.name), "utf8")))
  ).join("\n");
}

test("an existing Astro site builds Lace pages, collections and blocks from the guide files", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-existing-site-"));
  roots.push(root);
  const site = join(root, "site");
  await cp(fixtureSite, site, { recursive: true });
  // The guide installs the packages; reuse the workspace installation here.
  await symlink(join(workspace, "apps/site/node_modules"), join(site, "node_modules"));

  const exported = JSON.parse(
    await readFile(join(workspace, "apps/site/src/fixtures/published-export.json"), "utf8"),
  );
  exported.entries = exported.entries.slice(0, 2);
  exported.entries[1].path = "/articles/first-post";
  exported.entries[1].entry.model.route = "/articles/:slug";
  const token = "lace_build_existing-site-sentinel";
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(403).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json", etag: '"7"' });
    response.end(JSON.stringify(exported));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await exec(process.execPath, [astro, "build"], {
      cwd: site,
      env: {
        ...process.env,
        ASTRO_TELEMETRY_DISABLED: "1",
        LACE_API_BASE_URL: `http://127.0.0.1:${server.address().port}/`,
        LACE_BUILD_TOKEN: token,
        LACE_PUBLIC_BASE_URL: "https://cms.example/lace/",
      },
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  expect(requests).toBe(1);
  const home = await readFile(join(site, "dist/index.html"), "utf8");
  const article = await readFile(join(site, "dist/articles/first-post/index.html"), "utf8");
  const blocks = (html) =>
    [...html.matchAll(/data-lace-block="([^"]+)"/gu)].map((match) => match[1]);
  expect(blocks(home)).toEqual(["hero", "cta"]);
  expect(blocks(article)).toEqual(["richText", "image", "quote"]);
  expect(home).toContain('<main data-lace-model="home" data-lace-entry="home-entry">');
  expect(home).toContain('<a href="/articles/first-post/">First published post</a>');
  expect(home).toContain("https://cms.example/lace/api/v1/public/media/hero-media");
  expect(article).toContain('<article data-lace-model="posts" data-lace-entry="first-post-entry">');
  expect(article).toContain("<h2>A safe rich-text heading</h2>");
  expect(article).toContain('<a href="https://lace.example"><em>Published only</em></a>');
  expect(article).toContain("<blockquote><p>Quoted rich text<br>across two lines</p></blockquote>");
  expect(article).toContain(
    '<footer class="site-footer"><p>Content from <a class="external" href="https://lace.example" rel="noopener">Lace</a></p></footer>',
  );
  expect(home).toContain("[data-lace-block=hero] [data-lace-part=heading]");
  const output = await outputText(join(site, "dist"));
  expect(output).not.toContain(token);
  expect(output).not.toContain("DRAFT ONLY");
}, 60_000);

test("the connection guide shows the fixture files verbatim", async () => {
  const guide = await readFile(
    join(workspace, "packages/create-lace/templates/docs/lace-astro-site.md"),
    "utf8",
  );
  for (const path of [
    "src/lib/lace.ts",
    "src/env.d.ts",
    "src/pages/index.astro",
    "src/pages/articles/[slug].astro",
    "src/components/ExternalLink.astro",
    "src/styles/site.css",
  ]) {
    const source = (await readFile(join(fixtureSite, path), "utf8")).trimEnd();
    expect(guide, path).toContain(source);
  }
});
