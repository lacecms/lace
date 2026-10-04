import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import {
  generateProject,
  normalizeSitePath,
  renderCloudflareMarkers,
  renderForSite,
  renderSiteMarkers,
  runCli,
  TEMPLATE_FILES,
} from "../dist/index.js";

const templates = fileURLToPath(new URL("../templates/", import.meta.url));
const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root() {
  const path = await mkdtemp(join(tmpdir(), "lace-site-modes-"));
  roots.push(path);
  return path;
}

/** A minimal standalone Astro project, used as the parent of a `cms/` target. */
async function astroSite(directory = undefined) {
  const site = directory ?? (await root());
  await mkdir(join(site, "src/pages"), { recursive: true });
  await writeFile(join(site, "astro.config.mjs"), "export default {};\n");
  await writeFile(
    join(site, "package.json"),
    `${JSON.stringify({ name: "existing", private: true, dependencies: { astro: "7.3.1" } })}\n`,
  );
  await writeFile(join(site, "src/pages/index.astro"), "<h1>Existing</h1>\n");
  return site;
}

async function listFiles(path, prefix = "") {
  const files = [];
  for (const entry of await readdir(join(path, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(path, relative)));
    else files.push(relative);
  }
  return files.sort();
}

async function treeHashes(path, skip = new Set()) {
  const hashes = {};
  for (const file of await listFiles(path)) {
    if ([...skip].some((prefix) => file === prefix || file.startsWith(`${prefix}/`))) continue;
    const absolute = join(path, file);
    const bytes = (await lstat(absolute)).isSymbolicLink()
      ? `link:${await readlink(absolute)}`
      : await readFile(absolute);
    hashes[file] = createHash("sha256").update(bytes).digest("hex");
  }
  return hashes;
}

function cli(args, cwd, terminal = { interactive: false }) {
  const out = [];
  const err = [];
  return runCli(
    args,
    cwd,
    { write: (value) => out.push(value) },
    { write: (value) => err.push(value) },
    terminal,
  ).then((code) => ({ code, stdout: out.join(""), stderr: err.join("") }));
}

const input = (...lines) => Readable.from(lines.map((line) => `${line}\n`));

test.each([
  [["create", "cms", "--starter", "--no-site"]],
  [["create", "cms", "--no-site", "--existing-site", ".."]],
  [["create", "cms", "--existing-site", "..", "--starter"]],
  [["create", "cms", "--existing-site"]],
  [["create", "cms", "--existing-site", "--no-site"]],
  [["cms", "--starter", "--starter"]],
  [["cms", "--site", "starter"]],
])("site-mode usage errors exit 2 before writing: %j", async (args) => {
  const parent = await root();
  const result = await cli(args, parent);
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("--existing-site <path>");
  expect(await readdir(parent)).toEqual([]);
});

test.each([
  [["create", "cms", "--starter"], "starter", "site"],
  [["cms", "--starter", "--cloudflare"], "starter", "site"],
  [["cms", "--existing-site", ".."], "existing", ".."],
  [["create", "cms", "--cloudflare", "--existing-site", "../"], "existing", ".."],
  [["create", "cms", "--no-site"], "none", null],
  [["create", "cms", "--no-site", "--cloudflare"], "none", null],
])("explicit site-mode flags select the mode: %j", async (args, mode, path) => {
  const parent = await astroSite();
  const before = await treeHashes(parent);
  const result = await cli(args, parent, { interactive: true, input: input() });
  expect(result).toMatchObject({ code: 0, stderr: "" });
  expect(result.stdout).not.toContain("Site mode (");
  const manifest = JSON.parse(await readFile(join(parent, "cms/.lace/manifest.json"), "utf8"));
  expect(manifest.site).toEqual({ mode, path });
  expect(Object.keys(manifest)).toEqual(["schemaVersion", "templateVersion", "site", "files"]);
  expect(Object.keys(manifest.files).some((file) => file.startsWith("site/"))).toBe(
    mode === "starter",
  );
  // Nothing outside the generated target changes in any mode.
  expect(await treeHashes(parent, new Set(["cms"]))).toEqual(before);
});

