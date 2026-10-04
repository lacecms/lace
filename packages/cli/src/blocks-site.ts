import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BlockError,
  RESERVED_FRAMEWORKS,
  SUPPORTED_FRAMEWORKS,
  safeRelativePath,
} from "./blocks-registry.js";
import type { Framework } from "./blocks-registry.js";
import { readUpgradeFile, UpgradeError } from "./upgrade-input.js";

export const LOCK_FILE = "lace.site.json";
export const DEFAULT_COMPONENTS_DIR = "src/components/lace";
export const DEFAULT_BLOCK_MAP = "src/lace/blocks.ts";
const ASTRO_CONFIGS = ["mjs", "js", "ts", "mts", "cjs", "cts"].map((ext) => `astro.config.${ext}`);
const HASH = /^[0-9a-f]{64}$/u;
const NAME = /^[A-Za-z][A-Za-z0-9-]{0,63}$/u;

export interface LockItem {
  readonly revision: number;
  readonly files: Readonly<Record<string, string>>;
}
export interface LockCustomBlock {
  readonly files: Readonly<Record<string, string>>;
}
export interface SiteLock {
  readonly schemaVersion: 1;
  readonly framework: string;
  readonly componentsDir: string;
  readonly blockMap: string;
  readonly blockMapSha256: string | null;
  readonly definitions?: string;
  readonly items: Readonly<Record<string, LockItem>>;
  readonly customBlocks?: Readonly<Record<string, LockCustomBlock>>;
}

export function invalidInput(message: string): never {
  throw new BlockError("BLOCK_INPUT", message);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every path written or recorded must stay below the site root. */
export function sitePath(path: unknown, label: string): string {
  if (!safeRelativePath(path))
    invalidInput(`${LOCK_FILE} ${label} must be a relative path inside the site root.`);
  return path;
}

function fileHashes(value: unknown, label: string): Record<string, string> {
  if (!record(value)) invalidInput(`${LOCK_FILE} ${label} must record file hashes.`);
  const files: Record<string, string> = {};
  for (const path of Object.keys(value).sort()) {
    const hash = value[path];
    if (typeof hash !== "string" || !HASH.test(hash))
      invalidInput(`${LOCK_FILE} ${label} has an invalid hash for ${path}.`);
    files[sitePath(path, `${label} file`)] = hash;
  }
  return files;
}

export function validateLock(value: unknown): SiteLock {
  const allowed = [
    "schemaVersion",
    "framework",
    "componentsDir",
    "blockMap",
    "blockMapSha256",
    "definitions",
    "items",
    "customBlocks",
  ];
  if (!record(value) || Object.keys(value).some((key) => !allowed.includes(key)))
    invalidInput(`${LOCK_FILE} has unsupported keys; this CLI supports schemaVersion 1.`);
  if (value.schemaVersion !== 1)
    invalidInput(`${LOCK_FILE} schemaVersion is unsupported; this CLI supports version 1.`);
  if (typeof value.framework !== "string" || !NAME.test(value.framework))
    invalidInput(`${LOCK_FILE} framework is invalid.`);
  const componentsDir = sitePath(value.componentsDir, "componentsDir");
  const blockMap = sitePath(value.blockMap, "blockMap");
  if (
    value.blockMapSha256 !== null &&
    (typeof value.blockMapSha256 !== "string" || !HASH.test(value.blockMapSha256))
  )
    invalidInput(`${LOCK_FILE} blockMapSha256 must be a SHA-256 hash or null.`);
  if (
    value.definitions !== undefined &&
    (typeof value.definitions !== "string" ||
      value.definitions.length === 0 ||
      isAbsolute(value.definitions) ||
      /[\\\0]/u.test(value.definitions))
  )
    invalidInput(`${LOCK_FILE} definitions must be a relative module path.`);
  if (!record(value.items)) invalidInput(`${LOCK_FILE} items must be an object.`);
  const items: Record<string, LockItem> = {};
  for (const name of Object.keys(value.items).sort()) {
    const item = value.items[name];
    if (
      !NAME.test(name) ||
      !record(item) ||
      Object.keys(item).sort().join(",") !== "files,revision" ||
      !Number.isSafeInteger(item.revision) ||
      (item.revision as number) < 1
    )
      invalidInput(`${LOCK_FILE} item ${name} is invalid.`);
    items[name] = {
      revision: item.revision as number,
      files: fileHashes(item.files, `item ${name}`),
    };
  }
  let customBlocks: Record<string, LockCustomBlock> | undefined;
  if (value.customBlocks !== undefined) {
    if (!record(value.customBlocks)) invalidInput(`${LOCK_FILE} customBlocks must be an object.`);
    customBlocks = {};
    for (const type of Object.keys(value.customBlocks).sort()) {
      const entry = value.customBlocks[type];
      if (!NAME.test(type) || !record(entry) || Object.keys(entry).join(",") !== "files")
        invalidInput(`${LOCK_FILE} custom block ${type} is invalid.`);
      customBlocks[type] = { files: fileHashes(entry.files, `custom block ${type}`) };
    }
  }
  return {
    schemaVersion: 1,
    framework: value.framework,
    componentsDir,
    blockMap,
    blockMapSha256: value.blockMapSha256 as string | null,
    ...(value.definitions === undefined ? {} : { definitions: value.definitions as string }),
    items,
    ...(customBlocks === undefined ? {} : { customBlocks }),
  };
}

const sortedRecord = <T>(value: Readonly<Record<string, T>>, map: (entry: T) => unknown) =>
  Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, map(value[key] as T)]),
  );

