import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, realpath, readFile, readdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parseUpgradeArguments } from "../dist/upgrade-command.js";
import { upgradeHash } from "../dist/upgrade-input.js";

const roots = [];
const bin = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const generator = fileURLToPath(new URL("../../create-lace/dist/bin.js", import.meta.url));
// These integration scenarios start several real CLI processes and audit disk bytes.
// Keep their CI budget separate from the default timeout for fast parser/unit tests.
const integrationTimeout = 60_000;
const processTimeout = 20_000;
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function snapshot(root) {
  const files = {};
  async function visit(directory, prefix = "") {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = prefix + entry.name;
      if (entry.isDirectory()) await visit(join(directory, entry.name), `${path}/`);
      else files[path] = (await readFile(join(directory, entry.name))).toString("base64");
    }
  }
  await visit(root);
  return files;
}
async function fixture(cloudflare = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "lace-upgrade-cli-")));
  roots.push(root);
  const project = join(root, "working", "my-site");
  const template = join(root, "target", "my-site");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(root, "working"));
  await mkdir(join(root, "target"));
  for (const path of [project, template])
    execFileSync(
      process.execPath,
      [generator, "create", path, ...(cloudflare ? ["--cloudflare"] : [])],
      { timeout: processTimeout },
    );
  return { root, project, template };
}
function cli(args, cwd) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.startsWith("LACE_") && !name.startsWith("CLOUDFLARE_"),
    ),
  );
  return spawnSync(process.execPath, [bin, "upgrade", ...args], {
    cwd,
    env,
    encoding: "utf8",
    timeout: processTimeout,
  });
}
async function updateTemplate(root, path, bytes) {
  await writeFile(join(root, path), bytes);
  const location = join(root, ".lace/manifest.json");
  const manifest = JSON.parse(await readFile(location, "utf8"));
  manifest.templateVersion = "0.3.0";
  manifest.files[path].sha256 = upgradeHash(Buffer.from(bytes));
  await writeFile(location, JSON.stringify(manifest));
  const instructionsPath = join(root, ".lace/upgrade-instructions.json");
  const instructions = JSON.parse(await readFile(instructionsPath, "utf8"));
  instructions.templateVersion = manifest.templateVersion;
  await writeFile(instructionsPath, JSON.stringify(instructions));
}

