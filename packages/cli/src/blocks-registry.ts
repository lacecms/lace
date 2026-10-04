import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export class BlockError extends Error {
  public constructor(
    readonly code:
      | "BLOCK_USAGE"
      | "BLOCK_INPUT"
      | "BLOCK_REGISTRY"
      | "BLOCK_FRAMEWORK"
      | "BLOCK_CONFIG",
    message: string,
  ) {
    super(message);
    this.name = "BlockError";
  }
}

export const SUPPORTED_FRAMEWORKS = ["astro"] as const;
export const RESERVED_FRAMEWORKS = ["react", "vue", "svelte"] as const;
export type Framework = (typeof SUPPORTED_FRAMEWORKS)[number];

export interface RegistryFile {
  readonly source: string;
  readonly target: string;
  readonly role: "component";
  readonly bytes: Buffer;
}
export interface RegistryItem {
  readonly name: string;
  readonly framework: string;
  readonly blockType: string;
  readonly blockVersion: number;
  readonly revision: number;
  readonly requires: Readonly<Record<string, string>>;
  readonly files: readonly RegistryFile[];
  readonly dependencies: readonly string[];
}
export interface Registry {
  readonly items: ReadonlyMap<string, RegistryItem>;
}

const NAME = /^[A-Za-z][A-Za-z0-9-]{0,63}$/u;
const PACKAGE = /^@?[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)?$/u;
export const itemKey = (framework: string, name: string): string => `${framework}/${name}`;

function broken(message: string): never {
  throw new BlockError("BLOCK_REGISTRY", `Bundled block registry is invalid: ${message}`);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

/** Relative POSIX path without traversal, used for registry sources and targets. */
export function safeRelativePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= 256 &&
    !path.startsWith("/") &&
    !/[\\:\0]/u.test(path) &&
    path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}

async function readJson(url: URL, label: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(url, "utf8");
  } catch {
    return broken(`${label} is missing.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return broken(`${label} is not valid JSON.`);
  }
}

export const bundledRegistryRoot = new URL("./registry/", import.meta.url);

export async function loadRegistry(root: URL = bundledRegistryRoot): Promise<Registry> {
  const index = await readJson(new URL("registry.json", root), "registry.json");
  if (
    !record(index) ||
    !exactKeys(index, ["schemaVersion", "items"]) ||
    !Array.isArray(index.items)
  )
    broken("registry.json has an unsupported shape.");
  if (index.schemaVersion !== 1) broken("registry.json schemaVersion is not 1.");
  const items = new Map<string, RegistryItem>();
  for (const entry of index.items) {
    if (
      !record(entry) ||
      !exactKeys(entry, ["name", "framework", "manifest"]) ||
      typeof entry.name !== "string" ||
      !NAME.test(entry.name) ||
      typeof entry.framework !== "string" ||
      !NAME.test(entry.framework) ||
      !safeRelativePath(entry.manifest)
    )
      broken("registry.json lists an invalid item.");
    const key = itemKey(entry.framework, entry.name);
    if (items.has(key)) broken(`item ${key} is listed twice.`);
    const manifestUrl = new URL(entry.manifest, root);
    const manifest = await readJson(manifestUrl, `item ${key}`);
    if (
      !record(manifest) ||
      !exactKeys(manifest, [
        "schemaVersion",
        "name",
        "framework",
        "blockType",
        "blockVersion",
        "revision",
        "requires",
        "files",
        "dependencies",
      ]) ||
      manifest.schemaVersion !== 1 ||
      manifest.name !== entry.name ||
      manifest.framework !== entry.framework ||
      typeof manifest.blockType !== "string" ||
      !NAME.test(manifest.blockType) ||
      !Number.isSafeInteger(manifest.blockVersion) ||
      (manifest.blockVersion as number) < 1 ||
      !Number.isSafeInteger(manifest.revision) ||
      (manifest.revision as number) < 1 ||
      !record(manifest.requires) ||
      !Object.entries(manifest.requires).every(
        ([name, range]) => PACKAGE.test(name) && typeof range === "string" && range.length > 0,
      ) ||
      !Array.isArray(manifest.files) ||
      !Array.isArray(manifest.dependencies) ||
      !manifest.dependencies.every((name) => typeof name === "string" && NAME.test(name))
    )
      broken(`item ${key} has an invalid manifest.`);
    const files: RegistryFile[] = [];
    for (const file of manifest.files) {
      if (
        !record(file) ||
        !exactKeys(file, ["source", "target", "role"]) ||
        !safeRelativePath(file.source) ||
        !safeRelativePath(file.target) ||
        file.role !== "component" ||
        files.some((other) => other.target.toLowerCase() === (file.target as string).toLowerCase())
      )
        broken(`item ${key} declares an invalid file.`);
      let bytes: Buffer;
      try {
        bytes = await readFile(new URL(file.source, manifestUrl));
      } catch {
        return broken(`item ${key} is missing ${file.source}.`);
      }
      files.push({ source: file.source, target: file.target, role: "component", bytes });
    }
    if (files.length !== 1) broken(`item ${key} must declare exactly one component file.`);
    items.set(key, {
      name: entry.name,
      framework: entry.framework,
      blockType: manifest.blockType as string,
      blockVersion: manifest.blockVersion as number,
      revision: manifest.revision as number,
      requires: { ...(manifest.requires as Record<string, string>) },
      files,
      dependencies: [...(manifest.dependencies as string[])],
    });
  }
  for (const item of items.values())
    for (const dependency of item.dependencies)
      if (!items.has(itemKey(item.framework, dependency)))
        broken(`item ${itemKey(item.framework, item.name)} depends on missing ${dependency}.`);
  return { items };
}

/** Items of one framework, sorted by name. */
export function frameworkItems(registry: Registry, framework: string): readonly RegistryItem[] {
  return [...registry.items.values()]
    .filter((item) => item.framework === framework)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Requested items plus their dependencies, sorted by name; cycles are rejected. */
export function dependencyClosure(
  registry: Registry,
  framework: string,
  names: readonly string[],
): readonly RegistryItem[] {
  const resolved = new Map<string, RegistryItem>();
  const visiting = new Set<string>();
  const visit = (name: string): void => {
    if (resolved.has(name)) return;
    if (visiting.has(name)) broken(`dependency cycle through ${itemKey(framework, name)}.`);
    const item = registry.items.get(itemKey(framework, name));
    if (item === undefined) broken(`missing item ${itemKey(framework, name)}.`);
    visiting.add(name);
    for (const dependency of item.dependencies) visit(dependency);
    visiting.delete(name);
    resolved.set(name, item);
  };
  for (const name of names) visit(name);
  return [...resolved.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const bundledRegistryPath = (): string => fileURLToPath(bundledRegistryRoot);
