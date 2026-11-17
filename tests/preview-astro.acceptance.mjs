import { readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { servePublished, verifyPreviewBrowser } from "./support/preview-astro-browser.mjs";
import {
  astroBuild,
  entry,
  frozenInput,
  previewPackager,
  previewWorkspace,
  sharp,
} from "./support/preview-astro-fixture.mjs";

let workspace;
let site;
beforeAll(async () => {
  workspace = await previewWorkspace();
  site = await workspace.existingSite();
}, 90000);
afterAll(async () => workspace?.cleanup());

test.each([
  [entry("home", "/"), "index.html"],
  [entry("about", "/about"), "about/index.html"],
  [entry("note", "/notes/renamed", "notes", "renamed"), "notes/renamed/index.html"],
  [entry("new-note", "/notes/unpublished", "notes", "unpublished"), "notes/unpublished/index.html"],
])(
  "renders only %j through the installed adapter",
  async (target, expected) => {
    const context = [entry("note", "/notes/old", "notes", "old")];
    const { output } = await astroBuild(site, frozenInput(target.id, target, context));
    expect(
      (await readdir(output, { recursive: true })).filter((name) => name.endsWith(".html")),
    ).toEqual([expected]);
    expect(await readFile(join(output, expected), "utf8")).toContain("Saved draft title");
  },
  45000,
);

test("fails if no site page implements the saved path", async () => {
  await expect(
    astroBuild(site, frozenInput("absent", entry("missing", "/missing"))),
  ).rejects.toThrow("PREVIEW_ROUTE_CONFLICT");
}, 45000);

test("fails if multiple routes enumerate the target", async () => {
  const duplicate = join(site, "src/pages/notes/duplicate.astro");
  // A fixed route and [slug] both enumerate /notes/duplicate.
  await writeFile(duplicate, "<h1>Wrong page</h1>");
  try {
    await expect(
      astroBuild(
        site,
        frozenInput("ambiguous", entry("note", "/notes/duplicate", "notes", "duplicate")),
      ),
    ).rejects.toThrow("PREVIEW_ROUTE_CONFLICT");
  } finally {
    await rm(duplicate);
  }
}, 45000);

test("renders desktop and narrow previews with working assets under two prefixes in Chromium", async () => {
  const packages = new Map();
  for (const id of ["paper-first", "paper-second"]) {
    const input = frozenInput(id, entry("photo-note", "/notes/photos", "notes", "photos"));
    const image = {
      id: "draft-cover",
      alt: "Draft cover",
      caption: null,
      focalPoint: null,
      height: 620,
      width: 1080,
      mimeType: "image/png",
    };
    input.target.fields.cover = image.id;
    input.targetMedia[image.id] = image;
    input.context.media.unused = { ...image, id: "unused" };
    const bytes = await sharp({
      create: { width: 1080, height: 620, channels: 3, background: "#b96" },
    })
      .png()
      .toBuffer();
    const { output, inputFile, stdout, stderr } = await astroBuild(
      site,
      input,
      {},
      { [image.id]: bytes, unused: bytes },
    );
    const html = await readFile(join(output, "notes/photos/index.html"), "utf8");
    expect(html).toContain(`/p/${id}/_lace_preview_media/draft-cover.png`);
    expect(await readFile(join(output, "_lace_preview_media/draft-cover.png"))).toEqual(bytes);
    const packagePreview = await previewPackager(site);
    const pack = await packagePreview(inputFile, {
      forbiddenValues: ["fixture-serialized-claim-secret"],
    });
    expect(pack.mediaIds).toEqual(["draft-cover"]);
    expect(pack.manifest.files.some((file) => file.path.includes("unused.png"))).toBe(false);
    expect(html + stdout + stderr).not.toMatch(
      /fixture-serialized-claim-secret|private-runner\.invalid/u,
    );
    expect(html).not.toMatch(/127\.0\.0\.1/u);
    packages.set(id, pack);
  }
  const results = await verifyPreviewBrowser(packages);
  expect(results).toHaveLength(4);
}, 90000);

test("the runner inventory filters hosting pages and rejects unsafe files and exhausted budgets", async () => {
  const input = frozenInput("inventory", entry("home", "/"));
  const { output, inputFile } = await astroBuild(site, input);
  const packagePreview = await previewPackager(site);
  await writeFile(join(output, "404.html"), "Outside preview");
  await writeFile(join(output, "robots.txt"), "Published only");
  await writeFile(join(output, "sitemap-index.xml"), "<sitemapindex />");
  const { manifest, mediaIds } = await packagePreview(inputFile);
  expect(mediaIds).toEqual([]);
  expect(manifest).toMatchObject({ schemaVersion: 1, html: "index.html" });
  expect(manifest.files.filter((file) => !file.path.startsWith("_astro/"))).toEqual([
    {
      path: "index.html",
      contentType: "text/html; charset=utf-8",
      bytes: expect.any(Number),
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
    },
  ]);
  for (const [path, content] of [
    [".env", "private"],
    ["script.js.map", "{}"],
    ["input.json", "{}"],
    ["renamed.json", JSON.stringify(input)],
    ["inline.js", "//# sourceMappingURL=data:application/json;base64,e30="],
    ["leak.js", `console.log(${JSON.stringify(inputFile)});`],
  ]) {
    const file = join(output, path);
    await writeFile(file, content);
    await expect(packagePreview(inputFile)).rejects.toThrow("PREVIEW_RENDER_FAILED");
    await rm(file);
  }
  const alias = join(output, "linked.png");
  await symlink(inputFile, alias);
  await expect(packagePreview(inputFile)).rejects.toThrow("regular, unlinked files");
  await rm(alias);
  await expect(packagePreview(inputFile, { limits: { perFileBytes: 5 } })).rejects.toThrow(
    "PREVIEW_RESOURCE_LIMIT",
  );
  await expect(packagePreview(inputFile, { limits: { manifestBytes: 10 } })).rejects.toThrow(
    "PREVIEW_RESOURCE_LIMIT",
  );
}, 45000);

test("fails on absent literal local assets", async () => {
  const page = join(site, "src/pages/about.astro");
  const content = await readFile(page, "utf8");
  await writeFile(page, content + '\n<img src="/missing-literal.svg" alt="">\n');
  try {
    await expect(
      astroBuild(site, frozenInput("broken-asset", entry("about", "/about"))),
    ).rejects.toThrow("a referenced local asset is missing");
  } finally {
    await writeFile(page, content);
  }
}, 45000);

test("reports failure enumerating an unrelated route", async () => {
  const route = join(site, "src/pages/unrelated-[slug].astro");
  await writeFile(
    route,
    '---\nexport function getStaticPaths() { throw new Error("Enumeration fixture failed"); }\n---\n<h1>Unrelated</h1>\n',
  );
  try {
    await expect(astroBuild(site, frozenInput("unrelated", entry("home", "/")))).rejects.toThrow(
      "Enumeration fixture failed",
    );
  } finally {
    await rm(route);
  }
}, 45000);

test("rejects a server output configuration", async () => {
  const config = join(site, "astro.config.mjs");
  const content = await readFile(config, "utf8");
  await writeFile(config, content.replace('output: "static"', 'output: "server"'));
  try {
    await expect(astroBuild(site, frozenInput("unsupported", entry("home", "/")))).rejects.toThrow(
      "PREVIEW_CONFIGURATION_UNAVAILABLE",
    );
  } finally {
    await writeFile(config, content);
  }
}, 45000);

test("the packed starter renders a saved post separately from ordinary published builds", async () => {
  const starter = await workspace.starterSite(site);
  const home = entry("home", "/");
  const publishedPost = entry("post", "/blog/published", "posts", "published");
  const target = entry("post", "/blog/saved", "posts", "saved");
  const input = frozenInput("starter", target, [home, publishedPost]);
  input.target.blocks.push({
    key: "draft-quote",
    position: 0,
    type: "quote",
    schemaVersion: 1,
    settings: {},
    data: { quote: "Saved draft quote rendered by the starter" },
  });
  const api = await servePublished(input.context);
  try {
    const before = await astroBuild(starter, undefined, api.environment);
    const publicPost = "blog/published/index.html";
    const published = await readFile(join(before.output, publicPost), "utf8");
    expect(published).toContain("Published post");
    expect(published).not.toContain("Saved draft");

    const result = await astroBuild(starter, input);
    const packagePreview = await previewPackager(starter);
    const preview = await packagePreview(result.inputFile);
    expect(preview.manifest.html).toBe("blog/saved/index.html");
    expect(
      preview.manifest.files.filter(({ path }) => path.endsWith(".html")).map(({ path }) => path),
    ).toEqual(["blog/saved/index.html"]);
    const saved = await readFile(join(preview.directory, preview.manifest.html), "utf8");
    expect(saved).toContain("Saved draft quote rendered by the starter");
    expect(saved).not.toContain("Published post");
    expect(api.requests).toHaveLength(1);

    const after = await astroBuild(starter, undefined, api.environment);
    expect(await readFile(join(after.output, publicPost), "utf8")).toBe(published);
    expect(
      (await readdir(after.output, { recursive: true }))
        .filter((path) => path.endsWith(".html"))
        .sort(),
    ).toEqual(["blog/published/index.html", "index.html"]);
    expect(api.requests).toEqual(
      Array.from({ length: 2 }, () => ({
        path: "/api/v1/public/build-export",
        tokenAccepted: true,
      })),
    );
  } finally {
    await api.close();
  }
}, 90000);