test("init . accepts every mode and keeps the empty-target rule", async () => {
  const parent = await astroSite();
  const target = join(parent, "cms");
  await mkdir(target);
  expect((await cli(["init", ".", "--existing-site", ".."], target)).code).toBe(0);
  const blocked = join(parent, "other");
  await mkdir(blocked);
  await writeFile(join(blocked, "notes.txt"), "keep");
  const result = await cli(["init", ".", "--no-site"], blocked);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("unsupported entry: notes.txt");
  expect(await readdir(blocked)).toEqual(["notes.txt"]);
});

test("without a terminal the starter is used and the other flags are named", async () => {
  const parent = await astroSite();
  const result = await cli(["cms"], parent);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("--existing-site <path>");
  expect(result.stdout).toContain("--no-site");
  const manifest = JSON.parse(await readFile(join(parent, "cms/.lace/manifest.json"), "utf8"));
  expect(manifest.site).toEqual({ mode: "starter", path: "site" });
});

test("interactive defaults pick an existing site at .. when the parent is an Astro project", async () => {
  const parent = await astroSite();
  const result = await cli(["cms"], parent, { interactive: true, input: input("", "") });
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Choose 1-3 [2]");
  expect(result.stdout).toContain("[..]");
  const manifest = JSON.parse(await readFile(join(parent, "cms/.lace/manifest.json"), "utf8"));
  expect(manifest.site).toEqual({ mode: "existing", path: ".." });
});

test("interactive default is the starter without an Astro parent", async () => {
  const parent = await root();
  const result = await cli(["my-site"], parent, { interactive: true, input: input("") });
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Choose 1-3 [1]");
  const manifest = JSON.parse(await readFile(join(parent, "my-site/.lace/manifest.json"), "utf8"));
  expect(manifest.site).toEqual({ mode: "starter", path: "site" });
});

test("interactive answers are re-prompted and fail after three invalid answers", async () => {
  const parent = await astroSite();
  const chosen = await cli(["cms"], parent, {
    interactive: true,
    input: input("4", "none"),
  });
  expect(chosen.code).toBe(0);
  expect(chosen.stdout).toContain("Enter 1, 2 or 3.");
  expect(JSON.parse(await readFile(join(parent, "cms/.lace/manifest.json"), "utf8")).site).toEqual({
    mode: "none",
    path: null,
  });

  for (const answers of [["x", "y", "z"], ["2", "/abs", "-x", "a//b"], ["2"], []]) {
    const empty = await root();
    const result = await cli(["cms"], empty, { interactive: true, input: input(...answers) });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Usage:");
    expect(await readdir(empty)).toEqual([]);
  }
  const path = await astroSite(join(await root(), "web"));
  const nested = await cli(["cms"], join(path, ".."), {
    interactive: true,
    input: input("existing", "bad\\path", "../web"),
  });
  expect(nested.code).toBe(0);
  expect(JSON.parse(await readFile(join(path, "../cms/.lace/manifest.json"), "utf8")).site).toEqual(
    { mode: "existing", path: "../web" },
  );
});

test("interactive none with --cloudflare generates a headless Worker project", async () => {
  const parent = await root();
  const result = await cli(["cms", "--cloudflare"], parent, {
    interactive: true,
    input: input("3"),
  });
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Cloudflare Worker section of docs/lace-operations.md");
  const manifest = JSON.parse(await readFile(join(parent, "cms/.lace/manifest.json"), "utf8"));
  expect(manifest.site).toEqual({ mode: "none", path: null });
  expect(manifest.files).toHaveProperty("worker/index.ts");
  expect(manifest.files).not.toHaveProperty(".github/workflows/cloudflare.yml");
});

test("existing-site path grammar", () => {
  for (const [path, expected] of [
    ["..", ".."],
    ["../", ".."],
    ["../web", "../web"],
    ["../../my_site-1", "../../my_site-1"],
    ["../.site", "../.site"],
  ])
    expect(normalizeSitePath(path)).toBe(expected);
  for (const path of [
    "",
    "/",
    "/srv/site",
    ".",
    "./site",
    "../.",
    "...",
    "a//b",
    "../-x",
    "..\\web",
    "../we b",
    "../w\u0000",
    "C:/site",
    "../site//",
  ])
    expect(normalizeSitePath(path), path).toBeUndefined();
});

