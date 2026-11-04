import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createScanner, SyntaxKind } from "typescript/unstable/ast";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDirectory, "..");
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".astro"]);
const nodeBuiltinModules = new Set(
  builtinModules.map((moduleName) => moduleName.replace(/^node:/, "")),
);

const allowedDependencies = new Map([
  ["@lacecms/app-docs", new Set()],
  ["@lacecms/config", new Set(["@lacecms/content"])],
  ["@lacecms/domain", new Set(["@lacecms/content"])],
  ["@lacecms/application", new Set(["@lacecms/domain", "@lacecms/content", "@lacecms/config"])],
  ["@lacecms/contracts", new Set(["@lacecms/domain", "@lacecms/content"])],
  ["@lacecms/db", new Set(["@lacecms/application", "@lacecms/domain", "@lacecms/content"])],
  ["@lacecms/mcp", new Set(["@lacecms/application", "@lacecms/contracts", "@lacecms/domain"])],
  ["@lacecms/auth", new Set(["@lacecms/application", "@lacecms/domain"])],
  ["@lacecms/server", new Set(["@lacecms/application", "@lacecms/contracts", "@lacecms/auth"])],
  ["@lacecms/sdk", new Set(["@lacecms/contracts"])],
  ["@lacecms/render", new Set(["@lacecms/content"])],
  ["@lacecms/astro", new Set(["@lacecms/render", "@lacecms/sdk"])],
  [
    "@lacecms/test-utils",
    new Set([
      "@lacecms/application",
      "@lacecms/config",
      "@lacecms/content",
      "@lacecms/contracts",
      "@lacecms/domain",
    ]),
  ],
  [
    "@lacecms/platform-cloudflare",
    new Set([
      "@lacecms/application",
      "@lacecms/server",
      "@lacecms/mcp",
      "@lacecms/db",
      "@lacecms/auth",
      "@lacecms/config",
      "@lacecms/content",
      "@lacecms/domain",
    ]),
  ],
  [
    "@lacecms/platform-node",
    new Set([
      "@lacecms/application",
      "@lacecms/server",
      "@lacecms/mcp",
      "@lacecms/db",
      "@lacecms/auth",
      "@lacecms/config",
      "@lacecms/content",
      "@lacecms/domain",
    ]),
  ],
  [
    "@lacecms/cli",
    new Set([
      "@lacecms/application",
      "@lacecms/config",
      "@lacecms/contracts",
      "@lacecms/platform-cloudflare",
      "@lacecms/platform-node",
    ]),
  ],
  [
    "@lacecms/app-api",
    new Set(["@lacecms/platform-cloudflare", "@lacecms/platform-node", "@lacecms/server"]),
  ],
  ["@lacecms/app-admin", new Set(["@lacecms/contracts", "@lacecms/content"])],
  [
    "@lacecms/app-site",
    new Set(["@lacecms/astro", "@lacecms/render", "@lacecms/sdk", "@lacecms/content"]),
  ],
]);

// Framework-neutral packages: every non-relative import must be listed here, which
// rejects UI frameworks, Node built-ins, and other third-party modules.
const externalImportAllowlist = new Map([
  [
    "@lacecms/mcp",
    new Set([
      "@lacecms/application",
      "@lacecms/contracts",
      "@lacecms/domain",
      "@modelcontextprotocol/server",
      "@valibot/to-json-schema",
      "valibot",
    ]),
  ],
  ["@lacecms/application", new Set(["@lacecms/domain", "@lacecms/config", "@lacecms/content"])],
  ["@lacecms/render", new Set(["@lacecms/content"])],
  ["@lacecms/sdk", new Set(["@lacecms/contracts", "valibot"])],
]);

// Framework adapters may additionally import their framework and its subpaths.
const adapterFrameworks = new Map([["@lacecms/astro", "astro"]]);
const reExportPattern =
  /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*["']@lacecms\//u;
function collectFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(entryPath));
    if (entry.isFile() && sourceExtensions.has(extname(entry.name))) files.push(entryPath);
  }
  return files;
}

