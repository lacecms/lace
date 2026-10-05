import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { generateProject, runCli, TEMPLATE_FILES, TEMPLATE_VERSION } from "../dist/index.js";

const TEMPLATE_PACKAGE = JSON.parse(
  await readFile(new URL("../templates/package.json", import.meta.url), "utf8"),
);

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root() {
  const path = await mkdtemp(join(tmpdir(), "lace-generator-test-"));
  roots.push(path);
  return path;
}

async function listFiles(path, prefix = "") {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(join(path, entry.name), relative)));
    else files.push(relative);
  }
  return files.sort();
}

test("template inventory classifies every bundled file", async () => {
  const templates = fileURLToPath(new URL("../templates/", import.meta.url));
  expect(TEMPLATE_FILES.map((file) => file.path).sort()).toEqual(await listFiles(templates));
  expect(new Set(TEMPLATE_FILES.map((file) => file.path)).size).toBe(TEMPLATE_FILES.length);
  expect(TEMPLATE_FILES.every((file) => file.owner === "managed" || file.owner === "user")).toBe(
    true,
  );
});

test("generates deterministic owned source and hashed managed files", async () => {
  const leftRoot = await root();
  const rightRoot = await root();
  const left = await generateProject({ target: join(leftRoot, "my-site") });
  const right = await generateProject({ target: join(rightRoot, "my-site") });
  expect(left.manifest).toEqual(right.manifest);
  expect(left.manifest.templateVersion).toBe(TEMPLATE_VERSION);
  const files = await listFiles(left.path);
  expect(files).toEqual(
    [
      ".lace/manifest.json",
      ".lace/upgrade-instructions.json",
      ...Object.keys(left.manifest.files),
    ].sort(),
  );
  expect(left.manifest.files).not.toHaveProperty(".lace/upgrade-instructions.json");
  expect(
    JSON.parse(await readFile(join(left.path, ".lace/upgrade-instructions.json"), "utf8")),
  ).toMatchObject({ schemaVersion: 1, templateVersion: TEMPLATE_VERSION, database: [] });
  expect(files).not.toContain("wrangler.jsonc");
  expect(files.every((file) => !file.startsWith("apps/") && !file.startsWith("packages/"))).toBe(
    true,
  );
  for (const [path, ownership] of Object.entries(left.manifest.files)) {
    const bytes = await readFile(join(left.path, path));
    expect(bytes).toEqual(await readFile(join(right.path, path)));
    if (ownership.owner === "managed") {
      expect(ownership.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    } else {
      expect(ownership).toEqual({ owner: "user" });
    }
  }
  expect(await readFile(join(left.path, ".env.example"), "utf8")).not.toMatch(
    /LACE_AUTH_SECRET=\S/u,
  );
  const scripts = JSON.parse(await readFile(join(left.path, "package.json"), "utf8")).scripts;
  expect(scripts["env:prepare"]).toBe("node node_modules/@lacecms/cli/dist/bin.js env prepare");
  expect(await readFile(join(left.path, ".gitignore"), "utf8")).toContain(".lace-env-*/");
  const guide = await readFile(join(left.path, "docs/lace-operations.md"), "utf8");
  expect(guide.indexOf("pnpm env:prepare")).toBeLessThan(guide.indexOf("pnpm db:migrate"));
  expect(guide).not.toContain("cp .env.example .env");
  expect(guide).toContain("open `/admin/`");
  expect(guide).toContain("same token and email");
  expect(guide).toContain("12–1024 characters");
  expect(guide).toContain("token expires after one hour");
  expect(guide).toContain("Completed setup remains closed");
  expect(guide).toContain("POST /api/v1/setup/admin");
  expect(guide).toContain("originally published `0.1.0-alpha.1`");
  expect(guide).not.toContain("has no browser setup wizard");
});

test("optional Cloudflare files are managed only when selected", async () => {
  const parent = await root();
  const project = await generateProject({ target: join(parent, "cloud-site"), cloudflare: true });
  const files = project.manifest.files;
  expect(files["wrangler.jsonc"]).toBeUndefined();
  expect(files[".github/workflows/cloudflare.yml"]?.owner).toBe("managed");
  expect(files["worker/index.ts"]?.owner).toBe("managed");
  expect(files["worker/.dev.vars.example"]?.owner).toBe("managed");
  expect(files["worker/wrangler.jsonc"]).toEqual({ owner: "user" });
  const listed = await listFiles(project.path);
  expect(listed).toContain(".github/workflows/cloudflare.yml");
  expect(listed).not.toContain("wrangler.jsonc");
  const read = (path) => readFile(join(project.path, path), "utf8");
  const config = await read("worker/wrangler.jsonc");
  expect(config).toContain('"name": "cloud-site-cms"');
  expect(config).toContain('"compatibility_flags": ["nodejs_compat"]');
  expect(config).toContain('"migrations_dir": "../node_modules/@lacecms/db/drizzle"');
  expect(config).toContain('"directory": "../node_modules/@lacecms/platform-cloudflare/admin"');
  expect(config).toContain('"crons": ["* * * * *"]');
  expect(config).toContain('"LACE_BUILD_SITE_ID": "main-site"');
  expect(config).not.toMatch(/pages_build_output_dir|LACE_AUTH_SECRET"|lace-site|lace-cloudflare/u);
  expect(await read("worker/index.ts")).toContain('import config from "../lace.config.ts";');
  const manifest = JSON.parse(await read("package.json"));
  expect(manifest.dependencies).toMatchObject({
    "@lacecms/db": TEMPLATE_PACKAGE.dependencies["@lacecms/db"],
    "@lacecms/platform-cloudflare": TEMPLATE_PACKAGE.dependencies["@lacecms/platform-cloudflare"],
  });
  expect(manifest.scripts["cf:env:prepare"]).toContain("env prepare --target cloudflare-local");
  expect(manifest.scripts["cf:dev"]).toContain("--persist-to .lace/data/cloudflare");
  for (const name of ["cf:db:migrate", "cf:content:sync", "cf:auth:bootstrap"])
    expect(manifest.scripts[name]).toContain("--target cloudflare-local");
  expect(Object.values(manifest.scripts).join("\n")).not.toMatch(
    /--remote|cloudflare-remote|wrangler deploy(?! --dry-run)|secret put/u,
  );
  const environment = await read(".env.example");
  expect(environment).toContain("LACE_WRANGLER_CONFIG=worker/wrangler.jsonc\n");
  expect(environment).toContain("LACE_CLOUDFLARE_PERSIST_TO=./.lace/data/cloudflare\n");
  expect(environment).toContain("LACE_D1_DATABASE_ID=00000000-0000-0000-0000-000000000000\n");
  expect(environment).not.toContain("lace-cloudflare");
  const guide = await read("docs/lace-operations.md");
  expect(guide).toContain("## Cloudflare Worker");
  expect(guide).toContain("explicit mutation of your Cloudflare account");
  expect(guide).toContain("--target cloudflare-remote");
  expect(guide).toContain("never deploys, migrates or configures the CMS Worker");
  expect(guide).not.toContain("## Optional Cloudflare\n");
  expect(guide).toContain("### Local journey and diagnosis");
  expect(guide).toContain("pnpm exec lace doctor --target cloudflare-local --stage ready");
  expect(guide).toContain("http://127.0.0.1:8787/__scheduled");
  expect(guide).toContain("run `pnpm cf:auth:bootstrap` again");
  expect(guide).toContain("deploy hooks only for projects connected to a Git repository");
  expect(guide).toContain("acceptance is not proof of a successful static deploy");
  expect(guide).not.toContain("future work");
  const readme = await read("README.md");
  expect(readme).toContain("docs/lace-operations.md#cloudflare-worker");
  expect(readme).toContain("pnpm exec lace doctor --target cloudflare-local --stage ready");
  expect(await read(".gitignore")).toContain(".dev.vars\n");
});

test("projects without Cloudflare keep empty operator settings and no Worker scripts", async () => {
  const parent = await root();
  const project = await generateProject({ target: join(parent, "plain-site") });
  const read = (path) => readFile(join(project.path, path), "utf8");
  const manifest = JSON.parse(await read("package.json"));
  expect(Object.keys(manifest.scripts).some((name) => name.startsWith("cf:"))).toBe(false);
  expect(manifest.dependencies).not.toHaveProperty("@lacecms/platform-cloudflare");
  expect(manifest.dependencies).not.toHaveProperty("@lacecms/db");
  const environment = await read(".env.example");
  expect(environment).toContain("LACE_WRANGLER_CONFIG=\n");
  expect(environment).not.toContain("worker/wrangler.jsonc");
  const guide = await read("docs/lace-operations.md");
  expect(guide).toContain("## Optional Cloudflare");
  expect(guide).not.toContain("## Cloudflare Worker");
  expect(await listFiles(project.path)).not.toContain("worker/index.ts");
});

test.each([false, true])("fresh cms README is user-owned (cloudflare=%s)", async (cloudflare) => {
  const parent = await root();
  const output = [];
  const errors = [];
  expect(
    await runCli(
      ["create", "cms", ...(cloudflare ? ["--cloudflare"] : [])],
      parent,
      { write: (value) => output.push(value) },
      { write: (value) => errors.push(value) },
    ),
  ).toBe(0);
  const manifest = JSON.parse(await readFile(join(parent, "cms/.lace/manifest.json"), "utf8"));
  expect(manifest.files["README.md"]).toEqual({ owner: "user" });
  expect(await readFile(join(parent, "cms/README.md"), "utf8")).toContain("pnpm env:prepare");
  expect(output.join("")).toContain("follow README.md");
  expect(output.join("")).toContain("docs/lace-operations.md");
  expect(errors).toEqual([]);
  expect(await readdir(parent)).toEqual(["cms"]);
});

test.each([false, true])(
  "init keeps arbitrary README bytes with an explicit fallback (cloudflare=%s)",
  async (cloudflare) => {
    const parent = await root();
    const target = join(parent, "cms");
    await mkdir(target);
    const original = Buffer.from([0xff, 0x00, 0x23, 0x0d, 0x0a, 0x80]);
    await writeFile(join(target, "README.md"), original);
    const output = [];
    expect(
      await runCli(
        ["init", ".", ...(cloudflare ? ["--cloudflare"] : [])],
        target,
        { write: (value) => output.push(value) },
        { write: () => {} },
      ),
    ).toBe(0);
    expect(await readFile(join(target, "README.md"))).toEqual(original);
    const manifest = JSON.parse(await readFile(join(target, ".lace/manifest.json"), "utf8"));
    expect(manifest.files["README.md"]).toEqual({ owner: "user" });
    expect(output.join("")).toContain("Preserved existing README.md");
    expect(output.join("")).toContain("docs/lace-operations.md");
    expect(output.join("")).toContain("manually copy");
    expect(await readFile(join(target, "docs/lace-operations.md"), "utf8")).toContain(
      "POST /api/v1/setup/admin",
    );
  },
);

test.each(["beforePublish", "afterBackup"])(
  "failed generation preserves README at %s",
  async (hook) => {
    const parent = await root();
    const target = join(parent, "cms");
    await mkdir(target);
    const original = Buffer.from("# Existing\r\nKeep unchanged");
    await writeFile(join(target, "README.md"), original);
    await expect(
      generateProject({
        target,
        [hook]: async () => {
          throw new Error("injected failure");
        },
      }),
    ).rejects.toThrow("injected failure");
    expect(await readFile(join(target, "README.md"))).toEqual(original);
    expect(await readdir(target)).toEqual(["README.md"]);
    expect(await readdir(parent)).toEqual(["cms"]);
  },
);

test("alpha generation selects exact compatible packages and overridable images", async () => {
  const parent = await root();
  const project = await generateProject({ target: join(parent, "alpha-site") });
  for (const file of ["package.json", "site/package.json"]) {
    const manifest = JSON.parse(await readFile(join(project.path, file), "utf8"));
    for (const [name, version] of Object.entries(manifest.dependencies)) {
      if (name.startsWith("@lacecms/")) expect(version).toBe("0.1.0-alpha.2");
    }
  }
  const environment = await readFile(join(project.path, ".env.example"), "utf8");
  expect(environment).toContain("LACE_API_IMAGE=ghcr.io/lacecms/api:0.1.0-alpha.2");
  expect(environment).toContain("LACE_BUILDER_IMAGE=ghcr.io/lacecms/builder:0.1.0-alpha.2");
  expect(TEMPLATE_VERSION).toBe("0.15.0");
  const compose = await readFile(join(project.path, "docker-compose.yml"), "utf8");
  expect(compose).toContain("image: ${LACE_API_IMAGE:");
  expect(compose).toContain("image: ${LACE_BUILDER_IMAGE:");
  expect(await readFile(join(project.path, "docs/lace-operations.md"), "utf8")).toContain(
    "pnpm create lace@0.1.0-alpha.2",
  );
});

test("arbitrary directory names produce safe package names", async () => {
  const parent = await root();
  const project = await generateProject({ target: join(parent, "2026 My Site") });
  const rootPackage = JSON.parse(await readFile(join(project.path, "package.json"), "utf8"));
  expect(rootPackage.name).toBe("lace-2026-my-site");
});

test("init preserves allowed entries and rejects other entries and symlinks", async () => {
  const parent = await root();
  const target = join(parent, "existing-site");
  await mkdir(join(target, ".git"), { recursive: true });
  await writeFile(join(target, ".git/config"), "existing git configuration\n");
  await writeFile(join(target, "README.md"), "existing readme\n");
  await generateProject({ target });
  expect(await readFile(join(target, ".git/config"), "utf8")).toBe("existing git configuration\n");
  expect(await readFile(join(target, "README.md"), "utf8")).toBe("existing readme\n");
  expect(await readdir(target)).toContain("site");

  const blocked = join(parent, "blocked-site");
  await mkdir(blocked);
  await writeFile(join(blocked, "notes.txt"), "keep me");
  await expect(generateProject({ target: blocked })).rejects.toThrow(
    "unsupported entry: notes.txt",
  );
  expect(await readdir(blocked)).toEqual(["notes.txt"]);
  const linked = join(parent, "linked-site");
  await symlink(blocked, linked);
  await expect(generateProject({ target: linked })).rejects.toThrow("regular directory");
  const withLinkedReadme = join(parent, "readme-site");
  await mkdir(withLinkedReadme);
  await symlink(join(blocked, "notes.txt"), join(withLinkedReadme, "README.md"));
  await expect(generateProject({ target: withLinkedReadme })).rejects.toThrow("symbolic link");
});

test("CLI validates commands and init only accepts a literal dot", async () => {
  const parent = await root();
  const cwd = join(parent, "my-site");
  await mkdir(cwd);
  const out = [];
  const err = [];
  const stdout = { write: (value) => out.push(value) };
  const stderr = { write: (value) => err.push(value) };
  expect(await runCli(["init", "./"], cwd, stdout, stderr)).toBe(2);
  expect(await runCli(["create", "another-site", "--bad"], cwd, stdout, stderr)).toBe(2);
  expect(await runCli(["init", "."], cwd, stdout, stderr)).toBe(0);
  expect(await runCli(["second-site"], cwd, stdout, stderr)).toBe(0);
  expect(await readdir(join(cwd, "second-site"))).toContain("site");
  expect(out.join("")).toContain(cwd);
  expect(err.join("")).toContain("Usage:");
});

test("failed publication restores the exact original tree", async () => {
  const parent = await root();
  const target = join(parent, "existing-site");
  await mkdir(target);
  await writeFile(join(target, "LICENSE"), "original license\n");
  await expect(
    generateProject({
      target,
      afterBackup: async () => {
        throw new Error("injected publish error");
      },
    }),
  ).rejects.toThrow("injected publish error");
  expect(await readdir(target)).toEqual(["LICENSE"]);
  expect(await readFile(join(target, "LICENSE"), "utf8")).toBe("original license\n");
  expect(
    (await readdir(parent)).filter((file) => file.startsWith(`.${basename(target)}.lace-`)),
  ).toEqual([]);
});

test("staging failure leaves the existing target unchanged", async () => {
  const parent = await root();
  const target = join(parent, "existing-site");
  await mkdir(target);
  await writeFile(join(target, "LICENSE"), "original license\n");
  await expect(
    generateProject({
      target,
      beforePublish: async () => {
        throw new Error("injected staging error");
      },
    }),
  ).rejects.toThrow("injected staging error");
  expect(await readdir(target)).toEqual(["LICENSE"]);
  expect(
    (await readdir(parent)).filter((file) => file.startsWith(`.${basename(target)}.lace-`)),
  ).toEqual([]);
});
