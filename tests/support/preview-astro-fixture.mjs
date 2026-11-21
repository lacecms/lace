import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const workspace = fileURLToPath(new URL("../../", import.meta.url));
const simpleSite = join(workspace, "tests/fixtures/preview-astro-site");
const siteRequire = createRequire(join(workspace, "apps/site/package.json"));
export const sharp = siteRequire("sharp");
const adminRequire = createRequire(join(workspace, "apps/admin/package.json"));
const font = join(
  dirname(adminRequire.resolve("@fontsource-variable/inter/package.json")),
  "files/inter-latin-wght-normal.woff2",
);
const packageNames = ["astro", "content", "contracts", "domain", "render", "sdk"];

export const timestamp = "2026-11-17T12:00:00.000Z";
export const entry = (id, path, modelKey = id, slug) => ({
  id,
  modelKey,
  path,
  title: `Published ${id}`,
  ...(slug === undefined ? {} : { slug }),
  fields: {},
  internalLinks: [],
  blocks: [],
  publishedAt: timestamp,
});

export function frozenInput(generationId, { publishedAt: _publishedAt, ...target }, entries = []) {
  return {
    schemaVersion: 1,
    generationId,
    revision: 3,
    capturedAt: timestamp,
    siteUrl: "https://published.example/journal/",
    target: { ...target, title: "Saved draft title" },
    targetMedia: {},
    context: {
      formatVersion: 2,
      version: 4,
      seo: { models: {}, defaults: null },
      entries,
      media: {},
      globals: [],
      records: [],
    },
  };
}

export async function previewWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "lace-astro-preview-"));
  const packs = join(root, "packs");
  const cleanup = () => rm(root, { recursive: true, force: true });
  try {
    await mkdir(packs);
    const tarballs = new Map(
      await Promise.all(
        [...packageNames, "create-lace"].map(async (name) => {
          const { stdout } = await exec("pnpm", ["pack", "--pack-destination", packs, "--json"], {
            cwd: join(workspace, "packages", name),
          });
          const { filename } = JSON.parse(stdout);
          return [name === "create-lace" ? name : `@lacecms/${name}`, filename];
        }),
      ),
    );
    return {
      root,
      cleanup,
      async existingSite() {
        const site = join(root, "existing");
        await cp(simpleSite, site, { recursive: true });
        await cp(font, join(site, "src/assets/notebook.woff2"));
        await install(site, tarballs);
        return site;
      },
      async containerSite() {
        const site = join(root, "container-site");
        await cp(simpleSite, site, { recursive: true });
        await cp(font, join(site, "src/assets/notebook.woff2"));
        await writeFile(join(site, "src/pages/about.astro"), "<h1>Published about</h1>\n");
        const home = join(site, "src/pages/index.astro");
        await writeFile(
          home,
          (await readFile(home, "utf8")).replace("---\n", '---\nimport "../assets/notes.css";\n'),
        );
        await mkdir(join(site, "vendor"));
        const dependencies = {};
        for (const name of packageNames) {
          await cp(tarballs.get(`@lacecms/${name}`), join(site, `vendor/${name}.tgz`));
          dependencies[`@lacecms/${name}`] = `file:./vendor/${name}.tgz`;
        }
        const manifestPath = join(site, "package.json");
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        manifest.dependencies["@lacecms/astro"] = dependencies["@lacecms/astro"];
        await writeFile(manifestPath, JSON.stringify(manifest));
        await writeFile(
          join(site, "pnpm-workspace.yaml"),
          [
            "minimumReleaseAge: 0",
            "overrides:",
            ...Object.entries(dependencies).map(([name, path]) => `  '${name}': '${path}'`),
            "",
          ].join("\n"),
        );
        await exec("pnpm", ["install", "--lockfile-only"], { cwd: site, timeout: 60000 });
        await writeFile(join(site, ".gitignore"), "node_modules/\ndist/\n.astro/\n");
        await exec("git", ["init", "--quiet"], { cwd: site });
        await exec("git", ["add", "."], { cwd: site });
        await exec(
          "git",
          [
            "-c",
            "user.name=Lace",
            "-c",
            "user.email=lace@example.test",
            "commit",
            "-qm",
            "Preview site",
          ],
          { cwd: site },
        );
        return site;
      },
      async starterSite(existing) {
        const generator = join(existing, "node_modules/create-lace/dist/index.js");
        const { generateProject } = await import(pathToFileURL(generator));
        const result = await generateProject({ target: join(root, "starter") });
        const site = join(result.path, "site");
        await install(site, tarballs);
        return site;
      },
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function install(site, tarballs) {
  const modules = join(site, "node_modules");
  await Promise.all(
    [...tarballs].map(async ([name, archive]) => {
      const directory = join(modules, name);
      await mkdir(directory, { recursive: true });
      await exec("tar", ["-xf", archive, "--strip-components=1", "-C", directory]);
    }),
  );
  // Reuse the lockfile's third-party installations. All Lace imports resolve
  // inside the consumer to files extracted from the actual package archives.
  const externals = new Map([
    ["astro", "apps/site"],
    ["sharp", "apps/site"],
  ]);
  for (const [name] of tarballs) {
    const directory = join("packages", name.replace("@lacecms/", ""));
    const manifest = JSON.parse(await readFile(join(modules, name, "package.json"), "utf8"));
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (!tarballs.has(dependency)) externals.set(dependency, directory);
    }
  }
  for (const [name, source] of externals)
    await symlink(join(workspace, source, "node_modules", name), join(modules, name));
}

export async function astroBuild(site, input, environment = {}, originals = {}) {
  const { LACE_PREVIEW_INPUT_FILE: _preview, NODE_OPTIONS: _options, ...env } = process.env;
  let inputFile;
  if (input !== undefined) {
    const modules = pathToFileURL(join(site, "node_modules") + "/");
    const { createPreviewInputClient } = await import(
      new URL("@lacecms/sdk/dist/preview.js", modules)
    );
    const { stageAstroPreviewInput } = await import(
      new URL("@lacecms/astro/dist/preview.js", modules)
    );
    const client = createPreviewInputClient({
      apiBaseUrl: "https://private-runner.invalid",
      generationId: input.generationId,
      claim: "fixture-serialized-claim-secret",
      async fetch(url) {
        const mediaId = url.searchParams.get("mediaId");
        if (mediaId === null) return Response.json(input);
        const original = originals[mediaId];
        return original
          ? new Response(original, { headers: { "content-type": "image/png" } })
          : new Response(null, { status: 404 });
      },
    });
    inputFile = await stageAstroPreviewInput(
      join(dirname(site), `generation-${input.generationId}`),
      client,
    );
  }
  const result = await exec(
    process.execPath,
    [join(site, "node_modules/astro/bin/astro.mjs"), "build"],
    {
      cwd: site,
      env: {
        ...env,
        ASTRO_TELEMETRY_DISABLED: "1",
        ...environment,
        ...(inputFile === undefined ? {} : { LACE_PREVIEW_INPUT_FILE: inputFile }),
      },
      timeout: 45000,
    },
  );
  return {
    ...result,
    inputFile,
    output: inputFile === undefined ? join(site, "dist") : join(dirname(inputFile), "render"),
  };
}

export async function previewPackager(site) {
  const module = await import(
    pathToFileURL(join(site, "node_modules/@lacecms/astro/dist/preview.js"))
  );
  return module.packageAstroPreview;
}
