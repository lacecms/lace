import type {
  ConfigurationSyncChange,
  ConfigurationSyncOperation,
  ConfigurationSyncPlan,
  ConfigurationSyncReport,
} from "./types.js";
import type { JsonObject } from "@lacecms/content";

import { reportedStoredModel, countsDescription } from "./plan-support.js";
import { checkConfigurationSynchronization } from "./plan.js";
function reportedOperation(operation: ConfigurationSyncOperation): JsonObject {
  if (operation.action !== "incompatible-change" && operation.action !== "blocked-removal") {
    return operation as unknown as JsonObject;
  }
  return { ...operation, stored: reportedStoredModel(operation.stored) } as unknown as JsonObject;
}

export function renderConfigurationSyncPlanJson(plan: ConfigurationSyncPlan): string {
  return JSON.stringify({ ...plan, operations: plan.operations.map(reportedOperation) });
}

function changeLine(change: ConfigurationSyncChange): string {
  const details: string[] = [];
  if (change.from !== undefined) details.push(`from ${change.from}`);
  if (change.hinted === true) details.push("hinted");
  if (change.migration !== undefined)
    details.push(`version ${change.migration.from.join(",")} -> ${change.migration.to}`);
  if (change.properties !== undefined) details.push(change.properties.join(", "));
  if (change.affected !== undefined)
    details.push(`affected: ${countsDescription(change.affected)}`);
  if (change.violations !== undefined) details.push(`violations: ${change.violations}`);
  if (change.backfill !== undefined)
    details.push(`backfill: ${countsDescription(change.backfill)}`);
  const suffix = details.length === 0 ? "" : ` (${details.join("; ")})`;
  return `    ${change.class} ${change.kind} ${change.scope} ${change.target}${suffix}`;
}

export function renderConfigurationSyncPlanText(plan: ConfigurationSyncPlan): string {
  const lines = [
    `Configuration synchronization: ${plan.isValid ? "valid" : "invalid"}`,
    `Apply required: ${plan.requiresApply ? "yes" : "no"}`,
    "Operations:",
  ];
  if (plan.operations.length === 0) lines.push("- none");
  for (const operation of plan.operations) {
    const rename = operation.action === "rename" ? ` from ${operation.renamedFrom}` : "";
    lines.push(
      `- ${operation.action} ${operation.model.key}${rename}${operation.action === "label-update" ? ` (public impact: ${operation.affectsPublicProjection !== false})` : ""}`,
    );
    const evolution =
      operation.action === "version-update" ||
      operation.action === "rename" ||
      operation.action === "incompatible-change"
        ? operation.evolution
        : undefined;
    if (evolution === undefined) continue;
    lines.push(`  snapshots: ${countsDescription(evolution.snapshots)}`);
    for (const change of evolution.changes) lines.push(changeLine(change));
    if (evolution.renames !== undefined) {
      const renames = evolution.renames.map((rename) => `${rename.from} -> ${rename.to}`);
      lines.push(`  planned renames: ${renames.join(", ")}`);
    }
    if (evolution.fieldRemovals !== undefined) {
      lines.push(`  planned field removals: ${evolution.fieldRemovals.join(", ")}`);
    }
    if (evolution.blockRemovals !== undefined) {
      lines.push(`  planned block removals: ${evolution.blockRemovals.join(", ")}`);
    }
    if (evolution.seoRemoval === true) lines.push("  planned SEO removal: all snapshots");
    if (evolution.migrations !== undefined) {
      const migrations = evolution.migrations.map(
        (migration) =>
          `${migration.blockType} ${migration.fromVersions.join(",")} -> ${migration.toVersion} (draft=${migration.draft}, published=${migration.published}, blocks=${migration.blocks})`,
      );
      lines.push(`  planned block migrations: ${migrations.join(", ")}`);
    }
    if (evolution.backfills.length > 0) {
      lines.push(`  planned backfills: ${evolution.backfills.join(", ")}`);
    }
  }
  lines.push("Diagnostics:");
  if (plan.diagnostics.length === 0) lines.push("- none");
  for (const value of plan.diagnostics) {
    const related = value.relatedModelKey === undefined ? "" : ` (${value.relatedModelKey})`;
    lines.push(`- [${value.code}] ${value.modelKey}${related}: ${value.message}`);
    for (const snapshot of value.snapshots ?? []) {
      const block =
        snapshot.blockKey === undefined
          ? ""
          : ` block ${snapshot.blockKey}${snapshot.schemaVersion === undefined ? "" : ` v${snapshot.schemaVersion}`}`;
      const at = snapshot.path === undefined || snapshot.path === "" ? "" : ` at ${snapshot.path}`;
      const cause = snapshot.reason === undefined ? "" : `: ${snapshot.reason}`;
      lines.push(
        `    ${snapshot.state} ${snapshot.entryId} "${snapshot.title}"${block}${at}${cause}`,
      );
    }
    if (
      value.snapshots !== undefined &&
      value.affectedCount !== undefined &&
      value.affectedCount > value.snapshots.length
    ) {
      lines.push(`    … and ${value.affectedCount - value.snapshots.length} more`);
    }
  }
  return lines.join("\n");
}

export function reportConfigurationSynchronization(
  plan: ConfigurationSyncPlan,
): ConfigurationSyncReport {
  return Object.freeze({
    check: checkConfigurationSynchronization(plan),
    json: renderConfigurationSyncPlanJson(plan),
    text: renderConfigurationSyncPlanText(plan),
  });
}
