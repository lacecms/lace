import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { parseAddBlockArguments, runAddBlockCommand } from "../dist/blocks-command.js";
import { bundledRegistryPath, loadRegistry } from "../dist/blocks-registry.js";

const bin = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const generator = fileURLToPath(new URL("../../create-lace/dist/bin.js", import.meta.url));
const workspace = fileURLToPath(new URL("../../../", import.meta.url));
const starterSite = join(workspace, "packages/create-lace/templates/site");
const builtIns = ["cta", "hero", "image", "quote", "richText"];
const integrationTimeout = 60_000;
const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function tempRoot() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "lace-blocks-")));
  roots.push(root);
  return root;
}

/** An Astro site with no Lace files. */
async function astroSite(root, name = "site") {
  const site = join(root, name);
  await mkdir(site, { recursive: true });
  await writeFile(join(site, "astro.config.mjs"), "export default {};\n");
  await writeFile(
    join(site, "package.json"),
    JSON.stringify({ name: "s", dependencies: { astro: "7.3.1" } }),
  );
  return site;
}

async function installPackages(site, version = "0.1.0-alpha.2") {
  for (const name of ["astro", "render"]) {
    const directory = join(site, "node_modules/@lacecms", name);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ name: `@lacecms/${name}`, version }),
    );
  }
}

async function tree(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = {};
  for (const entry of entries
    .filter((item) => item.isFile())
    .sort((a, b) => `${a.parentPath}/${a.name}`.localeCompare(`${b.parentPath}/${b.name}`)))
    files[join(entry.parentPath, entry.name).slice(root.length + 1)] = sha256(
      await readFile(join(entry.parentPath, entry.name)),
    );
  return files;
}

async function run(cwd, argv, registry) {
  const result = await runAddBlockCommand([...argv, "--json"], { cwd, registry });
  return { ...JSON.parse(result.output), exitCode: result.exitCode };
}

/** A copy of the bundled registry with an edited item, loaded as a newer CLI release would. */
async function newerRegistry(root, edit) {
  const directory = join(root, "registry");
  await cp(bundledRegistryPath(), directory, { recursive: true });
  await edit(directory);
  return loadRegistry(pathToFileURL(`${directory}/`));
}

