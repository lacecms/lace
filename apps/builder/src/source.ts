import { lstat, readFile, readdir, mkdir, open } from "node:fs/promises";
import { constants, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { safeBuildSourcePath, type SiteBuildFailureReason } from "./diagnostics.js";
import { basename, join, relative, resolve, sep } from "node:path";

export interface SourceSelection {
  readonly siteDirectory: string;
  readonly outputDirectory: string;
}

const skipped = new Set([
  ".git",
  "node_modules",
  "dist",
  ".astro",
  ".turbo",
  "coverage",
  "dev-data",
  ".lace-acceptance",
  ".release-artifacts",
  ".npmrc",
  ".pnpmfile.cjs",
  ".aws",
  ".ssh",
  ".agents",
  ".codex",
  ".claude",
  "test-results",
]);

export function validDirectory(value: string, root = false): boolean {
  return (
    (root && value === ".") ||
    (value.length > 0 &&
      value.length <= 1024 &&
      value
        .split("/")
        .every(
          (part) => part !== "." && part !== ".." && /^[A-Za-z0-9_.][A-Za-z0-9_. -]*$/u.test(part),
        ))
  );
}

export class SourceError extends Error {
  readonly path?: string;
  public constructor(
    readonly reason: SiteBuildFailureReason,
    root: string,
    entry?: string,
  ) {
    super(reason);
    const path =
      entry === undefined
        ? undefined
        : safeBuildSourcePath(relative(root, entry).split(sep).join("/"));
    if (path !== undefined) this.path = path;
  }
}
function ioFailure(error: unknown, root: string, entry: string): never {
  if (error instanceof SourceError) throw error;
  const code = (error as NodeJS.ErrnoException)?.code;
  throw new SourceError(
    code === "ENOENT"
      ? "source_missing"
      : code === "EACCES" || code === "EPERM"
        ? "source_unreadable"
        : code === "ELOOP"
          ? "source_symlink"
          : "source_invalid",
    root,
    entry,
  );
}
async function sourceStat(root: string, entry: string) {
  try {
    const stat = await lstat(entry);
    if (stat.isSymbolicLink()) throw new SourceError("source_symlink", root, entry);
    if (!stat.isFile() && !stat.isDirectory())
      throw new SourceError("source_special_file", root, entry);
    return stat;
  } catch (error) {
    ioFailure(error, root, entry);
  }
}
async function regular(root: string, path: string, directory = false): Promise<void> {
  let current = root;
  if (!(await sourceStat(root, root)).isDirectory()) throw new SourceError("source_invalid", root);
  for (const part of path.split("/")) {
    if (part === ".") continue;
    current = join(current, part);
    await sourceStat(root, current);
  }
  const stat = await sourceStat(root, current);
  if (!(directory ? stat.isDirectory() : stat.isFile()))
    throw new SourceError("source_invalid", root, current);
}

export async function validateSource(root: string, selection: SourceSelection): Promise<void> {
  if (!validDirectory(selection.siteDirectory, true) || !validDirectory(selection.outputDirectory))
    throw new SourceError("source_invalid", root);
  await regular(root, "package.json");
  await regular(root, "pnpm-lock.yaml");
  await regular(root, selection.siteDirectory, true);
  await regular(root, join(selection.siteDirectory, "package.json"));
  const packagePath = join(root, selection.siteDirectory, "package.json");
  let site;
  try {
    site = JSON.parse(await readFile(packagePath, "utf8"));
  } catch (error) {
    ioFailure(error, root, packagePath);
  }
  if (typeof (site?.dependencies?.astro ?? site?.devDependencies?.astro) !== "string")
    throw new SourceError("source_invalid", root);
  if (selection.siteDirectory !== ".") {
    await regular(root, "pnpm-workspace.yaml");
    for (const file of ["pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
      try {
        await lstat(join(root, selection.siteDirectory, file));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      throw new SourceError("source_invalid", root);
    }
  }
  // Output is always a descendant of the selected project and cannot replace its source.
  if (
    selection.outputDirectory
      .split("/")
      .some((part) => ["src", "public", "node_modules", ".git", ".lace"].includes(part))
  )
    throw new SourceError("source_invalid", root);
  let output = join(root, selection.siteDirectory);
  for (const part of selection.outputDirectory.split("/")) {
    output = join(output, part);
    try {
      if (!(await sourceStat(root, output)).isDirectory())
        throw new SourceError("source_invalid", root);
    } catch (error) {
      if (error instanceof SourceError && error.reason === "source_missing") break;
      throw error;
    }
  }
}

export async function copySource(
  root: string,
  destination: string,
  selection: SourceSelection,
): Promise<void> {
  await validateSource(root, selection);
  const output = join(selection.siteDirectory, selection.outputDirectory);
  async function copyEntry(source: string, target: string): Promise<void> {
    const name = basename(source);
    const location = relative(root, source);
    const parts = location.split(sep);
    if (
      location === "AGENTS.md" ||
      location === "CLAUDE.md" ||
      location === output ||
      location.startsWith(`${output}${sep}`) ||
      parts.some((part, index) => part === ".lace" && parts[index + 1] === "data") ||
      (source !== root && (skipped.has(name) || name === ".env" || name.startsWith(".env.")))
    )
      return;
    const stat = await sourceStat(root, source);
    if (stat.isDirectory()) {
      let entries: string[];
      try {
        entries = await readdir(source);
      } catch (error) {
        ioFailure(error, root, source);
      }
      await mkdir(target, { recursive: true });
      for (const entry of entries) await copyEntry(join(source, entry), join(target, entry));
    } else {
      let handle;
      try {
        handle = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
      } catch (error) {
        ioFailure(error, root, source);
      }
      try {
        await pipeline(
          handle.createReadStream(),
          createWriteStream(target, { mode: stat.mode & 0o777 }),
        );
      } catch (error) {
        ioFailure(error, root, source);
      } finally {
        await handle.close();
      }
    }
  }
  await copyEntry(root, destination);
  async function verify(entry: string): Promise<void> {
    const stat = await sourceStat(destination, entry);
    if (stat.isDirectory())
      for (const name of await readdir(entry)) await verify(join(entry, name));
  }
  await verify(destination);
  await validateSource(destination, selection);
}

export function disjointRoots(roots: readonly string[]): boolean {
  const paths = roots.map((root) => resolve(root));
  return paths.every((path, index) =>
    paths.every(
      (other, otherIndex) =>
        index === otherIndex || (path !== other && !path.startsWith(`${other}${sep}`)),
    ),
  );
}
