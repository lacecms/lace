import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
  const problems = [];
  const orphans = [];
  for (const [name, command] of Object.entries(scripts)) {
    if (forbidden.test(name)) problems.push(`Forbidden script name: ${name}`);
    for (const [, target] of command.matchAll(/\bnode\s+(scripts\/[^\s"']+)/gu)) {
      if (!scriptFiles.includes(target)) problems.push(`Dangling target: ${name} -> ${target}`);
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
