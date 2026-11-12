import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { dirname, join, parse, resolve, sep } from "node:path";
import { readUpgradeFile, upgradeHash, UpgradeError } from "./upgrade-input.js";

export const jsonBytes = (value: unknown): Buffer =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
export const hashOrAbsent = (bytes: Buffer | undefined): string | null =>
  bytes === undefined ? null : upgradeHash(bytes);
export function inputFailure(message: string): never {
  throw new UpgradeError("UPGRADE_INPUT", message);
}
export function recoveryFailure(message: string): never {
  throw new UpgradeError(
    "UPGRADE_RECOVERY",
    `${message} Inspect .lace/upgrade/; repeat matching --apply or --rollback after resolving the reported state.`,
  );
}
export function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    return inputFailure(`${label} is not valid JSON.`);
  }
}
export function shape(value: unknown, names: string[]): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...names].sort().join(",")
  );
}

export function inspectInventory(paths: readonly string[]): void {
  const prefixes = new Map<string, string>();
  const unique = [...new Set(paths)];
  for (const path of unique) {
    const parts = path.split("/");
    for (let count = 1; count <= parts.length; count++) {
      const prefix = parts.slice(0, count).join("/"),
        key = prefix.toLowerCase();
      if (prefixes.has(key) && prefixes.get(key) !== prefix)
        inputFailure("Upgrade inventories contain case-aliased path components.");
      prefixes.set(key, prefix);
    }
    if (unique.some((other) => other.toLowerCase().startsWith(`${path.toLowerCase()}/`)))
      inputFailure("Unsupported upgrade file/directory transition.");
  }
}

/** Inspect existing components even for a missing leaf; never follow a symlink. */
export async function inspectDirectory(path: string, create = false): Promise<void> {
  const absolute = resolve(path);
  let cursor = parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(sep)) {
    cursor = join(cursor, part);
    let stat;
    try {
      stat = await lstat(cursor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (!create) return;
      try {
        await mkdir(cursor, { mode: 0o700 });
      } catch (failure) {
        if ((failure as NodeJS.ErrnoException).code !== "EEXIST") throw failure;
      }
      stat = await lstat(cursor);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink())
      inputFailure("Upgrade directory paths must not contain symbolic links or non-directories.");
    const entries = await readdir(dirname(cursor));
    if (entries.some((entry) => entry !== part && entry.toLowerCase() === part.toLowerCase()))
      inputFailure("Upgrade directory paths contain case aliases.");
  }
}

export async function inspectDestination(root: string, path: string): Promise<void> {
  await inspectDirectory(dirname(join(root, path)));
  await readUpgradeFile(root, path);
  try {
    const entries = await readdir(dirname(join(root, path)));
    const name = path.split("/").at(-1)!;
    if (entries.some((entry) => entry !== name && entry.toLowerCase() === name.toLowerCase()))
      inputFailure(`Upgrade destination contains case aliases: ${path}.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function inspectRoots(project: string, template: string): Promise<void> {
  await inspectDirectory(project);
  await inspectDirectory(template);
  const a = resolve(project),
    b = resolve(template);
  if (a === b || a.startsWith(`${b}${sep}`) || b.startsWith(`${a}${sep}`))
    inputFailure(
      "Installed project and target template must be separate non-overlapping directories.",
    );
}

export async function modeOf(root: string, path: string): Promise<number | null> {
  const bytes = await readUpgradeFile(root, path);
  return bytes === undefined ? null : (await lstat(join(root, path))).mode & 0o777;
}

export async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EBADF"].includes((error as NodeJS.ErrnoException).code ?? ""))
      throw error;
  } finally {
    await handle.close();
  }
}

/** Exclusive files also protect staging data from accidental reuse. */
export async function writeExclusive(
  root: string,
  path: string,
  bytes: Buffer,
  mode = 0o600,
): Promise<void> {
  await inspectDestination(root, path);
  await inspectDirectory(dirname(join(root, path)), true);
  const handle = await open(
    join(root, path),
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    mode,
  );
  try {
    await handle.writeFile(bytes);
    await handle.chmod(mode);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(dirname(join(root, path)));
}

export async function atomicWrite(
  root: string,
  path: string,
  bytes: Buffer,
  mode = 0o600,
  expected?: string | null,
  temporaryId?: string,
  staged?: () => void | Promise<void>,
): Promise<void> {
  await inspectDestination(root, path);
  const temporary = `${path}.lace-${temporaryId ?? randomUUID()}.tmp`;
  try {
    // A recorded operation owns this reserved temporary name across process restarts.
    if (temporaryId !== undefined && (await readUpgradeFile(root, temporary)) !== undefined)
      await unlink(join(root, temporary));
    await writeExclusive(root, temporary, bytes, mode);
    await staged?.();
    await inspectDestination(root, path);
    if (expected !== undefined && hashOrAbsent(await readUpgradeFile(root, path)) !== expected)
      recoveryFailure(`Unexpected file state: ${path}.`);
    await rename(join(root, temporary), join(root, path));
    await syncDirectory(dirname(join(root, path)));
  } finally {
    const leftovers = await readUpgradeFile(root, temporary);
    if (leftovers !== undefined) await unlink(join(root, temporary));
  }
}