test("existing-site paths must lie outside the target, avoid symlinks and be Astro roots", async () => {
  const parent = await astroSite();
  const elsewhere = await astroSite();
  await mkdir(join(parent, "plain"));
  await writeFile(join(parent, "plain/package.json"), '{"dependencies":{"astro":"7.3.1"}}\n');
  await mkdir(join(parent, "configonly"));
  await writeFile(join(parent, "configonly/astro.config.mjs"), "export default {};\n");
  await writeFile(join(parent, "configonly/package.json"), '{"dependencies":{}}\n');
  await symlink(elsewhere, join(parent, "linked"));
  for (const [path, message] of [
    ["site", "must resolve outside the generated project"],
    ["../cms/site", "must resolve outside the generated project"],
    ["../linked", "symbolic link"],
    ["../plain", "is not an Astro project root"],
    ["../configonly", "is not an Astro project root"],
    ["../missing", "does not exist"],
    ["../-bad", "Invalid existing-site path"],
  ]) {
    const result = await cli(["cms", "--existing-site", path], parent);
    expect(result.code, path).toBe(1);
    expect(result.stderr, path).toContain(message);
    expect(await readdir(parent)).not.toContain("cms");
  }
  const before = await treeHashes(parent);
  await expect(
    generateProject({ target: join(parent, "cms"), site: { mode: "existing", path: ".." } }),
  ).resolves.toMatchObject({ manifest: { site: { mode: "existing", path: ".." } } });
  expect(await treeHashes(parent, new Set(["cms"]))).toEqual(before);
});

test("markers render per mode and malformed markers fail", () => {
  const text = [
    "a",
    "# lace-site: starter existing",
    "b",
    "# lace-site: existing",
    "c {{SITE_PATH}}",
    "# lace-site: end",
    "# lace-site: end",
    "key: value # lace-site: none",
    "d",
    "# lace-site: end",
    "",
  ].join("\n");
  const site = { mode: "existing", path: "../web" };
  // Content before a trailing marker precedes its block and is kept in every mode.
  expect(renderForSite(text, "x.yml", "markers", site)).toBe("a\nb\nc ../web\nkey: value\n");
  expect(renderSiteMarkers(text, "x.yml", "starter")).toBe("a\nb\nkey: value\n");
  expect(renderSiteMarkers(text, "x.yml", "none")).toBe("a\nkey: value\nd\n");
  expect(
    renderSiteMarkers(
      "x\n\n<!-- lace-site: none -->\n\nN\n\n<!-- lace-site: end -->\n\ny\n",
      "r.md",
      "starter",
    ),
  ).toBe("x\n\ny\n");
  for (const [bad, message] of [
    ["# lace-site: starter\nx\n", "unterminated"],
    ["x\n# lace-site: end\n", "without a block"],
    ["# lace-site: sometimes\nx\n# lace-site: end\n", "unknown lace-site mode"],
    ["# lace-site:\n# lace-site: end\n", "unknown lace-site mode"],
    ["<!-- lace-site: starter\n", "malformed"],
  ])
    expect(() => renderSiteMarkers(bad, bad.startsWith("<") ? "r.md" : "x.yml", "starter")).toThrow(
      message,
    );
});

