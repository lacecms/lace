import { randomUUID } from "node:crypto";
import { lstat, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { readUpgradeFile, UpgradeError } from "./upgrade-input.js";
import { inspectDirectory, jsonBytes, syncDirectory, writeExclusive } from "./upgrade-files.js";
import type { UpgradePlan } from "./upgrade.js";

async function inspectBundle(root: string, path: string): Promise<Map<string, Buffer> | null> {
  await inspectDirectory(join(root, path));
  try {
    await lstat(join(root, path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const files = new Map<string, Buffer>();
  async function visit(relative: string, prefix: string): Promise<void> {
    await inspectDirectory(join(root, relative));
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const next = `${relative}/${entry.name}`,
        key = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await visit(next, `${key}/`);
      else {
        const bytes = await readUpgradeFile(root, next);
        if (bytes !== undefined) files.set(key, bytes);
      }
    }
  }
  await visit(path, "");
  return files;
}

export async function publishUpgradeConflicts(
  project: string,
  plan: UpgradePlan,
  targetBytes: ReadonlyMap<string, Buffer>,
): Promise<string> {
  const path = `.lace/conflicts/${plan.toVersion}`;
  const conflicts = plan.decisions.filter((entry) => entry.action === "conflict");
  const files = new Map<string, Buffer>([
    [
      "index.json",
      jsonBytes({
        schemaVersion: 1,
        fromVersion: plan.fromVersion,
        toVersion: plan.toVersion,
        conflicts: conflicts.map((entry) => ({
          ...entry,
          proposed: targetBytes.has(entry.path) ? `proposed/${entry.path}` : null,
          resolution:
            entry.reason === "ownership-changed"
              ? "ownership-transfer"
              : entry.targetHash === null
                ? "deletion"
                : "replacement",
        })),
      }),
    ],
  ]);
  for (const entry of conflicts) {
    const bytes = targetBytes.get(entry.path);
    if (bytes !== undefined) files.set(`proposed/${entry.path}`, bytes);
    if (entry.diff !== null) files.set(`diffs/${entry.path}.diff`, Buffer.from(entry.diff));
  }
  const existing = await inspectBundle(project, path);
  if (existing !== null) {
    if (
      existing.size !== files.size ||
      [...files].some(([key, bytes]) => !existing.get(key)?.equals(bytes))
    )
      throw new UpgradeError(
        "UPGRADE_APPLY",
        `Conflict artifacts differ at ${path}; preserve/move the existing review bundle before retrying. No working files changed.`,
      );
    return path;
  }
  const staging = `.lace/conflicts/.stage-${randomUUID()}`;
  try {
    for (const [key, bytes] of files) await writeExclusive(project, `${staging}/${key}`, bytes);
    await inspectDirectory(join(project, path));
    await rename(join(project, staging), join(project, path));
    await syncDirectory(join(project, ".lace/conflicts"));
  } finally {
    await rm(join(project, staging), { recursive: true, force: true });
  }
  return path;
}
