import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, join } from "node:path";
import { scanTree } from "./consumer-security.mjs";

// The block files `lace add block --all` must reproduce; everything else in the
// fixture is the operator's own site (loader, routes, layout, styles).
const blockFiles = [
  "lace.site.json",
  "src/lace/blocks.ts",
  ...["Cta", "Hero", "Image", "Quote", "RichText"].map(
    (name) => `src/components/lace/${name}Block.astro`,
  ),
];

async function tree(root, prefix = "", skip = "cms") {
  const hashes = {};
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (path === skip) continue;
    if (entry.isDirectory()) Object.assign(hashes, await tree(root, path, skip));
    else
      hashes[path] = createHash("sha256")
        .update(await readFile(join(root, path)))
        .digest("hex");
  }
  return hashes;
}

/** Runs doctor without failing on its exit code; the site check is inspected alone. */
function doctor(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "lace", "doctor", "--target", "node", "--stage", "ready", "--json"],
      { cwd, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (output += chunk));
    child.once("error", reject);
    child.once("exit", () => {
      try {
        resolve(JSON.parse(output).data.checks.find((check) => check.id === "site"));
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Generates `cms/` inside a copy of the existing-site fixture, installs packed
 * packages, adds blocks with `lace add block --all --site ..` and builds the
 * parent site through the CMS root build script against the published export.
 */
export async function existingSiteJourney(parent, operations) {
  const { installPackedConsumer, run, secretValues, workspace } = operations;
  const root = join(parent, "existing-site");
  await cp(join(workspace, "tests/fixtures/existing-astro-site"), root, { recursive: true });
  await Promise.all(blockFiles.map((path) => rm(join(root, path))));
  const before = await tree(root);

  const cms = join(root, "cms");
  const generated = await run("existing-generate", "node", [
    join(workspace, "packages/create-lace/dist/bin.js"),
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

  await installPackedConsumer(cms);

  // Operator step: install the Lace site packages into the existing site.
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

  const missing = await doctor(cms);
  if (missing?.code !== "SITE_BLOCKS_MISSING" || !missing.nextAction.includes("--site .."))
    throw new Error(`existing-doctor: expected missing blocks, saw ${missing?.code}`);
  await run(
    "existing-add-blocks",
    "pnpm",
    ["exec", "lace", "add", "block", "--all", "--site", ".."],
    {
      cwd: cms,
    },
  );
  for (const path of blockFiles) {
    const expected = await readFile(join(workspace, "tests/fixtures/existing-astro-site", path));
    if (!(await readFile(join(root, path))).equals(expected))
      throw new Error(`existing-add-blocks: ${path} differs from the reference block source`);
  }
  const ready = await doctor(cms);
  if (ready?.code !== "SITE_READY")
    throw new Error(`existing-doctor: expected a ready site, saw ${ready?.code}`);

  const exported = JSON.parse(
    await readFile(join(workspace, "apps/site/src/fixtures/published-export.json"), "utf8"),
  );
  exported.entries = exported.entries.slice(0, 2);
  exported.entries[1].path = "/articles/first-post";
  exported.entries[1].entry.model.route = "/articles/:slug";
  const token = `lace_build_${randomBytes(16).toString("hex")}`;
  secretValues.add(token);
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
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
  try {
    await run("existing-build", "pnpm", ["build"], {
      cwd: cms,
      env: {
        ASTRO_TELEMETRY_DISABLED: "1",
        LACE_API_BASE_URL: `http://127.0.0.1:${server.address().port}/`,
        LACE_BUILD_TOKEN: token,
        LACE_PUBLIC_BASE_URL: "https://public.example/lace/",
      },
    });
  } finally {
    await new Promise((done) => server.close(done));
  }
  if (requests !== 1) throw new Error(`existing-build: expected one export read, saw ${requests}`);
  const home = await readFile(join(root, "dist/index.html"), "utf8");
  const article = await readFile(join(root, "dist/articles/first-post/index.html"), "utf8");
  const blocks = (html) => [...html.matchAll(/data-lace-block="([^"]+)"/gu)].map((m) => m[1]);
  if (JSON.stringify(blocks(home)) !== JSON.stringify(["hero", "cta"]))
    throw new Error("existing-build: home blocks differ");
  if (JSON.stringify(blocks(article)) !== JSON.stringify(["richText", "image", "quote"]))
    throw new Error("existing-build: article blocks differ");
  if (!home.includes("https://public.example/lace/api/v1/public/media/hero-media"))
    throw new Error("existing-build: public media origin missing");
  await scanTree(join(root, "dist"), secretValues, "existing-site static output");
  console.info(
    "Existing-site CMS generated without touching the site, added blocks and built the parent site",
  );
}