test("Cloudflare markers select on/off blocks and nest with site markers", () => {
  const text = [
    "a",
    "// lace-cloudflare: on",
    "worker",
    "// lace-site: starter existing",
    "site {{SITE_PATH}}",
    "// lace-site: end",
    "// lace-cloudflare: end",
    "// lace-cloudflare: off",
    "plain",
    "// lace-cloudflare: end",
    "",
  ].join("\n");
  const starter = { mode: "starter" };
  expect(renderForSite(text, "x.jsonc", "markers", starter, true)).toBe("a\nworker\nsite site\n");
  expect(renderForSite(text, "x.jsonc", "markers", { mode: "none" }, true)).toBe("a\nworker\n");
  expect(renderForSite(text, "x.jsonc", "markers", starter, false)).toBe("a\nplain\n");
  expect(
    renderCloudflareMarkers(
      "<!-- lace-cloudflare: on -->\nW\n<!-- lace-cloudflare: end -->\n",
      "r.md",
      false,
    ),
  ).toBe("");
  for (const [bad, message] of [
    ["# lace-cloudflare: on\nx\n", "unterminated"],
    ["# lace-cloudflare: end\n", "without a block"],
    ["# lace-cloudflare: maybe\nx\n# lace-cloudflare: end\n", "unknown lace-cloudflare value"],
    ["# lace-cloudflare: on off\nx\n# lace-cloudflare: end\n", "unknown lace-cloudflare value"],
    ["<!-- lace-cloudflare: on\n", "malformed"],
  ])
    expect(() =>
      renderCloudflareMarkers(bad, bad.startsWith("<") ? "r.md" : "x.yml", true),
    ).toThrow(message);
});

test("starter package.json and workspace bytes equal the committed templates", async () => {
  const pkg = (await readFile(join(templates, "package.json"), "utf8")).replaceAll(
    "{{PROJECT_NAME}}",
    "cms",
  );
  expect(renderForSite(pkg, "package.json", "root-package", { mode: "starter" }, true)).toBe(pkg);
  const plain = JSON.parse(renderForSite(pkg, "package.json", "root-package", { mode: "starter" }));
  const template = JSON.parse(pkg);
  for (const name of Object.keys(template.scripts).filter((key) => key.startsWith("cf:")))
    delete template.scripts[name];
  delete template.dependencies["@lacecms/db"];
  delete template.dependencies["@lacecms/platform-cloudflare"];
  expect(plain).toEqual(template);
  const workspace = await readFile(join(templates, "pnpm-workspace.yaml"), "utf8");
  expect(renderForSite(workspace, "pnpm-workspace.yaml", "workspace", { mode: "starter" })).toBe(
    workspace,
  );
  for (const site of [{ mode: "existing", path: ".." }, { mode: "none" }])
    expect(renderForSite(workspace, "pnpm-workspace.yaml", "workspace", site)).toMatch(
      /^allowBuilds:\n/u,
    );
});

test("no template file leaks a marker in any mode", async () => {
  const parent = await astroSite();
  for (const [name, site, cloudflare] of [
    ["starter", { mode: "starter" }, true],
    ["existing", { mode: "existing", path: ".." }, true],
    ["none", { mode: "none" }, false],
    ["none-cloudflare", { mode: "none" }, true],
    ["starter-plain", { mode: "starter" }, false],
  ]) {
    const project = await generateProject({ target: join(parent, name), site, cloudflare });
    for (const file of await listFiles(project.path)) {
      const text = await readFile(join(project.path, file), "utf8");
      expect(text, `${name}:${file}`).not.toContain("lace-site:");
      expect(text, `${name}:${file}`).not.toContain("lace-cloudflare:");
      expect(text, `${name}:${file}`).not.toMatch(/\{\{(SITE_PATH|PROJECT_NAME)\}\}/u);
      expect(text, `${name}:${file}`).not.toMatch(/\n\n\n/u);
    }
    const expected = TEMPLATE_FILES.filter(
      (file) =>
        !file.metadata &&
        (cloudflare || !file.cloudflare) &&
        (file.modes === undefined || file.modes.includes(site.mode)),
    ).map((file) => file.path);
    expect(Object.keys(project.manifest.files).sort()).toEqual(expected.sort());
  }
});