async function bumpHero(directory, source = "<p>hero revision 2</p>\n") {
  const manifestPath = join(directory, "astro/hero/item.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await writeFile(manifestPath, JSON.stringify({ ...manifest, revision: 2 }, null, 2));
  await writeFile(join(directory, "astro/hero/HeroBlock.astro"), source);
}

describe("argument parsing", () => {
  test("accepts types or --all with options and rejects invalid combinations", () => {
    expect(parseAddBlockArguments(["hero", "cta", "--site", "web", "--dry-run"])).toMatchObject({
      types: ["hero", "cta"],
      site: "web",
      dryRun: true,
      all: false,
    });
    expect(parseAddBlockArguments(["--all"])).toMatchObject({ all: true, site: "site" });
    for (const argv of [
      [],
      ["--all", "hero"],
      ["hero", "--json", "--json"],
      ["hero", "--site"],
      ["hero", "--force"],
      ["../x"],
    ])
      expect(() => parseAddBlockArguments(argv), argv.join(" ")).toThrow(/Usage: lace add block/u);
  });
});

describe("installation into an independent Astro site", () => {
  test("a fresh add reproduces the committed starter block files", async () => {
    const root = await tempRoot();
    const site = await astroSite(root);
    await installPackages(site);
    const result = await run(root, builtIns);
    expect(result).toMatchObject({ ok: true, code: "BLOCKS_INSTALLED", exitCode: 0 });
    expect(result.data.items.map((item) => item.status)).toEqual(Array(5).fill("added"));
    expect(result.data.packages.command).toBeNull();
    for (const path of [
      "lace.site.json",
      "src/lace/blocks.ts",
      ...builtIns.map(
        (type) => `src/components/lace/${type[0].toUpperCase()}${type.slice(1)}Block.astro`,
      ),
    ])
      expect(
        (await readFile(join(site, path))).equals(await readFile(join(starterSite, path))),
        path,
      ).toBe(true);
    expect((await stat(join(site, "src/components/lace/HeroBlock.astro"))).mode & 0o777).toBe(
      0o644,
    );
    const before = await tree(site);
    const again = await run(root, builtIns);
    expect(again).toMatchObject({ ok: true, code: "BLOCKS_CURRENT", exitCode: 0 });
    expect(again.data.written).toEqual([]);
    expect(await tree(site)).toEqual(before);
  });

  test("a partial add maps only installed blocks and later adds extend the map", async () => {
    const root = await tempRoot();
    const site = await astroSite(root);
    await run(root, ["hero"]);
    expect(await readFile(join(site, "src/lace/blocks.ts"), "utf8")).not.toContain("CtaBlock");
    await run(root, ["cta"]);
    const map = await readFile(join(site, "src/lace/blocks.ts"), "utf8");
    expect(map).toContain("cta: { definition: builtInBlocks.cta, component: CtaBlock },");
    expect(map).toContain("hero: { definition: builtInBlocks.hero, component: HeroBlock },");
    const lock = JSON.parse(await readFile(join(site, "lace.site.json"), "utf8"));
    expect(Object.keys(lock.items)).toEqual(["cta", "hero"]);
    expect(lock.blockMapSha256).toBe(sha256(await readFile(join(site, "src/lace/blocks.ts"))));
  });

  test("dependencies are installed with the requested item", async () => {
    const root = await tempRoot();
    const site = await astroSite(root);
    const registry = await newerRegistry(root, async (directory) => {
      const path = join(directory, "astro/hero/item.json");
      const manifest = JSON.parse(await readFile(path, "utf8"));
      await writeFile(path, JSON.stringify({ ...manifest, dependencies: ["image"] }));
    });
    const result = await run(root, ["hero"], registry);
    expect(result.data.items.map((item) => item.name)).toEqual(["hero", "image"]);
    await stat(join(site, "src/components/lace/ImageBlock.astro"));
  });

  test("a dry run reports additions and writes nothing", async () => {
    const root = await tempRoot();
    const site = await astroSite(root);
    const before = await tree(site);
    const result = await run(root, ["hero", "--dry-run"]);
    expect(result).toMatchObject({ ok: true, code: "BLOCKS_PLAN", exitCode: 0 });
    expect(result.data.files[0]).toMatchObject({
      action: "add",
      path: "src/components/lace/HeroBlock.astro",
    });
    expect(result.data.blockMap.action).toBe("add");
    expect(result.data.lock.action).toBe("add");
    expect(await tree(site)).toEqual(before);
  });

  test("missing or incompatible packages print the exact pnpm command without editing package.json", async () => {
    const root = await tempRoot();
    const site = await astroSite(root, "web");
    await installPackages(site, "0.0.1");
    const packageJson = await readFile(join(site, "package.json"));
    const result = await run(root, ["quote", "--site", "web"]);
    expect(result.ok).toBe(true);
    expect(result.data.packages.missing).toEqual([
      { name: "@lacecms/astro", range: "0.1.0-alpha.2", installed: "0.0.1" },
      { name: "@lacecms/render", range: "0.1.0-alpha.2", installed: "0.0.1" },
    ]);
    expect(result.data.packages.command).toBe(
      "pnpm --dir web add @lacecms/astro@0.1.0-alpha.2 @lacecms/render@0.1.0-alpha.2",
    );
    expect((await readFile(join(site, "package.json"))).equals(packageJson)).toBe(true);
    await stat(join(site, "src/components/lace/QuoteBlock.astro"));
  });
});

describe("updates and conflicts", () => {
  test("an unmodified file is updated to a newer revision", async () => {
    const root = await tempRoot();
    const site = await astroSite(root);
    await run(root, builtIns);
    const registry = await newerRegistry(root, (directory) => bumpHero(directory));
    const result = await run(root, ["hero"], registry);
    expect(result).toMatchObject({ ok: true, code: "BLOCKS_INSTALLED" });
    expect(result.data.items).toEqual([
      expect.objectContaining({ name: "hero", status: "updated", revision: 2 }),
    ]);
    expect(result.data.blockMap.action).toBe("current");
    expect(await readFile(join(site, "src/components/lace/HeroBlock.astro"), "utf8")).toBe(
      "<p>hero revision 2</p>\n",
    );
    const lock = JSON.parse(await readFile(join(site, "lace.site.json"), "utf8"));
    expect(lock.items.hero).toEqual({
      revision: 2,
      files: {
        "src/components/lace/HeroBlock.astro": sha256(Buffer.from("<p>hero revision 2</p>\n")),
      },
    });
  });

  test("a file dropped by a newer revision is removed when unmodified", async () => {
    const root = await tempRoot();
    const site = await astroSite(root);
    await run(root, ["hero"]);
    const registry = await newerRegistry(root, async (directory) => {
      const path = join(directory, "astro/hero/item.json");
      const manifest = JSON.parse(await readFile(path, "utf8"));
      manifest.revision = 2;
      manifest.files = [{ source: "HeroBlock.astro", target: "Hero.astro", role: "component" }];
      await writeFile(path, JSON.stringify(manifest));
    });
    const result = await run(root, ["hero"], registry);
    expect(result.data.files.map((file) => [file.path, file.action])).toEqual([
      ["src/components/lace/Hero.astro", "add"],
      ["src/components/lace/HeroBlock.astro", "remove"],
    ]);
    await expect(stat(join(site, "src/components/lace/HeroBlock.astro"))).rejects.toThrow();
    expect(await readFile(join(site, "src/lace/blocks.ts"), "utf8")).toContain(
      'import Hero from "../components/lace/Hero.astro";',
    );
  });

  test("local edits are preserved while the registry is unchanged and a deleted file is restored", async () => {
    const root = await tempRoot();
    const site = await astroSite(root);
    await run(root, ["hero", "cta"]);
    await writeFile(join(site, "src/components/lace/HeroBlock.astro"), "<p>mine</p>\n");
    await rm(join(site, "src/components/lace/CtaBlock.astro"));
    const result = await run(root, ["hero", "cta"]);
    expect(result.ok).toBe(true);
    expect(
      Object.fromEntries(result.data.files.map((file) => [file.item, [file.action, file.reason]])),
    ).toEqual({
      cta: ["add", "restored-missing-file"],
      hero: ["preserve", "template-unchanged-local-edit"],
    });
    expect(await readFile(join(site, "src/components/lace/HeroBlock.astro"), "utf8")).toBe(
      "<p>mine</p>\n",
    );
    await stat(join(site, "src/components/lace/CtaBlock.astro"));
  });

  test("an edited component with a newer revision is a conflict and --write-new offers the registry bytes", async () => {
    const root = await tempRoot();
    const site = await astroSite(root);
    await run(root, builtIns);
    await writeFile(join(site, "src/components/lace/HeroBlock.astro"), "<p>mine</p>\n");
    const lockBefore = await readFile(join(site, "lace.site.json"));
    const registry = await newerRegistry(root, (directory) => bumpHero(directory));
    const result = await run(root, ["hero", "--write-new"], registry);
    expect(result).toMatchObject({ ok: false, code: "BLOCKS_CONFLICTS", exitCode: 2 });
    expect(result.data.items[0]).toMatchObject({ name: "hero", status: "conflict" });
    expect(result.data.files[0]).toMatchObject({
      action: "conflict",
      reason: "managed-file-modified",
    });
    expect(result.data.files[0].diff).toContain("+<p>hero revision 2</p>");
    expect(result.reason).toMatch(/conflict/u);
    expect(await readFile(join(site, "src/components/lace/HeroBlock.astro"), "utf8")).toBe(
      "<p>mine</p>\n",
    );
    expect(await readFile(join(site, "src/components/lace/HeroBlock.astro.new"), "utf8")).toBe(
      "<p>hero revision 2</p>\n",
    );
    expect((await readFile(join(site, "lace.site.json"))).equals(lockBefore)).toBe(true);
  });

  test("identical untracked files left by an interrupted run are adopted", async () => {
    const root = await tempRoot();
    const site = await astroSite(root);
    await mkdir(join(site, "src/components/lace"), { recursive: true });
    await cp(
      join(starterSite, "src/components/lace/HeroBlock.astro"),
      join(site, "src/components/lace/HeroBlock.astro"),
    );
    const result = await run(root, ["hero"]);
    expect(result.ok).toBe(true);
    expect(result.data.files[0]).toMatchObject({ action: "current", reason: "matches-target" });
    expect(result.data.items[0].status).toBe("added");
    const lock = JSON.parse(await readFile(join(site, "lace.site.json"), "utf8"));
    expect(Object.keys(lock.items)).toEqual(["hero"]);
  });

  test("an untracked differing file at an install path is a conflict", async () => {
    const root = await tempRoot();
    const site = await astroSite(root);
    await mkdir(join(site, "src/components/lace"), { recursive: true });
    await writeFile(join(site, "src/components/lace/HeroBlock.astro"), "<p>own hero</p>\n");
    const result = await run(root, ["hero"]);
    expect(result).toMatchObject({ code: "BLOCKS_CONFLICTS", exitCode: 2 });
    expect(result.data.files[0].reason).toBe("untracked-path-exists");
    expect(await readFile(join(site, "src/components/lace/HeroBlock.astro"), "utf8")).toBe(
      "<p>own hero</p>\n",
    );
  });

  test("an edited map is never rewritten and the output names the lines to add", async () => {
    const root = await tempRoot();
    const site = await astroSite(root);
    await run(root, ["hero"]);
    const map = join(site, "src/lace/blocks.ts");
    const edited = (await readFile(map, "utf8")).replace("// Generated by Lace.", "// Edited.");
    await writeFile(map, edited);
    const result = await run(root, ["quote", "--write-new"]);
    expect(result).toMatchObject({ code: "BLOCKS_CONFLICTS", exitCode: 2 });
    expect(result.data.items[0]).toMatchObject({ name: "quote", status: "added" });
    expect(result.data.blockMap.entriesToAdd).toEqual([
      'import QuoteBlock from "../components/lace/QuoteBlock.astro";',
      "quote: { definition: builtInBlocks.quote, component: QuoteBlock },",
    ]);
    expect(await readFile(map, "utf8")).toBe(edited);
    expect(await readFile(`${map}.new`, "utf8")).toContain("QuoteBlock");
    const lock = JSON.parse(await readFile(join(site, "lace.site.json"), "utf8"));
    expect(Object.keys(lock.items)).toEqual(["hero", "quote"]);
    expect(lock.blockMapSha256).not.toBe(sha256(Buffer.from(edited)));
  });
});

describe("site and framework validation", () => {
  test("missing site, missing Astro config, reserved framework and escaping paths fail before writing", async () => {
    const root = await tempRoot();
    await expect(runAddBlockCommand(["hero"], { cwd: root })).rejects.toMatchObject({
      code: "BLOCK_INPUT",
    });
    await mkdir(join(root, "plain"));
    await expect(runAddBlockCommand(["hero", "--site", "plain"], { cwd: root })).rejects.toThrow(
      /no astro\.config\.\* was found/u,
    );
    const react = join(root, "react");
    await mkdir(react);
    await writeFile(join(react, "package.json"), JSON.stringify({ dependencies: { react: "19" } }));
    await expect(
      runAddBlockCommand(["hero", "--site", "react"], { cwd: root }),
    ).rejects.toMatchObject({
      code: "BLOCK_FRAMEWORK",
      message: expect.stringMatching(/not supported yet/u),
    });
    const site = await astroSite(root);
    await expect(runAddBlockCommand(["hero", "--framework", "vue"], { cwd: root })).rejects.toThrow(
      /not supported yet/u,
    );
    await writeFile(
      join(site, "lace.site.json"),
      JSON.stringify({
        schemaVersion: 1,
        framework: "astro",
        componentsDir: "../shared",
        blockMap: "src/lace/blocks.ts",
        blockMapSha256: null,
        items: {},
      }),
    );
    await expect(runAddBlockCommand(["hero"], { cwd: root })).rejects.toThrow(
      /inside the site root/u,
    );
    await expect(stat(join(root, "shared"))).rejects.toThrow();
  });

  test("symbolic links inside written paths are rejected", async () => {
    const root = await tempRoot();
    const site = await astroSite(root);
    await mkdir(join(root, "elsewhere"));
    await mkdir(join(site, "src"), { recursive: true });
    await symlink(join(root, "elsewhere"), join(site, "src/components"));
    await expect(runAddBlockCommand(["hero"], { cwd: root })).rejects.toMatchObject({
      code: "BLOCK_INPUT",
    });
    expect(await readdir(join(root, "elsewhere"))).toEqual([]);
  });

  test("unknown block types list the available types", async () => {
    const root = await tempRoot();
    await astroSite(root);
    await expect(runAddBlockCommand(["gallery"], { cwd: root })).rejects.toMatchObject({
      code: "BLOCK_USAGE",
      message: expect.stringContaining("Available: cta, hero, image, quote, richText."),
    });
  });
});

describe("configured projects", () => {
  async function project(root, config, definitions) {
    await symlink(join(workspace, "node_modules"), join(root, "node_modules"));
    const site = await astroSite(root);
    if (definitions !== undefined) await writeFile(join(root, "lace.blocks.ts"), definitions);
    await writeFile(join(root, "lace.config.ts"), config);
    return site;
  }
  const faq = `import { defineBlock, field } from "@lacecms/content";
export const faq = defineBlock({
  type: "faq",
  version: 1,
  fields: { question: field.text({ required: true }), answer: field.richText() },
});
`;
  const configWith = (
    blocks,
    imports = "",
  ) => `import { defineConfig, definePage } from "@lacecms/config";
import { builtInBlocks, defineBlock, field } from "@lacecms/content";
${imports}
export default await defineConfig({
  blocks: [${blocks}],
  content: [definePage({ key: "home", version: 1, label: "Home", path: "/", blocks: [] })],
});
`;

  test("block definition version mismatches block the item", async () => {
    const root = await tempRoot();
    const site = await project(
      root,
      configWith(
        'builtInBlocks.hero, defineBlock({ type: "quote", version: 2, fields: { text: field.text() } })',
      ),
    );
    const result = await run(root, ["--all"]);
    expect(result).toMatchObject({ ok: false, code: "BLOCKS_CONFLICTS", exitCode: 2 });
    expect(result.data.versionMismatches).toEqual([
      { blockType: "quote", registryVersion: 1, configVersion: 2 },
    ]);
    expect(Object.fromEntries(result.data.items.map((item) => [item.name, item.status]))).toEqual({
      hero: "added",
      quote: "blocked",
    });
    await expect(stat(join(site, "src/components/lace/QuoteBlock.astro"))).rejects.toThrow();
  });

  test("--all scaffolds custom blocks from the recorded definitions module", async () => {
    const root = await tempRoot();
    const site = await project(
      root,
      configWith("builtInBlocks.hero, faq", 'import { faq } from "./lace.blocks.ts";'),
      faq,
    );
    const missing = await run(root, ["--all"]);
    expect(missing.ok).toBe(true);
    expect(missing.data.missingRenderers).toEqual([
      {
        blockType: "faq",
        reason: expect.stringContaining('as "definitions" in site/lace.site.json'),
      },
    ]);
    await expect(run(root, ["faq"])).rejects.toMatchObject({ code: "BLOCK_CONFIG" });
    const lock = JSON.parse(await readFile(join(site, "lace.site.json"), "utf8"));
    await writeFile(
      join(site, "lace.site.json"),
      JSON.stringify({ ...lock, definitions: "../lace.blocks.ts" }),
    );
    const result = await run(root, ["--all"]);
    expect(result).toMatchObject({ ok: true, code: "BLOCKS_INSTALLED" });
    expect(result.data.items.find((item) => item.name === "faq")).toMatchObject({
      kind: "custom",
      status: "scaffolded",
    });
    const component = await readFile(join(site, "src/components/lace/FaqBlock.astro"), "utf8");
    expect(component).toContain('import type * as definitions from "../../../../lace.blocks";');
    expect(component).toContain('<p data-lace-part="question">{data.question}</p>');
    const map = await readFile(join(site, "src/lace/blocks.ts"), "utf8");
    expect(map).toContain('import * as definitions from "../../../lace.blocks";');
    expect(map).toContain("faq: { definition: definitions.faq, component: FaqBlock },");
    const saved = JSON.parse(await readFile(join(site, "lace.site.json"), "utf8"));
    expect(saved.customBlocks).toEqual({
      faq: { files: { "src/components/lace/FaqBlock.astro": sha256(Buffer.from(component)) } },
    });
    await writeFile(join(site, "src/components/lace/FaqBlock.astro"), "<p>edited faq</p>\n");
    const again = await run(root, ["faq"]);
    expect(again).toMatchObject({ ok: true, code: "BLOCKS_CURRENT" });
    expect(await readFile(join(site, "src/components/lace/FaqBlock.astro"), "utf8")).toBe(
      "<p>edited faq</p>\n",
    );
  });

  test(
    "--all in a generated project reports every starter block current and writes nothing",
    async () => {
      const root = await tempRoot();
      const project = join(root, "project");
      const generated = spawnSync(process.execPath, [generator, "project"], {
        cwd: root,
        encoding: "utf8",
      });
      expect(generated.status, generated.stderr).toBe(0);
      await symlink(join(workspace, "node_modules"), join(project, "node_modules"));
      const before = await tree(join(project, "site"));
      const result = spawnSync(process.execPath, [bin, "add", "block", "--all", "--json"], {
        cwd: project,
        encoding: "utf8",
      });
      expect(result.status, result.stdout).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output).toMatchObject({ ok: true, code: "BLOCKS_CURRENT" });
      expect(output.data.configChecked).toBe(true);
      expect(output.data.items.map((item) => [item.name, item.status])).toEqual(
        builtIns.map((name) => [name, "current"]),
      );
      expect(await tree(join(project, "site"))).toEqual(before);
    },
    integrationTimeout,
  );
});

