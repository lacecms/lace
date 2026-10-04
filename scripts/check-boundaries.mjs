import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createScanner, SyntaxKind } from "typescript/unstable/ast";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDirectory, "..");
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const nodeBuiltinModules = new Set(
  builtinModules.map((moduleName) => moduleName.replace(/^node:/, "")),
);

const allowedDependencies = new Map([
  ["@lacecms/config", new Set(["@lacecms/content"])],
  ["@lacecms/domain", new Set(["@lacecms/content"])],
  ["@lacecms/application", new Set(["@lacecms/domain", "@lacecms/content", "@lacecms/config"])],
  ["@lacecms/contracts", new Set(["@lacecms/domain", "@lacecms/content"])],
  ["@lacecms/db", new Set(["@lacecms/application", "@lacecms/domain", "@lacecms/content"])],
  ["@lacecms/auth", new Set(["@lacecms/application", "@lacecms/domain"])],
  ["@lacecms/server", new Set(["@lacecms/application", "@lacecms/contracts", "@lacecms/auth"])],
  ["@lacecms/sdk", new Set(["@lacecms/contracts"])],
  ["@lacecms/render", new Set(["@lacecms/content"])],
  [
    "@lacecms/test-utils",
    new Set(["@lacecms/application", "@lacecms/config", "@lacecms/content", "@lacecms/domain"]),
  ],
  [
    "@lacecms/platform-cloudflare",
    new Set([
      "@lacecms/application",
      "@lacecms/server",
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
      "@lacecms/platform-cloudflare",
      "@lacecms/platform-node",
    ]),
  ],
  [
    "@lacecms/app-api",
    new Set(["@lacecms/platform-cloudflare", "@lacecms/platform-node", "@lacecms/server"]),
  ],
  ["@lacecms/app-admin", new Set(["@lacecms/contracts", "@lacecms/content"])],
  ["@lacecms/app-site", new Set(["@lacecms/sdk", "@lacecms/content"])],
]);

// Framework-neutral packages: every non-relative import must be listed here, which
// rejects UI frameworks, Node built-ins, and other third-party modules.
const externalImportAllowlist = new Map([
  ["@lacecms/render", new Set(["@lacecms/content"])],
  ["@lacecms/sdk", new Set(["@lacecms/contracts", "valibot"])],
]);

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

function importsIn(filePath) {
  const imports = [];
  const scanner = createScanner(true, undefined, readFileSync(filePath, "utf8"));
  let token = scanner.scan();

  while (token !== SyntaxKind.EndOfFile) {
    if (token === SyntaxKind.ImportKeyword) {
      token = scanner.scan();
      if (token === SyntaxKind.StringLiteral) imports.push(scanner.getTokenValue());
      if (token === SyntaxKind.OpenParenToken) {
        token = scanner.scan();
        continue;
      }
      while (token !== SyntaxKind.EndOfFile && token !== SyntaxKind.SemicolonToken) {
        if (token === SyntaxKind.FromKeyword && scanner.scan() === SyntaxKind.StringLiteral) {
          imports.push(scanner.getTokenValue());
          break;
        }
        token = scanner.scan();
      }
    } else if (token === SyntaxKind.ExportKeyword) {
      while (token !== SyntaxKind.EndOfFile && token !== SyntaxKind.SemicolonToken) {
        if (token === SyntaxKind.FromKeyword && scanner.scan() === SyntaxKind.StringLiteral) {
          imports.push(scanner.getTokenValue());
          break;
        }
        token = scanner.scan();
      }
    }
    token = scanner.scan();
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

export function checkBoundaries(rootDirectory = defaultRoot) {
  const members = readMembers(rootDirectory);
  const memberNames = new Set(members.map((member) => member.name));
  const graph = new Map(members.map((member) => [member.name, new Set()]));

  for (const member of members) {
    for (const filePath of collectFiles(member.sourceDirectory)) {
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
        if (!memberNames.has(specifier)) continue;
        if (!allowedDependencies.get(member.name)?.has(specifier)) {
          throw new Error(`forbidden dependency: ${member.name} -> ${specifier}`);
        }
        graph.get(member.name).add(specifier);
      }
    }
  }
  assertNoCycles(graph);
  checkAdminStructure(rootDirectory);
}

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkBoundaries(process.argv[2] ? resolve(process.argv[2]) : defaultRoot);
}