describe("upgrade CLI", () => {
  it(
    "upgrades 0.9 guides to 0.10 block-command guidance without touching the site",
    async () => {
      const { root, project, template } = await fixture();
      const manifestPath = join(project, ".lace/manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.templateVersion = "0.9.0";
      for (const path of ["docs/lace-astro-site.md", "docs/lace-operations.md"]) {
        const old = Buffer.from(`old 0.9 template ${path}\n`);
        await writeFile(join(project, path), old);
        manifest.files[path].sha256 = upgradeHash(old);
      }
      await writeFile(manifestPath, JSON.stringify(manifest));
      await rm(join(project, ".lace/upgrade-instructions.json"));
      await writeFile(join(project, "README.md"), "user README\n");
      const before = await snapshot(join(project, "site"));
      const args = ["--project", project, "--template", template, "--apply", "--json"];
      const result = cli(args, root);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      const outcome = JSON.parse(result.stdout);
      expect(outcome.data.instructions.templateVersion).toBe("0.10.0");
      expect(outcome.guidance).toContain("lace add block --all");
      for (const path of ["docs/lace-astro-site.md", "docs/lace-operations.md"])
        expect(await readFile(join(project, path), "utf8")).toBe(
          await readFile(join(template, path), "utf8"),
        );
      expect(await readFile(join(project, "docs/lace-astro-site.md"), "utf8")).toContain(
        "pnpm exec lace add block --all --site ..",
      );
      expect(await readFile(join(project, "README.md"), "utf8")).toBe("user README\n");
      expect(await snapshot(join(project, "site"))).toEqual(before);
    },
    integrationTimeout,
  );
  it(
    "upgrades 0.8 to 0.10 with migration guidance and without touching the alpha site",
    async () => {
      const { root, project, template } = await fixture();
      const manifestPath = join(project, ".lace/manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.templateVersion = "0.8.0";
      const operations = Buffer.from("old 0.8 template docs/lace-operations.md\n");
      await writeFile(join(project, "docs/lace-operations.md"), operations);
      manifest.files["docs/lace-operations.md"].sha256 = upgradeHash(operations);
      await rm(join(project, "docs/lace-astro-site.md"));
      delete manifest.files["docs/lace-astro-site.md"];
      // Replace the adapter starter with the 0.8 site layout the consumer still owns.
      for (const path of [
        "site/src/lib/lace.ts",
        "site/src/lace/blocks.ts",
        "site/lace.site.json",
      ]) {
        await rm(join(project, path));
        delete manifest.files[path];
      }
      const old = ["site/src/lib/site-data.ts", "site/src/components/BlockRenderer.astro"];
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(project, "site/src/components"), { recursive: true });
      for (const path of old) {
        await writeFile(join(project, path), `user ${path}\n`);
        manifest.files[path] = { owner: "user" };
      }
      await writeFile(manifestPath, JSON.stringify(manifest));
      await rm(join(project, ".lace/upgrade-instructions.json"));
      const before = await snapshot(join(project, "site"));
      const args = ["--project", project, "--template", template, "--apply", "--json"];
      const result = cli(args, root);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      const outcome = JSON.parse(result.stdout);
      expect(outcome.data.instructions.templateVersion).toBe("0.10.0");
      expect(outcome.guidance).toContain("@lacecms/astro");
      expect(outcome.guidance).toContain("Delete site/src/lib/site-data.ts");
      expect(outcome.guidance).toContain("docs/lace-astro-site.md");
      expect(await readFile(join(project, "docs/lace-astro-site.md"), "utf8")).toBe(
        await readFile(join(template, "docs/lace-astro-site.md"), "utf8"),
      );
      expect(await readFile(join(project, "docs/lace-operations.md"), "utf8")).toBe(
        await readFile(join(template, "docs/lace-operations.md"), "utf8"),
      );
      expect(await snapshot(join(project, "site"))).toEqual(before);
    },
    integrationTimeout,
  );
  it(
    "upgrades 0.7 proxy and guidance to 0.10 without changing user site source",
    async () => {
      const { root, project, template } = await fixture();
      const manifestPath = join(project, ".lace/manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.templateVersion = "0.7.0";
      for (const path of ["deploy/nginx.conf", "docs/lace-operations.md"]) {
        const old = Buffer.from(`old 0.7 template ${path}\n`);
        await writeFile(join(project, path), old);
        manifest.files[path].sha256 = upgradeHash(old);
      }
      await writeFile(manifestPath, JSON.stringify(manifest));
      await rm(join(project, ".lace/upgrade-instructions.json"));
      const preserved = ["site/src/lib/lace.ts", "site/src/pages/blog/[slug].astro"];
      for (const path of preserved) await writeFile(join(project, path), `user ${path}\n`);
      const args = ["--project", project, "--template", template, "--apply", "--json"];
      const result = cli(args, root);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      const outcome = JSON.parse(result.stdout);
      expect(outcome.data.instructions.templateVersion).toBe("0.10.0");
      expect(outcome.guidance).toContain("Cache-Control: no-cache");
      expect(outcome.guidance).toContain("revalidate the build export with its ETag");
      expect(await readFile(join(project, "deploy/nginx.conf"), "utf8")).toContain(
        'add_header Cache-Control "no-cache" always;',
      );
      for (const path of preserved)
        expect(await readFile(join(project, path), "utf8")).toBe(`user ${path}\n`);
    },
    integrationTimeout,
  );
  it(
    "upgrades 0.6 managed deployment files to 0.10 while preserving user source",
    async () => {
      const { root, project, template } = await fixture();
      const manifestPath = join(project, ".lace/manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.templateVersion = "0.6.0";
      for (const path of ["docker-compose.yml", ".env.example", "docs/lace-operations.md"]) {
        const old = Buffer.from(`old 0.6 template ${path}\n`);
        await writeFile(join(project, path), old);
        manifest.files[path].sha256 = upgradeHash(old);
      }
      await writeFile(manifestPath, JSON.stringify(manifest));
      await rm(join(project, ".lace/upgrade-instructions.json"));
      const preserved = ["README.md", "lace.config.ts", "site/src/pages/index.astro"];
      for (const path of preserved) await writeFile(join(project, path), `user ${path}\n`);
      const args = ["--project", project, "--template", template, "--apply", "--json"];
      const result = cli(args, root);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      const outcome = JSON.parse(result.stdout);
      expect(outcome.data.instructions.templateVersion).toBe("0.10.0");
      expect(outcome.guidance).toContain("compatible freshly built");
      expect(outcome.guidance).toContain("LACE_BUILD_SOURCE_ROOT");
      expect(JSON.parse(await readFile(manifestPath, "utf8")).templateVersion).toBe("0.10.0");
      expect(await readFile(join(project, "docker-compose.yml"), "utf8")).toContain(
        "create_host_path: false",
      );
      for (const path of preserved)
        expect(await readFile(join(project, path), "utf8")).toBe(`user ${path}\n`);
    },
    integrationTimeout,
  );
  it(
    "loads runtime adapters only after selecting a valid operational command",
    async () => {
      const root = await realpath(await mkdtemp(join(tmpdir(), "lace-cli-imports-")));
      roots.push(root);
      const guard = join(root, "guard.mjs"),
        trace = join(root, "runtime-imports.txt");
      await writeFile(
        guard,
        `
import { registerHooks } from "node:module";
import { appendFileSync } from "node:fs";
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "./commands.js" || specifier.startsWith("@lacecms/platform-") || specifier === "miniflare") {
    appendFileSync(${JSON.stringify(trace)}, specifier + "\\n");
    throw new Error("Runtime adapters are blocked by the regression test.");
  }
  return next(specifier, context);
} });
`,
      );
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([name]) => !name.startsWith("LACE_") && !name.startsWith("CLOUDFLARE_"),
        ),
      );
      for (const [args, status] of [
        [["--help"], 0],
        [["upgrade", "--help"], 0],
        [["upgrade", "--template", join(root, "missing"), "--json"], 4],
        [["db", "migrate", "--json"], 4],
      ]) {
        const result = spawnSync(process.execPath, ["--import", guard, bin, ...args], {
          cwd: root,
          env,
          encoding: "utf8",
          timeout: processTimeout,
        });
        expect(result.status, result.stdout + result.stderr).toBe(status);
        expect(result.stderr).toBe("");
      }
      await expect(readFile(trace)).rejects.toMatchObject({ code: "ENOENT" });
      const operation = spawnSync(
        process.execPath,
        ["--import", guard, bin, "db", "migrate", "--json"],
        {
          cwd: root,
          env: { ...env, LACE_DATABASE_PATH: join(root, "lace.sqlite") },
          encoding: "utf8",
          timeout: processTimeout,
        },
      );
      expect(operation.status).toBe(6);
      expect(JSON.parse(operation.stdout).code).toBe("OPERATION_FAILED");
      expect(await readFile(trace, "utf8")).toBe("./commands.js\n");
    },
    integrationTimeout,
  );
  it.each([
    [],
    ["--apply"],
    ["--template"],
    ["--template", "x", "--json", "--json"],
    ["--template", "x", "--project", "a", "--project", "b"],
    ["--template", "x", "--target", "node"],
    ["--template", "x", "extra"],
    ["--rollback", "--apply"],
    ["--rollback", "--template", "x"],
    ["--rollback", "--rollback"],
  ])("rejects invalid args %j", (args) => {
    expect(() => parseUpgradeArguments(args, "/cwd")).toThrow();
  });
  it("selects explicit template and defaults to the current directory", () => {
    expect(parseUpgradeArguments(["--template", "/template", "--json"], "/cwd")).toEqual({
      project: "/cwd",
      template: "/template",
      json: true,
      action: "review",
    });
  });
  it("selects template-free rollback and explicit apply", () => {
    expect(parseUpgradeArguments(["--rollback"], "/cwd")).toMatchObject({
      project: "/cwd",
      template: undefined,
      action: "rollback",
    });
    expect(parseUpgradeArguments(["--template", "/template", "--apply"], "/cwd").action).toBe(
      "apply",
    );
  });
  it.each([false, true])(
    "reviews generated project without credentials, cloudflare=%s",
    async (cloudflare) => {
      const { root, project, template } = await fixture(cloudflare);
      await writeFile(join(project, "site/src/pages/index.astro"), "User site edits\n");
      await writeFile(join(project, "site/custom.txt"), "untracked user source");
      const targetPath = cloudflare ? "wrangler.jsonc" : "docker-compose.yml";
      await updateTemplate(
        template,
        targetPath,
        (await readFile(join(template, targetPath), "utf8")) + "\n",
      );
      const before = await snapshot(root);
      const args = ["--template", template, "--json"];
      const first = cli(args, project);
      const second = cli(args, project);
      expect(first.status).toBe(0);
      expect(first.stderr).toBe("");
      expect(second.stdout).toBe(first.stdout);
      const result = JSON.parse(first.stdout);
      expect(result).toMatchObject({
        ok: true,
        code: "UPGRADE_PLAN",
        data: { dryRun: true, changes: 1, conflicts: 0 },
      });
      expect(result.data.decisions.find(({ path }) => path === targetPath).action).toBe("replace");
      const human = cli(["--project", project, "--template", template], root);
      expect(human.stdout).toContain("No files written.");
      expect(human.stdout).toContain(`--- a/${targetPath}`);
      expect(cli(["--project", project, "--template", template], root).stdout).toBe(human.stdout);
      expect(await snapshot(root)).toEqual(before);
    },
    integrationTimeout,
  );
  it(
    "returns conflict diffs in review and publishes proposed artifacts on apply",
    async () => {
      const { root, project, template } = await fixture();
      await writeFile(join(project, "docker-compose.yml"), "user deployment\n");
      await updateTemplate(template, "docker-compose.yml", "target deployment\n");
      const before = await snapshot(root);
      const result = cli(["--project", project, "--template", template, "--json"], root);
      expect(result.status).toBe(2);
      expect(result.stderr).toBe("");
      expect(
        JSON.parse(result.stdout).data.decisions.find(({ path }) => path === "docker-compose.yml")
          .diff,
      ).toContain("-user deployment\n+target deployment\n");
      expect(await snapshot(root)).toEqual(before);
      const apply = cli(["--project", project, "--template", template, "--apply", "--json"], root);
      expect(apply.status).toBe(2);
      expect(JSON.parse(apply.stdout)).toMatchObject({
        ok: false,
        code: "UPGRADE_CONFLICTS",
        data: { conflictPath: ".lace/conflicts/0.3.0" },
      });
      const after = await snapshot(root);
      for (const [path, bytes] of Object.entries(before)) expect(after[path]).toBe(bytes);
      expect(
        await readFile(join(project, ".lace/conflicts/0.3.0/proposed/docker-compose.yml"), "utf8"),
      ).toBe("target deployment\n");
    },
    integrationTimeout,
  );
  it(
    "reports stable manifest, missing-target, hash and symlink errors",
    async () => {
      const { root, project, template } = await fixture();
      const args = ["--project", project, "--template", template, "--json"];
      const location = join(template, ".lace/manifest.json");
      const original = await readFile(location);
      const metadata = JSON.parse(original);
      metadata.schemaVersion = 99;
      await writeFile(location, JSON.stringify(metadata));
      let result = cli(args, root);
      expect(result.status).toBe(4);
      expect(JSON.parse(result.stdout).code).toBe("UPGRADE_INPUT");
      await writeFile(location, original);
      await writeFile(join(template, "docker-compose.yml"), "not a pristine target");
      result = cli(args, root);
      expect(result.status).toBe(4);
      expect(result.stdout).toContain("pristine");
      await rm(join(template, "docker-compose.yml"));
      await symlink("/nonexistent", join(template, "docker-compose.yml"));
      result = cli(args, root);
      expect(result.status).toBe(4);
      expect(result.stdout).toContain("symbolic");
      result = cli(["--template", resolve(root, "missing"), "--json"], project);
      expect(result.status).toBe(4);
    },
    integrationTimeout,
  );
  it.each([false, true])(
    "applies and rolls back generated project without credentials, cloudflare=%s",
    async (cloudflare) => {
      const { root, project, template } = await fixture(cloudflare);
      const targetPath = cloudflare ? "wrangler.jsonc" : "docker-compose.yml";
      await writeFile(join(project, "site/src/pages/index.astro"), "User site edits\n");
      await writeFile(join(project, "site/custom.txt"), "untracked source\n");
      const original = await snapshot(project);
      const target = (await readFile(join(template, targetPath), "utf8")) + "\n";
      await updateTemplate(template, targetPath, target);
      await writeFile(
        join(template, ".lace/upgrade-instructions.json"),
        JSON.stringify({
          schemaVersion: 1,
          templateVersion: "0.3.0",
          database: ["Back up, then run lace db migrate --target node."],
          configuration: ["Review config, then run lace content sync."],
        }),
      );
      const targetBefore = await snapshot(template);
      const args = ["--project", project, "--template", template, "--apply", "--json"];
      const apply = cli(args, root);
      expect(apply.status).toBe(0);
      expect(apply.stderr).toBe("");
      const result = JSON.parse(apply.stdout);
      expect(result).toMatchObject({
        ok: true,
        code: "UPGRADE_APPLIED",
        data: { status: "applied", instructions: { templateVersion: "0.3.0" } },
      });
      expect(result.guidance).toContain("lace db migrate");
      expect(await readFile(join(project, targetPath), "utf8")).toBe(target);
      expect(await snapshot(template)).toEqual(targetBefore);
      const upgraded = await snapshot(project);
      expect(JSON.parse(cli(args, root).stdout).code).toBe("UPGRADE_ALREADY_CURRENT");
      expect(await snapshot(project)).toEqual(upgraded);
      for (const [path, value] of Object.entries(original))
        if (path !== targetPath && path !== ".lace/manifest.json")
          expect(upgraded[path]).toBe(value);
      await rm(template, { recursive: true });
      const rollback = cli(["--project", project, "--rollback", "--json"], root);
      expect(rollback.status).toBe(0);
      expect(JSON.parse(rollback.stdout)).toMatchObject({ code: "UPGRADE_ROLLED_BACK" });
      const restored = await snapshot(project);
      for (const [path, value] of Object.entries(original)) expect(restored[path]).toBe(value);
      expect(Object.keys(restored).filter((path) => !path.startsWith(".lace/upgrade/"))).toEqual(
        Object.keys(original),
      );
      expect(
        JSON.parse(cli(["--project", project, "--rollback", "--json"], root).stdout).code,
      ).toBe("UPGRADE_ALREADY_ROLLED_BACK");
    },
    integrationTimeout,
  );
  it(
    "invalid instructions fail before project mutation and missing rollback returns stable input error",
    async () => {
      const { root, project, template } = await fixture();
      const before = await snapshot(project);
      await writeFile(
        join(template, ".lace/upgrade-instructions.json"),
        JSON.stringify({
          schemaVersion: 1,
          templateVersion: "wrong",
          database: [],
          configuration: [],
        }),
      );
      const failed = cli(["--project", project, "--template", template, "--apply", "--json"], root);
      expect(failed.status).toBe(4);
      expect(JSON.parse(failed.stdout).code).toBe("UPGRADE_INPUT");
      expect(await snapshot(project)).toEqual(before);
      const rollback = cli(["--project", project, "--rollback", "--json"], root);
      expect(rollback.status).toBe(4);
      expect(JSON.parse(rollback.stdout).code).toBe("UPGRADE_INPUT");
    },
    integrationTimeout,
  );
});