describe("CLI process", () => {
  test("usage errors, help and JSON conflict output use stable codes and exit codes", async () => {
    const root = await tempRoot();
    const site = await astroSite(root);
    const help = spawnSync(process.execPath, [bin, "add", "block", "--help"], { encoding: "utf8" });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("Usage: lace add block");
    const usage = spawnSync(process.execPath, [bin, "add", "block", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(usage.status).toBe(3);
    expect(JSON.parse(usage.stdout)).toMatchObject({
      ok: false,
      code: "BLOCK_USAGE",
      operation: "add block",
    });
    await mkdir(join(site, "src/components/lace"), { recursive: true });
    await writeFile(join(site, "src/components/lace/HeroBlock.astro"), "<p>own</p>\n");
    const conflict = spawnSync(process.execPath, [bin, "add", "block", "hero", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(conflict.status).toBe(2);
    const parsed = JSON.parse(conflict.stdout);
    expect(parsed).toMatchObject({ ok: false, code: "BLOCKS_CONFLICTS" });
    expect(parsed.data.files[0].diff).toContain("-<p>own</p>");
    const text = spawnSync(process.execPath, [bin, "add", "block", "hero"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(text.status).toBe(2);
    expect(text.stdout).toContain(
      "conflict src/components/lace/HeroBlock.astro: untracked-path-exists",
    );
    expect(text.stdout).toContain("Recovery:");
    await astroSite(root, "fresh");
    const framework = spawnSync(
      process.execPath,
      [bin, "add", "block", "hero", "--site", "fresh", "--framework", "svelte"],
      { cwd: root, encoding: "utf8" },
    );
    expect(framework.status).toBe(4);
    expect(framework.stderr).toContain('Framework "svelte" is not supported yet');
    const mismatch = spawnSync(
      process.execPath,
      [bin, "add", "block", "hero", "--framework", "svelte"],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
    expect(mismatch.status).toBe(3);
    expect(mismatch.stderr).toContain("differs from framework");
  });
});