/** Deterministic serialization in format key order. */
export function serializeLock(lock: SiteLock): Buffer {
  const files = (entry: { readonly files: Readonly<Record<string, string>> }) => ({
    files: sortedRecord(entry.files, (hash) => hash),
  });
  const value = {
    schemaVersion: 1,
    framework: lock.framework,
    componentsDir: lock.componentsDir,
    blockMap: lock.blockMap,
    blockMapSha256: lock.blockMapSha256,
    ...(lock.definitions === undefined ? {} : { definitions: lock.definitions }),
    items: sortedRecord(lock.items, (item) => ({ revision: item.revision, ...files(item) })),
    ...(lock.customBlocks === undefined || Object.keys(lock.customBlocks).length === 0
      ? {}
      : { customBlocks: sortedRecord(lock.customBlocks, files) }),
  };
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

/** Site files are read with the upgrade reader: no symlinks, regular files only. */
export async function readSiteFile(root: string, path: string): Promise<Buffer | undefined> {
  try {
    return await readUpgradeFile(root, path);
  } catch (error) {
    if (error instanceof UpgradeError)
      invalidInput(
        `Cannot use ${path} in the site: paths must be regular files and directories without symbolic links.`,
      );
    throw error;
  }
}

async function readJsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

export interface SelectedSite {
  /** The `--site` value as typed, used in printed commands. */
  readonly display: string;
  readonly root: string;
  readonly framework: Framework;
  readonly lock: SiteLock | null;
  readonly lockBytes: Buffer | undefined;
}

export function detectFramework(packageJson: unknown): string {
  const deps = record(packageJson)
    ? {
        ...(record(packageJson.dependencies) ? packageJson.dependencies : {}),
        ...(record(packageJson.devDependencies) ? packageJson.devDependencies : {}),
      }
    : {};
  const has = (name: string): boolean => Object.hasOwn(deps, name);
  if (has("astro")) return "astro";
  if (has("svelte") || has("@sveltejs/kit")) return "svelte";
  if (has("vue") || has("nuxt")) return "vue";
  if (has("react") || has("next")) return "react";
  return "astro";
}

export function checkFramework(framework: string): Framework {
  if ((SUPPORTED_FRAMEWORKS as readonly string[]).includes(framework))
    return framework as Framework;
  if ((RESERVED_FRAMEWORKS as readonly string[]).includes(framework))
    throw new BlockError(
      "BLOCK_FRAMEWORK",
      `Framework "${framework}" is not supported yet; Lace blocks are available for: ${SUPPORTED_FRAMEWORKS.join(", ")}.`,
    );
  throw new BlockError(
    "BLOCK_FRAMEWORK",
    `Unknown framework "${framework}"; supported: ${SUPPORTED_FRAMEWORKS.join(", ")} (reserved: ${RESERVED_FRAMEWORKS.join(", ")}).`,
  );
}

export async function selectSite(options: {
  readonly cwd: string;
  readonly site: string;
  readonly framework: string | undefined;
}): Promise<SelectedSite> {
  let root: string;
  try {
    root = await realpath(resolve(options.cwd, options.site));
    if (!(await stat(root)).isDirectory()) throw new Error("not a directory");
  } catch {
    return invalidInput(
      `Site directory ${options.site} does not exist; select it with --site <dir>.`,
    );
  }
  const lockBytes = await readSiteFile(root, LOCK_FILE);
  let lock: SiteLock | null = null;
  if (lockBytes !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lockBytes.toString("utf8"));
    } catch {
      invalidInput(`${options.site}/${LOCK_FILE} is not valid JSON.`);
    }
    lock = validateLock(parsed);
  }
  if (lock !== null && options.framework !== undefined && options.framework !== lock.framework)
    throw new BlockError(
      "BLOCK_USAGE",
      `--framework ${options.framework} differs from framework "${lock.framework}" recorded in ${LOCK_FILE}.`,
    );
  const framework = checkFramework(
    lock?.framework ??
      options.framework ??
      detectFramework(await readJsonFile(join(root, "package.json"))),
  );
  let found = false;
  for (const name of ASTRO_CONFIGS) {
    if ((await readSiteFile(root, name)) !== undefined) found = true;
  }
  if (!found)
    invalidInput(
      `${options.site} is not an Astro site: no astro.config.* was found. Select the Astro project root with --site <dir>.`,
    );
  return { display: options.site, root, framework, lock, lockBytes };
}

