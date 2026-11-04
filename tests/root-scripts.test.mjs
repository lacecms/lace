import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const forbidden =
  /alpha[-_ ]?(?:one|two|three|four|five|six|seven|eight)|(?:^|[^a-z0-9])3\d[abc](?:$|[^a-z0-9])|step[-_]3\d/iu;

async function walk(root, directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return walk(root, path);
      return entry.isFile() ? [path] : [];
    }),
  );
  return paths.flat();
}

async function exists(path) {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function inspectScripts(root) {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const scripts = manifest.scripts;
  const scriptFiles = (await walk(root, "scripts")).filter(
    (path) => !path.startsWith("scripts/fixtures/"),
  );
  const surfaces = [
    "package.json",
    // Workspace build scripts are reached through root Turbo commands.
    ...(await walk(root, "apps")).filter((path) => /^apps\/[^/]+\/package\.json$/u.test(path)),
    ...(await walk(root, "packages")).filter((path) =>
      /^packages\/[^/]+\/package\.json$/u.test(path),
    ),
    ...(await walk(root, ".github/workflows")).filter((path) => /\.ya?ml$/u.test(path)),
    ...(await walk(root, "apps")).filter((path) => /^apps\/[^/]+\/Dockerfile[^/]*$/u.test(path)),
    ...scriptFiles.filter((path) => path.endsWith(".mjs")),
    ...(await walk(root, "tests")).filter((path) => path.endsWith(".mjs")),
  ];
  const contents = new Map(
    await Promise.all(
      surfaces.map(async (path) => [path, await readFile(join(root, path), "utf8")]),
    ),
  );
  const catalog = await readFile(join(root, "DEVELOPMENT.md"), "utf8");
  const catalogRows = [...catalog.matchAll(/^\|\s*`([^`]+)`\s*\|/gmu)].map((match) => match[1]);
  const catalogEntries = new Map(
    [...catalog.matchAll(/^\|\s*`([^`]+)`\s*\|[^|\n]*\|[^|\n]*\|([^|\n]*)\|\s*$/gmu)].map(
      (match) => [match[1], [...match[2].matchAll(/`([^`]+)`/gu)].map((entry) => entry[1])],
    ),
  );
  const problems = [];
  const orphans = [];
  for (const [name, entries] of catalogEntries) {
    for (const entry of entries) {
      // Paths name repository sources; build outputs under dist/ appear only after a build.
      if (!/[/.]/u.test(entry) || entry.includes("/dist/")) continue;
      if (!(await exists(join(root, entry))))
        problems.push(`Catalog entry missing: ${name} -> ${entry}`);
    }
  }
  for (const [name, command] of Object.entries(scripts)) {
    if (forbidden.test(name)) problems.push(`Forbidden script name: ${name}`);
    for (const [, target] of command.matchAll(/\bnode\s+(scripts\/[^\s"']+)/gu)) {
      if (!scriptFiles.includes(target)) problems.push(`Dangling target: ${name} -> ${target}`);
      if (catalogEntries.has(name) && !catalogEntries.get(name).includes(target))
        problems.push(`Catalog row omits target: ${name} -> ${target}`);
    }
    if (catalogRows.filter((row) => row === name).length !== 1)
      problems.push(`Catalog row missing or duplicated: ${name}`);
  }
  for (const row of catalogRows) {
    if (!(row in scripts)) problems.push(`Catalog row has no root script: ${row}`);
  }
  for (const path of scriptFiles) {
    if (forbidden.test(basename(path))) problems.push(`Forbidden script file name: ${path}`);
    const escaped = basename(path).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const reference = new RegExp(`(?:^|[^\\w.-])${escaped}(?:$|[^\\w.-])`, "u");
    if (![...contents].some(([source, content]) => source !== path && reference.test(content))) {
      orphans.push(path);
      problems.push(`Orphaned script: ${path}`);
    }
    for (const [variable] of (contents.get(path) ?? "").matchAll(/\bLACE_[A-Z0-9_]+\b/gu)) {
      if (forbidden.test(variable))
        problems.push(`Forbidden verification variable: ${path}: ${variable}`);
    }
  }
  return { problems, orphans, scriptFiles };
}

test("root targets exist, scripts have references and every command has one catalog row", async () => {
  const report = await inspectScripts(root);
  expect(report.problems).toEqual([]);
  console.info(
    `Script references: ${report.scriptFiles.length} files, ${report.orphans.length} orphans (including make-api-runtime.mjs via Dockerfile)`,
  );
});

const obsoleteVariable = ["LACE", "34" + "B", "API_IMAGE"].join("_");
const obsoleteCommand = ["verify", "34" + "c"].join(":");
const obsoleteFile = ["alpha", "six", "probe.mjs"].join("-");

for (const [name, mutate, expected] of [
  [
    "dangling target",
    async (root) => {
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({ scripts: { probe: "node scripts/missing.mjs" } }),
      );
    },
    "Dangling target: probe -> scripts/missing.mjs",
  ],
  [
    "orphaned file",
    async (root) => {
      await writeFile(join(root, "scripts/orphan.mjs"), "export const orphan = true;\n");
    },
    "Orphaned script: scripts/orphan.mjs",
  ],
  [
    "missing catalog row",
    async (root) => {
      await writeFile(join(root, "DEVELOPMENT.md"), "# Development\n");
    },
    "Catalog row missing or duplicated: probe",
  ],
  [
    "forbidden identifiers",
    async (root) => {
      await writeFile(
        join(root, "scripts/probe.mjs"),
        `console.info(process.env.${obsoleteVariable});\n`,
      );
      await writeFile(join(root, "scripts", obsoleteFile), "export {};\n");
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({
          scripts: {
            probe: "node scripts/probe.mjs",
            [obsoleteCommand]: `node scripts/${obsoleteFile}`,
          },
        }),
      );
    },
    `Forbidden verification variable: scripts/probe.mjs: ${obsoleteVariable}`,
  ],
]) {
  test(`script guard rejects a ${name} in a temporary repository`, async () => {
    const temporary = await mkdtemp(join(tmpdir(), "lace-script-guard-"));
    try {
      await mkdir(join(temporary, "scripts"));
      await writeFile(
        join(temporary, "package.json"),
        JSON.stringify({ scripts: { probe: "node scripts/probe.mjs" } }),
      );
      await writeFile(join(temporary, "scripts/probe.mjs"), "console.info('probe');\n");
      await writeFile(
        join(temporary, "DEVELOPMENT.md"),
        "| `probe` | quality | Probe | `scripts/probe.mjs` |\n",
      );
      expect((await inspectScripts(temporary)).problems).toEqual([]);
      await mutate(temporary);
      const { problems } = await inspectScripts(temporary);
      expect(problems).toContain(expected);
      if (name === "forbidden identifiers") {
        expect(problems).toContain(`Forbidden script name: ${obsoleteCommand}`);
        expect(problems).toContain(`Forbidden script file name: scripts/${obsoleteFile}`);
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
}

const testPathPattern =
  /^(?:apps|packages|tests)\/[\w./-]+\.(?:test|packaged\.test|acceptance|integration)\.(?:ts|tsx|mjs)$|^(?:apps|packages)\/[\w-]+\/src$/u;

/** Workspace test paths and filters named by verification runners and maintained docs. */
async function inspectTestPaths(root) {
  const problems = [];
  const members = new Set();
  for (const group of ["apps", "packages"]) {
    for (const path of await walk(root, group)) {
      if (!/^(?:apps|packages)\/[^/]+\/package\.json$/u.test(path)) continue;
      members.add(JSON.parse(await readFile(join(root, path), "utf8")).name);
    }
  }
  const runners = [
    ...(await walk(root, "scripts")).filter((path) =>
      /^scripts\/[^/]+-verification\.mjs$/u.test(path),
    ),
    "vitest.verification.config.mjs",
  ];
  for (const source of runners) {
    if (!(await exists(join(root, source)))) continue;
    const text = await readFile(join(root, source), "utf8");
    for (const [, literal] of text.matchAll(/["'`]([^"'`\s]+)["'`]/gu)) {
      if (testPathPattern.test(literal) && !(await exists(join(root, literal))))
        problems.push(`Missing test path: ${source} -> ${literal}`);
    }
    for (const [, filter] of text.matchAll(/--filter=([^\s"'`]+)/gu)) {
      if (!members.has(filter)) problems.push(`Unknown package filter: ${source} -> ${filter}`);
    }
  }
  const documents = [
    "README.md",
    "DEVELOPMENT.md",
    ...(await walk(root, "docs")).filter(
      // Roadmaps record history, including files later sessions removed.
      (path) =>
        path.endsWith(".md") &&
        !path.startsWith("docs/archive/") &&
        path !== "docs/refactoring-roadmap.md",
    ),
  ];
  for (const document of documents) {
    if (!(await exists(join(root, document)))) continue;
    const text = await readFile(join(root, document), "utf8");
    const code = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```|`([^`\n]+)`/gu)].map(
      (match) => match[1] ?? match[2],
    );
    for (const snippet of code) {
      const paths = [
        ...(snippet.includes("vitest")
          ? [...snippet.matchAll(/--config[=\s]+([^\s`]+)/gu)].map((match) => match[1])
          : []),
        ...(snippet.match(/(?:apps|packages|tests)\/[\w./-]+/gu) ?? []).filter((path) =>
          testPathPattern.test(path),
        ),
      ];
      for (const path of paths) {
        if (!(await exists(join(root, path))))
          problems.push(`Missing documented test path: ${document} -> ${path}`);
      }
    }
  }
  return problems;
}

/** Member scripts that keep type tests and lint warnings inside the root gates. */
async function inspectMemberScripts(root) {
  const problems = [];
  for (const group of ["apps", "packages"]) {
    for (const path of await walk(root, group)) {
      if (!/^(?:apps|packages)\/[^/]+\/package\.json$/u.test(path)) continue;
      const directory = path.slice(0, -"/package.json".length);
      const manifest = JSON.parse(await readFile(join(root, path), "utf8"));
      const scripts = manifest.scripts ?? {};
      if (
        (await exists(join(root, directory, "tsconfig.type-test.json"))) &&
        !(scripts.typecheck ?? "").includes("tsconfig.type-test.json")
      )
        problems.push(`Type tests not in typecheck: ${manifest.name}`);
      if (scripts.lint !== undefined && !/\boxlint --deny-warnings\b/u.test(scripts.lint))
        problems.push(`Lint accepts warnings: ${manifest.name}`);
    }
  }
  return problems;
}

test("verification runners and maintained docs name existing workspace tests", async () => {
  expect(await inspectTestPaths(root)).toEqual([]);
});

test("member scripts gate type tests and deny lint warnings", async () => {
  expect(await inspectMemberScripts(root)).toEqual([]);
});

for (const [name, files, expected] of [
  [
    "missing runner path",
    {
      "scripts/probe-verification.mjs": 'packageRun("packages/content/src/missing.test.ts");\n',
    },
    "Missing test path: scripts/probe-verification.mjs -> packages/content/src/missing.test.ts",
  ],
  [
    "unknown package filter",
    { "scripts/probe-verification.mjs": 'const args = ["--filter=@lacecms/missing"];\n' },
    "Unknown package filter: scripts/probe-verification.mjs -> @lacecms/missing",
  ],
  [
    "stale documented configuration",
    { "docs/guide.md": "Run `pnpm exec vitest run --config vitest.cross-runtime.config.mjs`.\n" },
    "Missing documented test path: docs/guide.md -> vitest.cross-runtime.config.mjs",
  ],
  [
    "stale verification project path",
    {
      "vitest.verification.config.mjs":
        'export default { test: { include: ["apps/builder/src/runner.test.mjs"] } };\n',
    },
    "Missing test path: vitest.verification.config.mjs -> apps/builder/src/runner.test.mjs",
  ],
]) {
  test(`test path guard rejects a ${name} in a temporary repository`, async () => {
    const temporary = await mkdtemp(join(tmpdir(), "lace-test-path-guard-"));
    try {
      await mkdir(join(temporary, "packages/content/src"), { recursive: true });
      await writeFile(
        join(temporary, "packages/content/package.json"),
        JSON.stringify({ name: "@lacecms/content" }),
      );
      await writeFile(join(temporary, "packages/content/src/index.test.ts"), "");
      expect(await inspectTestPaths(temporary)).toEqual([]);
      for (const [path, text] of Object.entries(files)) {
        await mkdir(join(temporary, path, ".."), { recursive: true });
        await writeFile(join(temporary, path), text);
      }
      expect(await inspectTestPaths(temporary)).toContain(expected);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
}

for (const [name, manifest, expected] of [
  [
    "ungated type-test project",
    { name: "@lacecms/config", scripts: { lint: "oxlint --deny-warnings src", typecheck: "tsc" } },
    "Type tests not in typecheck: @lacecms/config",
  ],
  [
    "lint script that accepts warnings",
    {
      name: "@lacecms/config",
      scripts: { lint: "oxlint src", typecheck: "tsc && tsc -p tsconfig.type-test.json" },
    },
    "Lint accepts warnings: @lacecms/config",
  ],
]) {
  test(`member script guard rejects an ${name} in a temporary repository`, async () => {
    const temporary = await mkdtemp(join(tmpdir(), "lace-member-script-guard-"));
    try {
      await mkdir(join(temporary, "packages/config"), { recursive: true });
      await writeFile(join(temporary, "packages/config/tsconfig.type-test.json"), "{}");
      await writeFile(join(temporary, "packages/config/package.json"), JSON.stringify(manifest));
      expect(await inspectMemberScripts(temporary)).toEqual([expected]);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
}
