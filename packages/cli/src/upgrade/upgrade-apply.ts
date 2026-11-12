import { rmdir, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  assertSameSite,
  readTargetTemplate,
  readUpgradeFile,
  readUpgradeManifest,
  UpgradeError,
} from "./upgrade-input.js";
import {
  atomicWrite,
  hashOrAbsent,
  inspectDestination,
  inspectDirectory,
  inspectInventory,
  inspectRoots,
  jsonBytes,
  modeOf,
  recoveryFailure,
  syncDirectory,
} from "./upgrade-files.js";
import { latestPath, loadOperation, mergedManifest } from "./upgrade-journal.js";
import type { SavedOperation } from "./upgrade-journal.js";
import { readUpgradeInstructions } from "./upgrade-instructions.js";
import type { UpgradeInstructions } from "./upgrade-instructions.js";
import { acquireUpgradeLock } from "./upgrade-lock.js";
import { publishUpgradeConflicts } from "./upgrade-conflicts.js";
import { recordUpgrade } from "./upgrade-record.js";
import type { UpgradeCheckpoint } from "./upgrade-record.js";
import { planUpgrade } from "./upgrade.js";
import type { UpgradePlan } from "./upgrade.js";

export interface UpgradeOutcome {
  readonly status:
    | "applied"
    | "already-current"
    | "resumed"
    | "conflicts"
    | "rolled-back"
    | "already-rolled-back";
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly instructions: UpgradeInstructions | null;
  readonly recoveryPath: string | null;
  readonly conflictPath: string | null;
  readonly plan?: UpgradePlan;
}
export interface ApplyOptions {
  readonly project: string;
  readonly template: string;
  readonly checkpoint?: UpgradeCheckpoint;
}

export async function inspectSavedState(
  project: string,
  saved: SavedOperation,
  rollback: boolean,
): Promise<void> {
  const { operation } = saved;
  const manifestHash = hashOrAbsent(await readUpgradeFile(project, ".lace/manifest.json"));
  if (manifestHash !== operation.oldManifestHash && manifestHash !== operation.newManifestHash)
    recoveryFailure("Installed manifest matches neither saved checkpoint.");
  if ((await modeOf(project, ".lace/manifest.json")) !== operation.manifestMode)
    recoveryFailure("Installed manifest permissions changed after inspection.");
  for (const entry of operation.entries) {
    await inspectDestination(project, entry.path);
    const hash = hashOrAbsent(await readUpgradeFile(project, entry.path));
    const mode = await modeOf(project, entry.path);
    if (
      !(
        (hash === entry.beforeHash && mode === entry.beforeMode) ||
        (hash === entry.afterHash && mode === entry.afterMode)
      )
    )
      recoveryFailure(`Unexpected file bytes or permissions: ${entry.path}.`);
  }
  if (!rollback)
    for (const guard of operation.guards) {
      await inspectDestination(project, guard.path);
      if (hashOrAbsent(await readUpgradeFile(project, guard.path)) !== guard.hash)
        recoveryFailure(`Unexpected preserved/current path: ${guard.path}.`);
    }
}

export async function installSavedState(
  project: string,
  saved: SavedOperation,
  rollback: boolean,
  checkpoint?: UpgradeCheckpoint,
  verifyInputs?: () => Promise<void>,
): Promise<void> {
  const verifyCompletedFiles = async (): Promise<void> => {
    await inspectSavedState(project, saved, rollback);
    for (const entry of saved.operation.entries)
      if (
        hashOrAbsent(await readUpgradeFile(project, entry.path)) !==
          (rollback ? entry.beforeHash : entry.afterHash) ||
        (await modeOf(project, entry.path)) !== (rollback ? entry.beforeMode : entry.afterMode)
      )
        recoveryFailure(
          `Operation incomplete or file changed before manifest commit: ${entry.path}.`,
        );
  };
  await inspectSavedState(project, saved, rollback);
  for (const [index, entry] of saved.operation.entries.entries()) {
    const current = hashOrAbsent(await readUpgradeFile(project, entry.path));
    const desiredHash = rollback ? entry.beforeHash : entry.afterHash;
    const desiredBytes = rollback ? saved.before[index] : saved.after[index];
    const desiredMode = rollback ? entry.beforeMode : entry.afterMode;
    if (current !== desiredHash || (await modeOf(project, entry.path)) !== desiredMode) {
      await checkpoint?.("before-file", entry.path);
      await verifyInputs?.();
      await inspectSavedState(project, saved, rollback);
      const expected = rollback ? entry.afterHash : entry.beforeHash;
      if (desiredBytes === undefined) {
        await inspectDestination(project, entry.path);
        if (hashOrAbsent(await readUpgradeFile(project, entry.path)) !== expected)
          recoveryFailure(`Unexpected file state before removal: ${entry.path}.`);
        await unlink(join(project, entry.path));
        await syncDirectory(dirname(join(project, entry.path)));
      } else {
        await atomicWrite(
          project,
          entry.path,
          desiredBytes,
          desiredMode!,
          expected,
          saved.operation.id,
          async () => {
            await checkpoint?.("temporary-file", entry.path);
            await verifyInputs?.();
            await inspectSavedState(project, saved, rollback);
          },
        );
      }
    }
    // Even already-installed files may have a recorded temporary leftover after termination.
    const temporary = `${entry.path}.lace-${saved.operation.id}.tmp`;
    if ((await readUpgradeFile(project, temporary)) !== undefined)
      await unlink(join(project, temporary));
    await checkpoint?.("after-file", entry.path);
  }
  await verifyCompletedFiles();
  if (rollback) {
    for (const directory of [...saved.operation.directories].sort((a, b) => b.length - a.length)) {
      await inspectDirectory(join(project, directory));
      try {
        await rmdir(join(project, directory));
      } catch (error) {
        if (
          !["ENOENT", "ENOTEMPTY", "EEXIST"].includes((error as NodeJS.ErrnoException).code ?? "")
        )
          throw error;
      }
    }
  }
  await checkpoint?.("before-manifest");
  await verifyInputs?.();
  await verifyCompletedFiles();
  const current = hashOrAbsent(await readUpgradeFile(project, ".lace/manifest.json"));
  const desired = rollback ? saved.operation.oldManifestHash : saved.operation.newManifestHash;
  if (current !== desired)
    await atomicWrite(
      project,
      ".lace/manifest.json",
      rollback ? saved.oldBytes : saved.newBytes,
      saved.operation.manifestMode,
      current,
      saved.operation.id,
      async () => {
        await checkpoint?.("temporary-manifest");
        await verifyInputs?.();
        await verifyCompletedFiles();
      },
    );
  await checkpoint?.("after-manifest");
  await verifyCompletedFiles();
  const manifestTemporary = `.lace/manifest.json.lace-${saved.operation.id}.tmp`;
  if ((await readUpgradeFile(project, manifestTemporary)) !== undefined)
    await unlink(join(project, manifestTemporary));
  await atomicWrite(
    project,
    latestPath,
    jsonBytes({ ...saved.pointer, phase: rollback ? "rolled-back" : "applied" }),
    0o600,
    undefined,
    saved.operation.id,
  );
}

