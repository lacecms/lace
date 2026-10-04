import { resolve } from "node:path";
import { decideManagedFile } from "./managed-decision.js";
import type { ManagedAction } from "./managed-decision.js";
import {
  isUserSource,
  readTargetTemplate,
  readUpgradeFile,
  readUpgradeManifest,
  upgradeHash,
  UpgradeError,
} from "./upgrade-input.js";

export type UpgradeAction = ManagedAction;
export interface UpgradeDecision {
  readonly path: string;
  readonly action: UpgradeAction;
  readonly reason: string;
  readonly baselineHash: string | null;
  readonly currentHash: string | null;
  readonly targetHash: string | null;
  readonly diff: string | null;
}
export interface UpgradePlan {
  readonly schemaVersion: 1;
  readonly dryRun: true;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly changes: number;
  readonly conflicts: number;
  readonly decisions: readonly UpgradeDecision[];
}

/** Whole-file unified hunks have linear cost and retain exact newline semantics. */
export function unifiedUpgradeDiff(
  path: string,
  before: Buffer | undefined,
  after: Buffer | undefined,
): string | null {
  if (before?.equals(after ?? Buffer.alloc(0)) && after !== undefined) return null;
  if (before === undefined && after === undefined) return null;
  for (const bytes of [before, after]) {
    if (
      bytes !== undefined &&
      (bytes.some((byte) => (byte < 32 && ![9, 10, 13].includes(byte)) || byte === 127) ||
        !Buffer.from(bytes.toString("utf8")).equals(bytes))
    ) {
      return `Binary files ${before === undefined ? "/dev/null" : `a/${path}`} and ${after === undefined ? "/dev/null" : `b/${path}`} differ\n`;
    }
  }
  const lines = (bytes: Buffer | undefined): string[] => {
    if (bytes === undefined || bytes.length === 0) return [];
    const result = bytes.toString("utf8").split("\n");
    if (result.at(-1) === "") result.pop();
    return result;
  };
  const oldLines = lines(before);
  const newLines = lines(after);
  const hunk = (items: string[], sign: string, bytes: Buffer | undefined): string =>
    items
      .map(
        (line, index) =>
          `${sign}${line}\n${index === items.length - 1 && bytes?.at(-1) !== 10 ? "\\ No newline at end of file\n" : ""}`,
      )
      .join("");
  const header = `--- ${before === undefined ? "/dev/null" : `a/${path}`}\n+++ ${after === undefined ? "/dev/null" : `b/${path}`}\n`;
  if (oldLines.length === 0 && newLines.length === 0) return header;
  return `${header}@@ -${oldLines.length === 0 ? 0 : 1},${oldLines.length} +${newLines.length === 0 ? 0 : 1},${newLines.length} @@\n${hunk(oldLines, "-", before)}${hunk(newLines, "+", after)}`;
}

/** Reads a snapshot only. Applying it later requires rechecking all input hashes. */
export async function planUpgrade(options: {
  readonly project: string;
  readonly template: string;
}): Promise<UpgradePlan> {
  const project = resolve(options.project);
  const template = resolve(options.template);
  const baseline = await readUpgradeManifest(project);
  const target = await readUpgradeManifest(template);
  const targetBytes = await readTargetTemplate(template, target);
  const decisions: UpgradeDecision[] = [];
  const paths = [...new Set([...Object.keys(baseline.files), ...Object.keys(target.files)])].sort();
  // Fail closed on aliases so user ownership remains portable to case-insensitive hosts.
  const normalizedPaths = new Set<string>();
  for (const path of paths) {
    const normalized = path.toLowerCase();
    if (normalizedPaths.has(normalized))
      throw new UpgradeError("UPGRADE_INPUT", "Upgrade inventories contain case-aliased paths.");
    normalizedPaths.add(normalized);
  }
  for (const path of paths) {
    const oldEntry = baseline.files[path];
    const nextEntry = target.files[path];
    const baselineHash = oldEntry?.owner === "managed" ? oldEntry.sha256 : null;
    const targetHash = nextEntry?.owner === "managed" ? nextEntry.sha256 : null;
    if (
      oldEntry?.owner === "user" ||
      isUserSource(path) ||
      (oldEntry === undefined && nextEntry?.owner === "user")
    ) {
      decisions.push({
        path,
        action: "preserve",
        reason: "user-owned",
        baselineHash,
        currentHash: null,
        targetHash,
        diff: null,
      });
      continue;
    }
    const current = await readUpgradeFile(project, path);
    const currentHash = current === undefined ? null : upgradeHash(current);
    const { action, reason } =
      oldEntry?.owner === "managed" && nextEntry?.owner === "user"
        ? { action: "conflict" as const, reason: "ownership-changed" }
        : decideManagedFile({
            tracked: oldEntry !== undefined,
            baselineHash,
            currentHash,
            targetHash,
          });
    const needsDiff =
      ["add", "replace", "remove", "conflict"].includes(action) && reason !== "ownership-changed";
    decisions.push({
      path,
      action,
      reason,
      baselineHash,
      currentHash,
      targetHash,
      diff: needsDiff ? unifiedUpgradeDiff(path, current, targetBytes.get(path)) : null,
    });
  }
  return {
    schemaVersion: 1,
    dryRun: true,
    fromVersion: baseline.templateVersion,
    toVersion: target.templateVersion,
    changes: decisions.filter(({ action }) => ["add", "replace", "remove"].includes(action)).length,
    conflicts: decisions.filter(({ action }) => action === "conflict").length,
    decisions,
  };
}

export function presentUpgradePlan(plan: UpgradePlan): string {
  const lines = [
    `Upgrade dry run: ${plan.fromVersion} -> ${plan.toVersion}`,
    `${plan.changes} change(s), ${plan.conflicts} conflict(s). No files written.`,
  ];
  for (const decision of plan.decisions) {
    lines.push(`${decision.action} ${decision.path}: ${decision.reason}`);
    if (decision.baselineHash !== null || decision.targetHash !== null)
      lines.push(
        `  SHA-256 baseline=${decision.baselineHash ?? "absent"} current=${decision.currentHash ?? "absent/unread"} target=${decision.targetHash ?? "absent"}`,
      );
    if (decision.diff !== null)
      lines.push(decision.diff.endsWith("\n") ? decision.diff.slice(0, -1) : decision.diff);
  }
  if (plan.conflicts > 0)
    lines.push("Review conflicts and resolve local changes explicitly before applying an upgrade.");
  return lines.join("\n");
}
