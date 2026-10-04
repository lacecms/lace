import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { copyFile, cp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, join } from "node:path";
import { guideFiles } from "./consumer-guides.mjs";
import { assertSecretFree, scanTree } from "./consumer-security.mjs";

// The block files `lace add block --all` must reproduce; everything else in the
// fixture is the operator's own site (layout, styles, link override, config).
const blockFiles = [
  "lace.site.json",
  "src/lace/blocks.ts",
  ...["Cta", "Hero", "Image", "Quote", "RichText"].map(
    (name) => `src/components/lace/${name}Block.astro`,
  ),
];
const heroPath = "src/components/lace/HeroBlock.astro";
const quotePath = "src/components/lace/QuoteBlock.astro";

/** Rich text whose text looks like markup; it must render only as escaped text. */
export const hostileText = '<script>window.laceXss=1</script><img src=x onerror="laceXss()">';
export const safeHref = "https://lace.example/safe-link";
const unsafeHref = "javascript:alert(1)";

/** Bytes of the 1×1 PNG every published media ID serves from the controlled origin. */
const mediaBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5mcAAAAASUVORK5CYII=",
  "base64",
);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function tree(root, prefix = "", skip = "cms") {
  const hashes = {};
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (path === skip) continue;
    if (entry.isDirectory()) Object.assign(hashes, await tree(root, path, skip));
    else hashes[path] = sha256(await readFile(join(root, path)));
  }
  return hashes;
}

/** Runs doctor without failing on its exit code; the site check is inspected alone. */
function doctor(cwd) {
  const result = spawnSync(
    "pnpm",
    ["exec", "lace", "doctor", "--target", "node", "--stage", "ready", "--json"],
    { cwd, encoding: "utf8" },
  );
  return JSON.parse(result.stdout).data.checks.find((check) => check.id === "site");
}

/** Runs the packaged block command; a conflict is an expected non-zero outcome here. */
function addBlocks(cms, stage) {
  console.info(`Acceptance: ${stage}`);
  const result = spawnSync(
    "pnpm",
    ["exec", "lace", "add", "block", "--all", "--site", "..", "--json"],
    { cwd: cms, encoding: "utf8" },
  );
  try {
    return { status: result.status, report: JSON.parse(result.stdout) };
  } catch {
    throw new Error(`${stage}: invalid JSON output\n${result.stdout}${result.stderr}`);
  }
}

/** The controlled published export: the starter fixture plus hostile and safe rich text. */
export function existingSiteExport(exported, href = safeHref) {
  const result = structuredClone(exported);
  result.entries = result.entries.slice(0, 2);
  result.entries[1].path = "/articles/first-post";
  result.entries[1].entry.model.route = "/articles/:slug";
  const richText = result.entries[1].entry.published.blocks.find(
    (block) => block.type === "richText",
  );
  richText.data.content.content.push(
    { type: "paragraph", content: [{ type: "text", text: hostileText }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Safe link", marks: [{ type: "link", attrs: { href } }] },
        { type: "text", text: " and bold", marks: [{ type: "bold" }] },
      ],
    },
  );
  return result;
}

/** Fails unless hostile text is escaped and only the safe link renders. */
export function assertSafeRichText(html) {
  if (html.includes("<script>window.laceXss") || /<img[^>]*onerror/iu.test(html))
    throw new Error("existing-rich-text: hostile text rendered as markup");
  if (!html.includes("&lt;script&gt;window.laceXss=1&lt;/script&gt;"))
    throw new Error("existing-rich-text: hostile text is not shown as escaped text");
  if (!html.includes(`href="${safeHref}"`) || html.includes("javascript:"))
    throw new Error("existing-rich-text: link rendering is not limited to the safe URL");
}

/**
 * Connects an independent Astro site to a CMS generated in its `cms/`
 * directory by following the generated connection guide, installs blocks with
 * the packaged `lace add block`, verifies build-site selection, and builds the
 * parent site through the CMS root build script against a controlled export.
 */
