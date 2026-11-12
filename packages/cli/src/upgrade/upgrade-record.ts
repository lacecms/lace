import { randomUUID } from "node:crypto";
import { lstat, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  readTargetTemplate,
  readUpgradeFile,
  readUpgradeManifest,
  upgradeHash,
} from "./upgrade-input.js";
import {
  atomicWrite,
  hashOrAbsent,
  inspectDestination,
  jsonBytes,
  modeOf,
  parseJson,
  recoveryFailure,
  syncDirectory,
  writeExclusive,
} from "./upgrade-files.js";
import {
  latestPath,
  loadOperation,
  mergedManifest,
  transactionPath,
  validateOperation,
} from "./upgrade-journal.js";
import type { Entry, Guard, Operation, SavedOperation } from "./upgrade-journal.js";
import type { UpgradePlan } from "./upgrade.js";
import type { UpgradeInstructions } from "./upgrade-instructions.js";

/** Internal operation checkpoints are injectable for deterministic failure/process tests. */
export type UpgradeCheckpoint = (point: string, path?: string) => void | Promise<void>;

export async function recordUpgrade(
  project: string,
  template: string,
  plan: UpgradePlan,
  instructions: UpgradeInstructions | null,
  checkpoint?: UpgradeCheckpoint,
): Promise<SavedOperation> {
  const oldBytes = (await readUpgradeFile(project, ".lace/manifest.json"))!;
  const old = await readUpgradeManifest(project),
    target = await readUpgradeManifest(template);
  if (old.templateVersion !== plan.fromVersion || target.templateVersion !== plan.toVersion)
    recoveryFailure("Manifests changed after planning.");
  const targetBytes = await readTargetTemplate(template, target);
  const next = mergedManifest(old, target);
  const newBytes = JSON.stringify(old) === JSON.stringify(next) ? oldBytes : jsonBytes(next);
  const entries: Entry[] = [],
    guards: Guard[] = [],
    directories: string[] = [];
  const before: (Buffer | undefined)[] = [],
    after: (Buffer | undefined)[] = [];
  for (const decision of plan.decisions) {
    if (decision.reason === "user-owned") continue;
    await inspectDestination(project, decision.path);
    const current = await readUpgradeFile(project, decision.path);
    const oldEntry = old.files[decision.path],
      nextEntry = target.files[decision.path];
    if (
      hashOrAbsent(current) !== decision.currentHash ||
      (oldEntry?.owner === "managed" ? oldEntry.sha256 : null) !== decision.baselineHash ||
      (nextEntry?.owner === "managed" ? nextEntry.sha256 : null) !== decision.targetHash
    )
      recoveryFailure(`Inputs changed after planning: ${decision.path}.`);
    if (!["add", "replace", "remove"].includes(decision.action)) {
      guards.push({ path: decision.path, hash: decision.currentHash });
      continue;
    }
    const mode = await modeOf(project, decision.path);
    const proposed = targetBytes.get(decision.path);
    entries.push({
      path: decision.path,
      beforeHash: decision.currentHash,
      afterHash: decision.targetHash,
      beforeMode: mode,
      afterMode: proposed === undefined ? null : (mode ?? (await modeOf(template, decision.path))),
    });
    before.push(current);
    after.push(proposed);
    const parts = decision.path.split("/");
    for (let length = 1; length < parts.length; length++) {
      const directory = parts.slice(0, length).join("/");
      try {
        await lstat(join(project, directory));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        if (!directories.includes(directory)) directories.push(directory);
      }
    }
  }
  const id = randomUUID();
  const pointer = { schemaVersion: 1, id, phase: "applying" } as const;
  const operation: Operation = {
    schemaVersion: 1,
    id,
    oldManifestHash: upgradeHash(oldBytes),
    newManifestHash: upgradeHash(newBytes),
    target,
    instructions,
    manifestMode: (await modeOf(project, ".lace/manifest.json"))!,
    entries,
    guards,
    directories,
  };
  validateOperation(operation, pointer, oldBytes, newBytes);
  const final = transactionPath(id),
    staging = `.lace/upgrade/transactions/.stage-${id}`;
  try {
    await checkpoint?.("before-journal");
    await writeExclusive(project, `${staging}/old-manifest.json`, oldBytes);
    await writeExclusive(project, `${staging}/new-manifest.json`, newBytes);
    await writeExclusive(project, `${staging}/operation.json`, jsonBytes(operation));
    for (const [index, entry] of entries.entries()) {
      if (entry.beforeHash !== null)
        await writeExclusive(project, `${staging}/before/${index}`, before[index]!);
      if (entry.afterHash !== null)
        await writeExclusive(project, `${staging}/after/${index}`, after[index]!);
      await checkpoint?.("staged-file", entry.path);
    }
    if (
      hashOrAbsent(await readUpgradeFile(project, ".lace/manifest.json")) !==
      operation.oldManifestHash
    )
      recoveryFailure("Installed manifest changed while staging.");
    await rename(join(project, staging), join(project, final));
    await syncDirectory(join(project, ".lace/upgrade/transactions"));
    await atomicWrite(project, latestPath, jsonBytes(pointer), 0o600, undefined, id);
    await checkpoint?.("journal-published");
  } finally {
    await rm(join(project, staging), { recursive: true, force: true });
  }
  const saved = await loadOperation(project);
  if (!saved || saved.pointer.id !== id)
    recoveryFailure("Recorded operation could not be reloaded.");
  // Validate exact saved bytes before the caller performs any working-file mutation.
  if (
    JSON.stringify(parseJson(saved.oldBytes, "Saved manifest")) !==
    JSON.stringify(parseJson(oldBytes, "Installed manifest"))
  )
    recoveryFailure("Saved old manifest mismatch.");
  return saved;
}