export async function applyUpgrade(options: ApplyOptions): Promise<UpgradeOutcome> {
  const project = resolve(options.project),
    template = resolve(options.template);
  await inspectRoots(project, template);
  // Invalid target/instruction input is rejected before acquiring any persistent metadata.
  const target = await readUpgradeManifest(template);
  const instructions = await readUpgradeInstructions(template, target.templateVersion);
  await readTargetTemplate(template, target);
  const installed = await readUpgradeManifest(project);
  assertSameSite(installed, target);
  inspectInventory([...Object.keys(installed.files), ...Object.keys(target.files)]);
  const release = await acquireUpgradeLock(project);
  try {
    const verifyTarget = async (): Promise<void> => {
      const currentTarget = await readUpgradeManifest(template);
      const currentInstructions = await readUpgradeInstructions(
        template,
        currentTarget.templateVersion,
      );
      await readTargetTemplate(template, currentTarget);
      if (
        JSON.stringify(currentTarget) !== JSON.stringify(target) ||
        JSON.stringify(currentInstructions) !== JSON.stringify(instructions)
      )
        recoveryFailure("Target changed after inspection.");
    };
    const prior = await loadOperation(project);
    if (prior?.pointer.phase === "rolling-back")
      recoveryFailure(
        "Rollback is unfinished; repeat --rollback to complete its recorded direction.",
      );
    if (prior?.pointer.phase === "applying") {
      if (
        JSON.stringify(prior.operation.target) !== JSON.stringify(target) ||
        JSON.stringify(prior.operation.instructions) !== JSON.stringify(instructions)
      )
        recoveryFailure("Requested target differs from the pending upgrade.");
      await installSavedState(project, prior, false, options.checkpoint, verifyTarget);
      return {
        status: "resumed",
        fromVersion: JSON.parse(prior.oldBytes.toString("utf8")).templateVersion as string,
        toVersion: target.templateVersion,
        instructions,
        recoveryPath: `.lace/upgrade/transactions/${prior.pointer.id}`,
        conflictPath: null,
      };
    }
    await verifyTarget();
    const manifestBefore = hashOrAbsent(await readUpgradeFile(project, ".lace/manifest.json"));
    const plan = await planUpgrade({ project, template });
    if (hashOrAbsent(await readUpgradeFile(project, ".lace/manifest.json")) !== manifestBefore)
      recoveryFailure("Installed manifest changed during planning.");
    if (plan.conflicts > 0) {
      const bytes = await readTargetTemplate(template, target);
      await verifyTarget();
      const conflictPath = await publishUpgradeConflicts(project, plan, bytes);
      return {
        status: "conflicts",
        fromVersion: plan.fromVersion,
        toVersion: plan.toVersion,
        instructions,
        conflictPath,
        recoveryPath: null,
        plan,
      };
    }
    const baseline = await readUpgradeManifest(project);
    if (
      plan.changes === 0 &&
      JSON.stringify(baseline) === JSON.stringify(mergedManifest(baseline, target))
    )
      return {
        status: "already-current",
        fromVersion: plan.fromVersion,
        toVersion: plan.toVersion,
        instructions,
        recoveryPath: prior === null ? null : `.lace/upgrade/transactions/${prior.pointer.id}`,
        conflictPath: null,
        plan,
      };
    const saved = await recordUpgrade(project, template, plan, instructions, options.checkpoint);
    if (saved.operation.oldManifestHash !== manifestBefore)
      recoveryFailure("Installed manifest changed after planning.");
    await installSavedState(project, saved, false, options.checkpoint, verifyTarget);
    return {
      status: "applied",
      fromVersion: plan.fromVersion,
      toVersion: plan.toVersion,
      instructions,
      recoveryPath: `.lace/upgrade/transactions/${saved.pointer.id}`,
      conflictPath: null,
      plan,
    };
  } catch (error) {
    if (error instanceof UpgradeError) throw error;
    throw new UpgradeError(
      "UPGRADE_APPLY",
      "Upgrade apply failed. Preserve .lace/upgrade/; inspect the pending state, then repeat matching --apply or use --rollback.",
    );
  } finally {
    await release();
  }
}