export async function existingSiteJourney(parent, operations) {
  const { generator, installPackedConsumer, run, secretValues, workspace } = operations;
  const fixture = join(workspace, "tests/fixtures/existing-astro-site");
  const root = join(parent, "existing-site");
  await cp(fixture, root, { recursive: true });
  // The operator's site before connection: no Lace blocks, loader or Lace routes.
  const fixtureGuideFiles = [
    "src/lib/lace.ts",
    "src/env.d.ts",
    "src/pages/index.astro",
    "src/pages/articles/[slug].astro",
  ];
  await Promise.all([...blockFiles, ...fixtureGuideFiles].map((path) => rm(join(root, path))));
  const before = await tree(root);

  const cms = join(root, "cms");
  const generated = await run("existing-generate", "node", [
    generator,
    "create",
    cms,
    "--existing-site",
    "..",
  ]);
  if (!generated.includes("pnpm exec lace add block --all --site .."))
    throw new Error("existing-generate: next steps do not name lace add block");
  if (JSON.stringify(await tree(root)) !== JSON.stringify(before))
    throw new Error("existing-generate: the existing site changed during generation");
  const manifest = JSON.parse(await readFile(join(cms, ".lace/manifest.json"), "utf8"));
  if (manifest.site?.mode !== "existing" || manifest.site.path !== "..")
    throw new Error("existing-generate: manifest does not record the existing site");
  if ((await readdir(cms)).includes("site"))
    throw new Error("existing-generate: an example site was generated");

  // Guide steps 3, 4 and 6: the loader, TypeScript declaration and routes.
  console.info("Acceptance: existing-guide-files");
  const guide = guideFiles(await readFile(join(cms, "docs/lace-astro-site.md"), "utf8"));
  if (JSON.stringify([...guide.keys()].sort()) !== JSON.stringify([...fixtureGuideFiles].sort()))
    throw new Error(`existing-guide-files: unexpected guide files ${[...guide.keys()]}`);
  for (const [path, content] of guide) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }

  await installPackedConsumer(cms);

  // Guide step 1: install the Lace site packages into the existing site.
  const packages = join(root, ".acceptance-packages");
  await mkdir(packages);
  const references = new Map();
  for (const file of await readdir(join(cms, ".lace/acceptance-packages"))) {
    await copyFile(join(cms, ".lace/acceptance-packages", file), join(packages, file));
    const name = `@lacecms/${basename(file)
      .replace(/^lacecms-/u, "")
      .replace(/-\d.*\.tgz$/u, "")}`;
    references.set(name, `file:.acceptance-packages/${file}`);
  }
  const sitePackage = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  for (const name of Object.keys(sitePackage.dependencies))
    if (references.has(name)) sitePackage.dependencies[name] = references.get(name);
  await writeFile(join(root, "package.json"), `${JSON.stringify(sitePackage, null, 2)}\n`);
  await writeFile(
    join(root, "pnpm-workspace.yaml"),
    `allowBuilds:\n  esbuild: true\noverrides:\n${[...references]
      .map(([name, file]) => `  '${name}': '${file}'`)
      .join("\n")}\n`,
  );
  await run("existing-site-install", "pnpm", ["install", "--no-frozen-lockfile"], { cwd: root });
  await run("existing-site-frozen", "pnpm", ["install", "--frozen-lockfile", "--offline"], {
    cwd: root,
  });

  // Explicit build-site selection: the Compose builder mounts the parent site.
  await run("existing-env-prepare", "pnpm", ["env:prepare"], { cwd: cms });
  const values = await readFile(join(cms, ".env"), "utf8");
  for (const name of ["LACE_AUTH_SECRET", "LACE_MINIO_ROOT_SECRET", "LACE_BUILDER_SECRET"]) {
    const value = new RegExp(`^${name}=(.+)$`, "mu").exec(values)?.[1];
    if (value) secretValues.add(value);
  }
  const resolved = JSON.parse(
    await run(
      "existing-build-site-selection",
      "docker",
      ["compose", "config", "--format", "json"],
      {
        cwd: cms,
        intentionalReveal: true,
      },
    ),
  );
  const builder = resolved.services?.builder;
  const source = builder?.volumes?.find((volume) => volume.target === "/source");
  if (
    source?.type !== "bind" ||
    source.read_only !== true ||
    (await realpath(source.source).catch(() => "")) !== (await realpath(root)) ||
    builder.environment?.LACE_BUILD_SITE_DIR !== "." ||
    builder.environment?.LACE_BUILD_OUTPUT_DIR !== "dist"
  )
    throw new Error("existing-build-site-selection: builder does not mount the parent site");

  const missing = doctor(cms);
  if (missing?.code !== "SITE_BLOCKS_MISSING" || !missing.nextAction.includes("--site .."))
    throw new Error(`existing-doctor: expected missing blocks, saw ${missing?.code}`);
  const added = addBlocks(cms, "existing-add-blocks");
  if (added.status !== 0 || added.report.code !== "BLOCKS_INSTALLED")
    throw new Error(`existing-add-blocks: unexpected outcome ${added.report.code}`);
  for (const path of blockFiles) {
    const expected = await readFile(join(fixture, path));
    if (!(await readFile(join(root, path))).equals(expected))
      throw new Error(`existing-add-blocks: ${path} differs from the reference block source`);
  }
  const ready = doctor(cms);
  if (ready?.code !== "SITE_READY")
    throw new Error(`existing-doctor: expected a ready site, saw ${ready?.code}`);

  const source0 = JSON.parse(
    await readFile(join(workspace, "apps/site/src/fixtures/published-export.json"), "utf8"),
  );
  const token = `lace_build_${randomBytes(16).toString("hex")}`;
  secretValues.add(token);
  let exported;
  let exportReads = 0;
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/lace/api/v1/public/media/")) {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(mediaBytes);
      return;
    }
    exportReads++;
    if (
      request.url !== "/api/v1/public/build-export" ||
      request.headers.authorization !== `Bearer ${token}`
    ) {
      response.writeHead(403, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "AUTHORIZATION_DENIED", message: "Denied" } }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json", etag: '"7"' });
    response.end(JSON.stringify(exported));
  });
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const publicBase = `${origin}lace/`;
  const build = (stage) =>
    run(stage, "pnpm", ["build"], {
      cwd: cms,
      env: {
        ASTRO_TELEMETRY_DISABLED: "1",
        LACE_API_BASE_URL: origin,
        LACE_BUILD_TOKEN: token,
        LACE_PUBLIC_BASE_URL: publicBase,
      },
    });
  let home;
  let article;
  try {
    // Rendering never emits an unsafe link: the build fails instead.
    exported = existingSiteExport(source0, unsafeHref);
    let refusal = "";
    try {
      await build("existing-unsafe-link-build");
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error);
    }
    if (refusal === "")
      throw new Error("existing-unsafe-link-build: a javascript: link was rendered");
    // The refusal must name the rich-text block, not an unrelated build failure.
    if (!/post-rich-text/u.test(refusal))
      throw new Error(
        `existing-unsafe-link-build: build failed for another reason\n${refusal.slice(-1500)}`,
      );
    const partial = await readdir(join(root, "dist"), { recursive: true }).catch(() => []);
    for (const path of partial.filter((name) => name.endsWith(".html")))
      if ((await readFile(join(root, "dist", path), "utf8")).includes("javascript:"))
        throw new Error("existing-unsafe-link-build: output contains the unsafe link");

    exported = existingSiteExport(source0);
    exportReads = 0;
    await build("existing-build");
    if (exportReads !== 1)
      throw new Error(`existing-build: expected one export read, saw ${exportReads}`);
    home = await readFile(join(root, "dist/index.html"), "utf8");
    article = await readFile(join(root, "dist/articles/first-post/index.html"), "utf8");

    console.info("Acceptance: existing-public-media");
    const images = [...`${home}${article}`.matchAll(/<img\b[^>]*src="([^"]+)"/gu)].map(
      ([, url]) => url,
    );
    if (images.length < 2) throw new Error("existing-public-media: rendered media missing");
    for (const url of images) {
      if (!url.startsWith(`${publicBase}api/v1/public/media/`))
        throw new Error("existing-public-media: media URL is not on the public origin");
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(mediaBytes))
        throw new Error("existing-public-media: media URL did not return the published bytes");
    }
  } finally {
    await new Promise((done) => server.close(done));
  }

  const blocks = (html) => [...html.matchAll(/data-lace-block="([^"]+)"/gu)].map((m) => m[1]);
  if (JSON.stringify(blocks(home)) !== JSON.stringify(["hero", "cta"]))
    throw new Error("existing-build: home blocks differ");
  if (JSON.stringify(blocks(article)) !== JSON.stringify(["richText", "image", "quote"]))
    throw new Error("existing-build: article blocks differ");
  console.info("Acceptance: existing-styling-hooks");
  for (const hook of [
    'data-lace-model="home"',
    'data-lace-model="posts"',
    "data-lace-entry=",
    'data-lace-block-key="post-rich-text"',
    'data-lace-part="content"',
  ])
    if (!`${home}${article}`.includes(hook))
      throw new Error(`existing-styling-hooks: ${hook} missing`);
  assertSafeRichText(article);
  await scanTree(join(root, "dist"), secretValues, "existing-site static output");

  // An operator edit survives a repeat install with an unchanged registry.
  const heroEdited = Buffer.concat([
    await readFile(join(root, heroPath)),
    Buffer.from("<!-- operator edit: keep this hero -->\n"),
  ]);
  await writeFile(join(root, heroPath), heroEdited);
  const repeat = addBlocks(cms, "existing-block-rerun");
  if (repeat.status !== 0 || !(await readFile(join(root, heroPath))).equals(heroEdited))
    throw new Error("existing-block-rerun: an edited component was not preserved");

  // Explicit fixture preparation: record older installed bytes for hero and
  // quote, the state an earlier registry build leaves. The operator's hero
  // edit sits on top of the older bytes; quote is unmodified.
  const lockPath = join(root, "lace.site.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const quoteOld = Buffer.from(
    "---\nconst { block, data } = Astro.props;\n---\n\n<blockquote data-lace-block={block.type}>{data.quote}</blockquote>\n",
  );
  const heroOld = Buffer.from("---\n---\n\n<section>older hero</section>\n");
  const heroOperator = Buffer.concat([heroOld, Buffer.from("<!-- operator edit -->\n")]);
  await writeFile(join(root, quotePath), quoteOld);
  await writeFile(join(root, heroPath), heroOperator);
  lock.items.quote.files[quotePath] = sha256(quoteOld);
  lock.items.hero.files[heroPath] = sha256(heroOld);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  const update = addBlocks(cms, "existing-block-update");
  const status = Object.fromEntries(
    update.report.data.items.map((item) => [item.name, item.status]),
  );
  if (update.status !== 2 || status.hero !== "conflict" || status.quote !== "updated")
    throw new Error(`existing-block-update: unexpected outcome ${JSON.stringify(status)}`);
  if (!(await readFile(join(root, heroPath))).equals(heroOperator))
    throw new Error("existing-block-update: the edited component was overwritten");
  if (!(await readFile(join(root, quotePath))).equals(await readFile(join(fixture, quotePath))))
    throw new Error("existing-block-update: the unmodified component was not updated");
  assertSecretFree(JSON.stringify(update.report), secretValues, "block command output");
  console.info(
    "Existing-site CMS generated without touching the site, connected by the guide, selected as the build site, built with safe rich text, hooks and public media, and kept operator block edits",
  );
}