/** Installed version from the nearest node_modules, walking up from the site root. */
export async function installedVersion(root: string, name: string): Promise<string | undefined> {
  let cursor = root;
  for (;;) {
    const value = await readJsonFile(
      join(cursor, "node_modules", ...name.split("/"), "package.json"),
    );
    if (record(value) && typeof value.version === "string") return value.version;
    const parent = dirname(cursor);
    if (parent === cursor) return undefined;
    cursor = parent;
  }
}

export interface ConfiguredBlock {
  readonly type: string;
  readonly version: number;
}

/** Block types and versions registered by the project's lace.config.ts, or null when absent. */
export async function loadConfiguredBlocks(
  cwd: string,
): Promise<readonly ConfiguredBlock[] | null> {
  const path = resolve(cwd, "lace.config.ts");
  try {
    await stat(path);
  } catch {
    return null;
  }
  let module: unknown;
  try {
    module = await import(pathToFileURL(path).href);
  } catch {
    throw new BlockError("BLOCK_CONFIG", "Could not load root lace.config.ts.");
  }
  const blocks = (module as { default?: { runtime?: { blocks?: { blocks?: unknown } } } }).default
    ?.runtime?.blocks?.blocks;
  if (!Array.isArray(blocks))
    throw new BlockError("BLOCK_CONFIG", "Invalid root lace.config.ts: no block registry.");
  return blocks
    .filter(
      (block): block is ConfiguredBlock =>
        record(block) && typeof block.type === "string" && Number.isSafeInteger(block.version),
    )
    .map((block) => ({ type: block.type, version: block.version }))
    .sort((a, b) => a.type.localeCompare(b.type));
}

/** Finds the export name of a custom block definition in the recorded definitions module. */
export async function findDefinitionExport(
  root: string,
  definitions: string,
  type: string,
): Promise<{ readonly name: string; readonly fields: Readonly<Record<string, unknown>> }> {
  const path = resolve(root, definitions);
  let module: Record<string, unknown>;
  try {
    module = (await import(pathToFileURL(path).href)) as Record<string, unknown>;
  } catch {
    throw new BlockError(
      "BLOCK_CONFIG",
      `Could not load the definitions module ${definitions} recorded in ${LOCK_FILE}.`,
    );
  }
  const matches = Object.keys(module)
    .filter((name) => name !== "default")
    .filter((name) => {
      const value = module[name];
      return record(value) && value.type === type && typeof value.validate === "function";
    })
    .sort();
  if (matches.length !== 1)
    throw new BlockError(
      "BLOCK_CONFIG",
      matches.length === 0
        ? `The definitions module ${definitions} does not export a definition for block "${type}". Export the same defineBlock value lace.config.ts registers.`
        : `The definitions module ${definitions} exports several definitions for block "${type}": ${matches.join(", ")}.`,
    );
  const name = matches[0] as string;
  const fields = (module[name] as { fields?: unknown }).fields;
  return { name, fields: record(fields) ? fields : {} };
}

/** POSIX import specifier from one site file to another site-relative module. */
export function importSpecifier(fromFile: string, toModule: string): string {
  const path = relative(dirname(fromFile), toModule).split(sep).join("/");
  return path.startsWith(".") ? path : `./${path}`;
}