function readMembers(rootDirectory) {
  const members = [];
  for (const group of ["apps", "packages"]) {
    const groupDirectory = join(rootDirectory, group);
    if (!existsSync(groupDirectory)) continue;
    for (const entry of readdirSync(groupDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = join(groupDirectory, entry.name);
      const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
      members.push({ directory, name: manifest.name, sourceDirectory: join(directory, "src") });
    }
  }
  return members;
}

/** Astro components carry their imports in the leading `---` frontmatter fence. */
function sourceText(filePath) {
  const text = readFileSync(filePath, "utf8");
  if (extname(filePath) !== ".astro") return text;
  return /^\s*---\r?\n([\s\S]*?)\r?\n---/u.exec(text)?.[1] ?? "";
}

function packageOf(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function importsIn(filePath) {
  const imports = [];
  const scanner = createScanner(true, undefined, sourceText(filePath));
  // A lexical scan has no parser context for regex/JSX tokens (notably #).
  // Always advance, as the field-vocabulary scanner does, to avoid hanging.
  const scan = () => {
    const before = scanner.getTokenEnd();
    const token = scanner.scan();
    if (token !== SyntaxKind.EndOfFile && scanner.getTokenEnd() <= before) {
      scanner.resetTokenState(before + 1);
    }
    return token;
  };
  let token = scan();

  while (token !== SyntaxKind.EndOfFile) {
    if (token === SyntaxKind.ImportKeyword) {
      token = scan();
      if (token === SyntaxKind.StringLiteral) imports.push(scanner.getTokenValue());
      if (token === SyntaxKind.OpenParenToken) {
        token = scan();
        continue;
      }
      while (token !== SyntaxKind.EndOfFile && token !== SyntaxKind.SemicolonToken) {
        if (token === SyntaxKind.FromKeyword && scan() === SyntaxKind.StringLiteral) {
          imports.push(scanner.getTokenValue());
          break;
        }
        token = scan();
      }
    } else if (token === SyntaxKind.ExportKeyword) {
      while (token !== SyntaxKind.EndOfFile && token !== SyntaxKind.SemicolonToken) {
        if (token === SyntaxKind.FromKeyword && scan() === SyntaxKind.StringLiteral) {
          imports.push(scanner.getTokenValue());
          break;
        }
        token = scan();
      }
    }
    token = scan();
  }
  return imports;
}

function isNodeBuiltin(specifier) {
  return specifier.startsWith("node:") || nodeBuiltinModules.has(specifier);
}

function isOutside(sourceDirectory, filePath, specifier) {
  const target = resolve(dirname(filePath), specifier);
  const sourceRelativePath = relative(sourceDirectory, target);
  return (
    sourceRelativePath === ".." ||
    sourceRelativePath.startsWith(`..${sep}`) ||
    sourceRelativePath.startsWith("../")
  );
}

function assertNoCycles(graph) {
  const visiting = new Set();
  const visited = new Set();
  const visit = (member, path) => {
    if (visiting.has(member))
      throw new Error(`dependency cycle: ${[...path, member].join(" -> ")}`);
    if (visited.has(member)) return;
    visiting.add(member);
    for (const dependency of graph.get(member) ?? []) visit(dependency, [...path, member]);
    visiting.delete(member);
    visited.add(member);
  };
  for (const member of graph.keys()) visit(member, []);
}

// Admin source layers, highest first. A module may import only lower layers.
const adminLayers = ["app", "pages", "widgets", "features", "entities", "shared"];
const slicedAdminLayers = new Set(["pages", "widgets", "features", "entities"]);
const adminEntryFiles = new Set(["main.tsx", "vite-env.d.ts"]);
const pascalCase = /^[A-Z][A-Za-z0-9]*$/;
const testFilePattern = /\.test\.tsx?$/;
const typeTestFilePattern = /\.type-test\.tsx?$/;
const typeScriptPattern = /\.(?:c|m)?tsx?$/;

function toPosix(path) {
  return path.split(sep).join("/");
}

function classifyAdminPath(relativePath) {
  const parts = relativePath.split("/");
  if (parts.length === 1) return adminEntryFiles.has(parts[0]) ? "entry" : "outside";
  if (parts[0] === "test") return "setup";
  return adminLayers.includes(parts[0]) ? "layer" : "outside";
}

function adminUnitOf(sourceDirectory, relativePath) {
  const parts = relativePath.split("/");
  const layer = parts[0];
  if (slicedAdminLayers.has(layer)) {
    if (parts.length < 3) throw new Error(`admin ${layer} module outside a slice: ${relativePath}`);
    const slice = parts.slice(0, 2).join("/");
    if (!existsSync(join(sourceDirectory, slice, "index.ts"))) {
      throw new Error(`admin slice has no public index: ${slice}/index.ts is missing`);
    }
    return slice;
  }
  for (let depth = 1; depth < parts.length; depth += 1) {
    const unit = parts.slice(0, depth).join("/");
    if (existsSync(join(sourceDirectory, unit, "index.ts"))) return unit;
  }
  return parts.slice(0, Math.min(2, parts.length - 1)).join("/");
}

function componentFolderOf(relativePath) {
  const parts = relativePath.split("/").slice(0, -1);
  for (let index = parts.length - 1; index >= 1; index -= 1) {
    if (pascalCase.test(parts[index])) return parts.slice(0, index + 1).join("/");
  }
  return undefined;
}

function resolveAdminImport(filePath, specifier) {
  const target = resolve(dirname(filePath), specifier.replace(/\?.*$/u, ""));
  const withoutJs = target.replace(/\.(?:c|m)?js$/u, "");
  const candidates = [
    ...(withoutJs === target ? [] : [`${withoutJs}.ts`, `${withoutJs}.tsx`]),
    target,
    `${target}.ts`,
    `${target}.tsx`,
    join(target, "index.ts"),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function isInside(unit, relativePath) {
  return relativePath === unit || relativePath.startsWith(`${unit}/`);
}

function checkAdminComponentFolders(sourceDirectory, relativeFiles) {
  const directories = new Set();
  for (const relativePath of relativeFiles) {
    if (classifyAdminPath(relativePath) !== "layer") continue;
    const parts = relativePath.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/"));
    }
    const fileName = parts.at(-1);
    if (!fileName.endsWith(".tsx") || testFilePattern.test(fileName)) continue;
    const folder = parts.at(-2);
    if (!pascalCase.test(folder) || fileName !== `${folder}.tsx`) {
      throw new Error(
        `admin component module must be <Name>/<Name>.tsx in a PascalCase folder: ${relativePath}`,
      );
    }
  }
  for (const directory of directories) {
    const name = directory.split("/").at(-1);
    if (!pascalCase.test(name)) continue;
    for (const required of [`${name}.tsx`, "index.ts", `${name}.test.tsx`]) {
      if (!existsSync(join(sourceDirectory, directory, required))) {
        throw new Error(`admin component folder ${directory} is missing ${required}`);
      }
    }
  }
}

export function checkAdminStructure(rootDirectory = defaultRoot) {
  const sourceDirectory = join(rootDirectory, "apps", "admin", "src");
  if (!existsSync(sourceDirectory)) return;
  const files = collectFiles(sourceDirectory);
  const relativeFiles = files.map((filePath) => toPosix(relative(sourceDirectory, filePath)));

  for (const relativePath of relativeFiles) {
    if (classifyAdminPath(relativePath) === "outside") {
      throw new Error(
        `admin source outside the layers: ${relativePath} (use ${adminLayers.join(", ")})`,
      );
    }
  }
  checkAdminComponentFolders(sourceDirectory, relativeFiles);

  for (const [index, filePath] of files.entries()) {
    const sourcePath = relativeFiles[index];
    const sourceKind = classifyAdminPath(sourcePath);
    const unrestricted = sourceKind !== "layer" || testFilePattern.test(sourcePath);
    const sourceLayer = sourcePath.split("/")[0];
    const sourceUnit = sourceKind === "layer" ? adminUnitOf(sourceDirectory, sourcePath) : "";
    const sourceFolder = componentFolderOf(sourcePath);

    for (const specifier of importsIn(filePath)) {
      if (!specifier.startsWith(".")) continue;
      const resolved = resolveAdminImport(filePath, specifier);
      if (resolved === undefined) {
        throw new Error(`unresolved admin import in ${sourcePath}: ${specifier}`);
      }
      const targetPath = toPosix(relative(sourceDirectory, resolved));
      if (classifyAdminPath(targetPath) !== "layer") {
        if (sourceKind === "layer") {
          throw new Error(`admin layer import of non-layer module in ${sourcePath}: ${specifier}`);
        }
        continue;
      }
      const targetLayer = targetPath.split("/")[0];
      const typeScriptTarget = typeScriptPattern.test(targetPath);
      const sameUnit = sourceUnit !== "" && isInside(sourceUnit, targetPath);

      if (!unrestricted && !sameUnit) {
        const sourceRank = adminLayers.indexOf(sourceLayer);
        const targetRank = adminLayers.indexOf(targetLayer);
        if (targetRank < sourceRank) {
          throw new Error(
            `admin upward import in ${sourcePath}: ${sourceLayer} may not import ${targetLayer} (${specifier})`,
          );
        }
        if (targetRank === sourceRank && slicedAdminLayers.has(targetLayer)) {
          throw new Error(
            `admin cross-slice import in ${sourcePath}: ${sourceUnit} may not import ${adminUnitOf(sourceDirectory, targetPath)} (${specifier})`,
          );
        }
      }
      if (!typeScriptTarget) continue;

      const targetUnit = adminUnitOf(sourceDirectory, targetPath);
      if (!sameUnit && targetPath !== `${targetUnit}/index.ts`) {
        throw new Error(
          `admin deep import in ${sourcePath}: ${specifier} bypasses ${targetUnit}/index.ts`,
        );
      }
      const targetFolder = componentFolderOf(targetPath);
      if (
        targetFolder !== undefined &&
        targetFolder !== sourceFolder &&
        targetPath !== `${targetFolder}/index.ts`
      ) {
        throw new Error(
          `admin deep import in ${sourcePath}: ${specifier} bypasses ${targetFolder}/index.ts`,
        );
      }
    }
  }
}

function readJsonBaseline(rootDirectory, name, empty) {
  const path = join(rootDirectory, "scripts", name);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : empty;
}

/** Tests, type tests and shared test helpers are outside production module graphs. */
function isTestSource(sourcePath) {
  return (
    testFilePattern.test(sourcePath) ||
    typeTestFilePattern.test(sourcePath) ||
    sourcePath.startsWith("test-support/")
  );
}

/** True when the leading comment block carries TypeScript's `@ts-nocheck` directive. */
function disablesTypeChecking(text) {
  let rest = text.replace(/^﻿/u, "");
  for (;;) {
    rest = rest.trimStart();
    const comment = /^(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)/u.exec(rest);
    if (comment === null) return false;
    if (/@ts-nocheck\b/u.test(comment[0])) return true;
    rest = rest.slice(comment[0].length);
  }
}

/** Legacy tests may skip type checking only while listed; the list only shrinks. */
function checkTypecheckExceptions(rootDirectory, members) {
  const baseline = readJsonBaseline(rootDirectory, "test-typecheck-baseline.json", []);
  const listed = new Set(baseline);
  for (const member of members) {
    if (!existsSync(member.sourceDirectory)) continue;
    for (const filePath of collectFiles(member.sourceDirectory)) {
      if (!disablesTypeChecking(readFileSync(filePath, "utf8"))) continue;
      const fileName = toPosix(relative(rootDirectory, filePath));
      const sourcePath = toPosix(relative(member.sourceDirectory, filePath));
      const testFile = testFilePattern.test(sourcePath) || typeTestFilePattern.test(sourcePath);
      if (!testFile || sourcePath.startsWith("test-support/")) {
        throw new Error(
          `typecheck exception forbidden: ${fileName} is not a test file and must be type-checked`,
        );
      }
      if (!listed.has(fileName)) {
        throw new Error(
          `typecheck exception not in baseline: ${fileName} disables type checking; type it or list it in scripts/test-typecheck-baseline.json`,
        );
      }
    }
  }
  for (const fileName of baseline) {
    const filePath = join(rootDirectory, fileName);
    const reason = !existsSync(filePath)
      ? "is missing"
      : !disablesTypeChecking(readFileSync(filePath, "utf8"))
        ? "no longer disables type checking"
        : undefined;
    if (reason !== undefined) {
      throw new Error(
        `stale typecheck baseline entry: ${fileName} ${reason}; remove it from scripts/test-typecheck-baseline.json`,
      );
    }
  }
}

function resolveRelativeModule(filePath, specifier, files) {
  const target = resolve(dirname(filePath), specifier.replace(/\?.*$/u, ""));
  const withoutJs = target.replace(/\.(?:c|m)?js$/u, "");
  const candidates = [
    ...(withoutJs === target ? [] : [`${withoutJs}.ts`, `${withoutJs}.tsx`]),
    target,
    `${target}.ts`,
    `${target}.tsx`,
    join(target, "index.ts"),
    join(target, "index.tsx"),
  ];
  return candidates.find((candidate) => files.has(candidate));
}

/** Production modules of one member and their relative import edges. */
function memberModuleGraph(member) {
  const files = new Set(
    collectFiles(member.sourceDirectory).filter(
      (filePath) => !isTestSource(toPosix(relative(member.sourceDirectory, filePath))),
    ),
  );
  const graph = new Map();
  for (const filePath of files) {
    const edges = new Set();
    for (const specifier of importsIn(filePath)) {
      if (!specifier.startsWith(".")) continue;
      const target = resolveRelativeModule(filePath, specifier, files);
      if (target !== undefined) edges.add(target);
    }
    graph.set(filePath, edges);
  }
  return graph;
}

/** Tarjan's strongly connected components that contain a cycle. */
function cyclicComponents(graph) {
  const order = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];
  let next = 0;
  const visit = (node) => {
    order.set(node, next);
    low.set(node, next);
    next += 1;
    stack.push(node);
    onStack.add(node);
    for (const target of graph.get(node)) {
      if (!order.has(target)) {
        visit(target);
        low.set(node, Math.min(low.get(node), low.get(target)));
      } else if (onStack.has(target)) low.set(node, Math.min(low.get(node), order.get(target)));
    }
    if (low.get(node) !== order.get(node)) return;
    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== node);
    if (component.length > 1 || graph.get(node).has(node)) components.push(component);
  };
  for (const node of graph.keys()) if (!order.has(node)) visit(node);
  return components;
}

/** Module cycles fail unless they stay inside a recorded legacy component. */
function checkModuleCycles(rootDirectory, graphs) {
  const baseline = readJsonBaseline(rootDirectory, "source-cycle-baseline.json", []).map(
    (component) => new Set(component),
  );
  const found = [];
  for (const graph of graphs) {
    for (const component of cyclicComponents(graph)) {
      const files = component.map((filePath) => toPosix(relative(rootDirectory, filePath))).sort();
      found.push(files);
      if (!baseline.some((recorded) => files.every((file) => recorded.has(file)))) {
        throw new Error(`module cycle: ${files.join(", ")}`);
      }
    }
  }
  for (const recorded of baseline) {
    if (!found.some((files) => files.every((file) => recorded.has(file)))) {
      throw new Error(
        `stale source cycle baseline entry: ${[...recorded].join(", ")} no longer forms a cycle; remove it from scripts/source-cycle-baseline.json`,
      );
    }
  }
}

/** Source files a manifest's `exports` and `bin` targets are built from. */
function manifestEntrySources(member) {
  const manifest = JSON.parse(readFileSync(join(member.directory, "package.json"), "utf8"));
  const targets = [];
  const collect = (value) => {
    if (typeof value === "string") targets.push(value);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(manifest.exports);
  collect(manifest.bin);
  return new Set(
    targets
      .map((target) => /^\.\/dist\/([^/]+)\.js$/u.exec(target)?.[1])
      .filter((name) => name !== undefined)
      .flatMap((name) => [`${name}.ts`, `${name}.tsx`]),
  );
}

/** Directory names on the entry's `// Directory dependencies:` comment lines. */
function headerDirectories(entryText) {
  const lines = entryText.split("\n");
  const start = lines.findIndex((line) => line.startsWith("// Directory dependencies:"));
  if (start === -1) return undefined;
  const header = [lines[start].slice("// Directory dependencies:".length)];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("//")) break;
    header.push(line.slice(2));
  }
  return new Set(header.join(" ").match(/[a-z][a-z0-9-]*/gu) ?? []);
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

/** Domain-directory rules for packages declared in `scripts/source-layout.json`. */
function checkSourceLayout(rootDirectory, members, graphs) {
  const layout = readJsonBaseline(rootDirectory, "source-layout.json", {});
  const membersByPath = new Map(
    members.map((member) => [toPosix(relative(rootDirectory, member.directory)), member]),
  );
  for (const [packagePath, directories] of Object.entries(layout)) {
    const member = membersByPath.get(packagePath);
    if (member === undefined) throw new Error(`source layout names unknown member: ${packagePath}`);
    const declared = new Set(Object.keys(directories));
    const graph = graphs.get(member);
    const directoryOf = (filePath) => {
      const parts = toPosix(relative(member.sourceDirectory, filePath)).split("/");
      return parts.length === 1 ? undefined : parts[0];
    };
    const entries = manifestEntrySources(member);
    const present = new Set();
    for (const filePath of graph.keys()) {
      const sourcePath = toPosix(relative(member.sourceDirectory, filePath));
      const fileName = toPosix(relative(rootDirectory, filePath));
      const directory = directoryOf(filePath);
      if (directory === undefined) {
        if (!entries.has(sourcePath) && !/\.d\.(?:c|m)?ts$/u.test(sourcePath)) {
          throw new Error(`source layout: ${fileName} is a root module but not a package entry`);
        }
        continue;
      }
      present.add(directory);
      if (/^index\.tsx?$/u.test(basename(filePath))) {
        throw new Error(`source layout: subdirectory barrel ${fileName}`);
      }
      for (const target of graph.get(filePath)) {
        const targetDirectory = directoryOf(target);
        if (targetDirectory === directory) continue;
        if (targetDirectory === undefined || !directories[directory]?.includes(targetDirectory)) {
          throw new Error(
            `source layout: ${fileName} imports ${toPosix(relative(rootDirectory, target))}; ${directory} -> ${targetDirectory ?? "<entry>"} is not declared for ${packagePath}`,
          );
        }
      }
    }
    if (!sameSet(present, declared)) {
      throw new Error(
        `source layout: ${packagePath} directories [${[...present].sort().join(", ")}] differ from scripts/source-layout.json [${[...declared].sort().join(", ")}]`,
      );
    }
    const entryPath = join(member.sourceDirectory, "index.ts");
    const named = existsSync(entryPath)
      ? headerDirectories(readFileSync(entryPath, "utf8"))
      : undefined;
    if (named === undefined || !sameSet(named, declared)) {
      throw new Error(
        `source layout: ${packagePath} entry header names [${[...(named ?? [])].sort().join(", ")}]; declared directories are [${[...declared].sort().join(", ")}]`,
      );
    }
  }
}

export function checkBoundaries(rootDirectory = defaultRoot) {
  const baselinePath = join(rootDirectory, "scripts", "oversized-source-baseline.json");
  const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};
  const sourceLineCounts = new Map();
  const members = readMembers(rootDirectory);
  const memberNames = new Set(members.map((member) => member.name));
  const graph = new Map(members.map((member) => [member.name, new Set()]));

  for (const member of members) {
    for (const filePath of collectFiles(member.sourceDirectory)) {
      const sourcePath = toPosix(relative(member.sourceDirectory, filePath));
      // Test setup is not part of the runtime dependency graph.
      if (testFilePattern.test(sourcePath) || sourcePath.startsWith("test-support/")) continue;
      const fileName = toPosix(relative(rootDirectory, filePath));
      const text = readFileSync(filePath, "utf8");
      const lineCount = text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
      sourceLineCounts.set(fileName, lineCount);
      if (lineCount > 1_000) {
        const recorded = Object.hasOwn(baseline, fileName) ? baseline[fileName] : undefined;
        if (recorded === undefined) {
          throw new Error(`source size limit: ${fileName} has ${lineCount} lines; limit is 1000`);
        }
        if (!Number.isInteger(recorded) || lineCount > recorded) {
          throw new Error(
            `source size baseline exceeded: ${fileName} has ${lineCount} lines; recorded ${recorded}`,
          );
        }
      }
      for (const specifier of importsIn(filePath)) {
        if (specifier.startsWith(".")) {
          if (isOutside(member.sourceDirectory, filePath, specifier)) {
            throw new Error(`cross-package source-path import in ${filePath}: ${specifier}`);
          }
          continue;
        }
        if (
          ["@lacecms/content", "@lacecms/config"].includes(member.name) &&
          isNodeBuiltin(specifier)
        ) {
          throw new Error(`Node builtin import in portable package ${member.name}: ${specifier}`);
        }
        const externalAllowlist = externalImportAllowlist.get(member.name);
        if (externalAllowlist !== undefined && !externalAllowlist.has(specifier)) {
          throw new Error(
            `framework-neutral package ${member.name} may not import ${specifier} (in ${filePath})`,
          );
        }
        const target = packageOf(specifier);
        const framework = adapterFrameworks.get(member.name);
        if (framework !== undefined) {
          // Adapters run only at site build time: `node:` builtins and the
          // framework's virtual modules (such as `astro:assets`) are allowed.
          const allowed =
            specifier.startsWith("node:") ||
            specifier.startsWith(`${framework}:`) ||
            (!isNodeBuiltin(specifier) && (target === framework || memberNames.has(target)));
          if (!allowed) {
            throw new Error(
              `framework adapter ${member.name} may not import ${specifier} (in ${filePath})`,
            );
          }
        }
        if (!memberNames.has(target)) continue;
        if (!allowedDependencies.get(member.name)?.has(target)) {
          throw new Error(`forbidden dependency: ${member.name} -> ${target}`);
        }
        graph.get(member.name).add(target);
      }
      if (adapterFrameworks.has(member.name) && reExportPattern.test(sourceText(filePath))) {
        throw new Error(
          `framework adapter ${member.name} may not re-export a Lace package (in ${filePath})`,
        );
      }
    }
  }
  for (const fileName of Object.keys(baseline)) {
    const lineCount = sourceLineCounts.get(fileName);
    if (lineCount === undefined || lineCount <= 1_000) {
      throw new Error(
        `stale source size baseline entry: ${fileName} ${lineCount === undefined ? "is missing from production source" : `has ${lineCount} lines (limit 1000)`}; remove it from scripts/oversized-source-baseline.json`,
      );
    }
  }
  assertNoCycles(graph);
  checkAdminStructure(rootDirectory);
  checkTypecheckExceptions(rootDirectory, members);
  const moduleGraphs = new Map(members.map((member) => [member, memberModuleGraph(member)]));
  checkModuleCycles(rootDirectory, moduleGraphs.values());
  checkSourceLayout(rootDirectory, members, moduleGraphs);
}

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkBoundaries(process.argv[2] ? resolve(process.argv[2]) : defaultRoot);
}
