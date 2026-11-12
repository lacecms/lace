import { resolve } from "node:path";
import { readUpgradeManifest, UpgradeError } from "./upgrade-input.js";
import { atomicWrite, inputFailure, jsonBytes } from "./upgrade-files.js";
import { latestPath, loadOperation, transactionPath } from "./upgrade-journal.js";
import { acquireUpgradeLock } from "./upgrade-lock.js";
import { inspectSavedState, installSavedState } from "./upgrade-apply.js";
import type { UpgradeOutcome } from "./upgrade-apply.js";
import type { UpgradeCheckpoint } from "./upgrade-record.js";

export async function rollbackUpgrade(options: {
  readonly project: string;
  readonly checkpoint?: UpgradeCheckpoint;
}): Promise<UpgradeOutcome> {
  const project = resolve(options.project);
  await readUpgradeManifest(project);
  if ((await loadOperation(project)) === null)
    inputFailure("No recorded upgrade exists to roll back.");
  const release = await acquireUpgradeLock(project);
  try {
    const saved = await loadOperation(project);
    if (saved === null) inputFailure("No recorded upgrade exists to roll back.");
    const outcome = {
      fromVersion: saved.operation.target.templateVersion,
      toVersion: JSON.parse(saved.oldBytes.toString("utf8")).templateVersion as string,
      instructions: saved.operation.instructions,
      recoveryPath: transactionPath(saved.pointer.id),
      conflictPath: null,
    };
    if (saved.pointer.phase === "rolled-back") return { ...outcome, status: "already-rolled-back" };
    await inspectSavedState(project, saved, true);
    await atomicWrite(
      project,
      latestPath,
      jsonBytes({ ...saved.pointer, phase: "rolling-back" }),
      0o600,
      undefined,
      saved.pointer.id,
    );
    await options.checkpoint?.("rollback-recorded");
    await installSavedState(
      project,
      { ...saved, pointer: { ...saved.pointer, phase: "rolling-back" } },
      true,
      options.checkpoint,
    );
    return { ...outcome, status: "rolled-back" };
  } catch (error) {
    if (error instanceof UpgradeError) throw error;
    throw new UpgradeError(
      "UPGRADE_APPLY",
      "Rollback failed. Preserve .lace/upgrade/ and repeat --rollback after resolving filesystem access.",
    );
  } finally {
    await release();
  }
}