test("existing-site managed files select the site at its path", async () => {
  const parent = await astroSite();
  const project = await generateProject({
    target: join(parent, "cms"),
    site: { mode: "existing", path: ".." },
    cloudflare: true,
  });
  const read = (file) => readFile(join(project.path, file), "utf8");
  const { scripts } = JSON.parse(await read("package.json"));
  expect(scripts.dev).toBe("pnpm --dir .. exec astro dev");
  expect(scripts.build).toBe("pnpm --dir .. exec astro build");
  expect(scripts).not.toHaveProperty("typecheck");
  expect(await read("pnpm-workspace.yaml")).not.toContain("packages:");
  const environment = await read(".env.example");
  expect(environment).toMatch(/^LACE_BUILD_SOURCE_ROOT=\.\.$/mu);
  expect(environment).toMatch(/^LACE_BUILD_SITE_DIR=\.$/mu);
  expect(environment).toMatch(/^LACE_BUILD_OUTPUT_DIR=dist$/mu);
  const compose = await read("docker-compose.yml");
  expect(compose).toContain("source: ${LACE_BUILD_SOURCE_ROOT:-..}");
  expect(compose).toContain("LACE_BUILD_SITE_DIR: ${LACE_BUILD_SITE_DIR:-.}");
  expect(compose).toContain("LACE_BUILD_OUTPUT_DIR: ${LACE_BUILD_OUTPUT_DIR:-dist}");
  expect(await read("worker/wrangler.jsonc")).toContain('"LACE_BUILD_SITE_LABEL": "Main site"');
  expect(await read("worker/wrangler.jsonc")).not.toContain("pages_build_output_dir");
  const workflow = await read(".github/workflows/cloudflare.yml");
  expect(workflow).toContain("pnpm --dir .. install --frozen-lockfile");
  expect(workflow).toContain("wrangler pages deploy ../dist");
  const readme = await read("README.md");
  expect(readme).toContain("**existing site** at `..`");
  expect(readme).toContain("pnpm exec lace add block --all --site ..");
  expect(readme).toContain("docs/lace-astro-site.md");
  expect(readme).not.toMatch(/`site\/src/u);
  const guide = await read("docs/lace-operations.md");
  expect(guide).toContain("**existing site** at `..`");
  expect(guide).toContain("pnpm exec lace add block --all --site ..");
  expect(guide).toContain("did not modify the site");
});

test("no-site managed files configure no builder or build site", async () => {
  const parent = await root();
  const project = await generateProject({ target: join(parent, "cms"), site: { mode: "none" } });
  const read = (file) => readFile(join(project.path, file), "utf8");
  const { scripts } = JSON.parse(await read("package.json"));
  for (const name of ["dev", "build", "typecheck"]) expect(scripts).not.toHaveProperty(name);
  expect(scripts).toHaveProperty("prod:start");
  expect(await read("pnpm-workspace.yaml")).not.toContain("packages:");
  const environment = await read(".env.example");
  expect(environment).not.toMatch(
    /LACE_BUILD_(SOURCE_ROOT|SITE_DIR|OUTPUT_DIR|SITE_ID|SITE_LABEL)=/u,
  );
  expect(environment).toMatch(/^LACE_BUILDER_SECRET=$/mu);
  expect(environment).toMatch(/^LACE_BUILDER_IMAGE=/mu);
  const compose = await read("docker-compose.yml");
  expect(compose).not.toMatch(/^ {2}builder:/mu);
  expect(compose).not.toContain("LACE_BUILDER_URL");
  expect(compose).not.toContain("LACE_BUILD_SITE_ID");
  expect(compose).not.toContain("build-egress");
  expect(compose).not.toMatch(/builder: \{ condition/u);
  expect(compose).toMatch(/^ {2}static-output-init:/mu);
  expect(compose).toMatch(/^ {2}web:/mu);
  const readme = await read("README.md");
  expect(readme).toContain("Site mode: **none**");
  expect(readme).toContain("builds no site");
  expect(readme).toContain("docs/lace-astro-site.md");
  expect(readme).not.toContain("pnpm dev\n");
  expect(await read("docs/lace-operations.md")).toContain("builds no site");
  const cloud = await generateProject({
    target: join(parent, "cloud"),
    site: { mode: "none" },
    cloudflare: true,
  });
  const config = await readFile(join(cloud.path, "worker/wrangler.jsonc"), "utf8");
  expect(config).not.toContain("LACE_BUILD_SITE");
  expect(
    JSON.parse(config.replace(/^\s*\/\/.*$/gmu, "").replace(/,(\s*[}\]])/gu, "$1")),
  ).toMatchObject({
    vars: { LACE_PUBLIC_BASE_URL: "https://cms.example.com/" },
  });
  expect(cloud.manifest.files).not.toHaveProperty(".github/workflows/cloudflare.yml");
  const cloudGuide = await readFile(join(cloud.path, "docs/lace-operations.md"), "utf8");
  expect(cloudGuide).toContain("## Cloudflare Worker");
  expect(cloudGuide).toContain("no static-site workflow");
  expect(cloudGuide).not.toContain("Deploy the static site separately");
});

test.each([
  [
    ["cms", "--existing-site", ".."],
    ["existing site at ..", "pnpm exec lace add block --all --site ..", "docs/lace-astro-site.md"],
  ],
  [
    ["cms", "--no-site"],
    ["Site mode: none", "docs/lace-astro-site.md"],
  ],
  [
    ["cms", "--starter"],
    ["Site mode: starter", "follow README.md"],
  ],
])("generator output names the next steps for %j", async (args, expected) => {
  const parent = await astroSite();
  const result = await cli(args, parent);
  expect(result.code).toBe(0);
  for (const text of expected) expect(result.stdout).toContain(text);
});

test.each([
  ["starter", { mode: "starter" }],
  ["existing", { mode: "existing", path: ".." }],
  ["none", { mode: "none" }],
])("%s generation is deterministic and local links resolve", async (name, site) => {
  const left = await generateProject({ target: join(await astroSite(), "cms"), site });
  const right = await generateProject({ target: join(await astroSite(), "cms"), site });
  expect(left.manifest).toEqual(right.manifest);
  expect(await treeHashes(left.path)).toEqual(await treeHashes(right.path));
  for (const document of ["README.md", "docs/lace-operations.md"]) {
    const text = await readFile(join(left.path, document), "utf8");
    for (const [, link] of text.matchAll(/\]\(([^)\s]+)\)/gu)) {
      if (/^[a-z]+:/u.test(link)) continue;
      const [path, fragment] = link.split("#");
      const file = path ? join(left.path, document, "..", path) : join(left.path, document);
      expect((await stat(file)).isFile(), `${document} -> ${link}`).toBe(true);
      if (fragment) {
        const anchors = [...(await readFile(file, "utf8")).matchAll(/^## (.+)$/gmu)].map((match) =>
          match[1].toLowerCase().replaceAll(",", "").replaceAll(" ", "-"),
        );
        expect(anchors, `${document} -> ${link}`).toContain(fragment);
      }
    }
  }
});

const docker = spawnSync("docker", ["compose", "version"], { stdio: "ignore" }).status === 0;
test.skipIf(!docker)("generated Compose files are valid in every mode", async () => {
  const parent = await astroSite();
  for (const [name, site] of [
    ["starter", { mode: "starter" }],
    ["existing", { mode: "existing", path: ".." }],
    ["none", { mode: "none" }],
  ]) {
    const project = await generateProject({ target: join(parent, name), site });
    const result = spawnSync("docker", ["compose", "config", "--format", "json"], {
      cwd: project.path,
      encoding: "utf8",
      env: {
        ...process.env,
        LACE_AUTH_SECRET: "test-only",
        LACE_MINIO_ROOT_ACCESS_KEY: "test-only",
        LACE_MINIO_ROOT_SECRET: "test-only",
        LACE_BUILDER_SECRET: "test-only",
        LACE_API_IMAGE: "api:test",
        LACE_BUILDER_IMAGE: "builder:test",
        LACE_PUBLIC_BASE_URL: "http://127.0.0.1:3000/",
      },
    });
    expect(result.status, result.stderr).toBe(0);
    const { services } = JSON.parse(result.stdout);
    if (site.mode === "none") {
      expect(services).not.toHaveProperty("builder");
      expect(services.dispatcher.environment).not.toHaveProperty("LACE_BUILDER_URL");
      expect(services.api.environment).not.toHaveProperty("LACE_BUILD_SITE_ID");
    } else {
      const mount = services.builder.volumes.find((volume) => volume.target === "/source");
      expect(mount.source).toBe(await realpath(site.mode === "existing" ? parent : project.path));
      expect(services.builder.environment.LACE_BUILD_SITE_DIR).toBe(
        site.mode === "existing" ? "." : "site",
      );
    }
  }
});
