import type {
  ConfigurationSyncDiagnostic,
  ConfigurationSyncReferenceCheck,
  ConfigurationSyncReferenceInspection,
  ConfigurationSyncStateReadPort,
} from "./types.js";
import { DomainError } from "@lacecms/domain";
import { diagnostic } from "./diagnostics.js";

const explanations: Readonly<Record<string, string>> = {
  reference_cycle: "would create a cycle between entries",
  reference_graph_limit: "exceeds the reference graph work limit",
  reference_target_missing: "selects an entry that no longer exists",
  reference_target_model: "selects an entry outside the allowed models",
  reference_target_unpublished: "selects an entry without a current publication",
};

export async function reviewSyncReferences(
  state: ConfigurationSyncStateReadPort,
  input: ConfigurationSyncReferenceInspection,
): Promise<readonly ConfigurationSyncDiagnostic[]> {
  if (input.checks.length === 0) return [];
  if (state.inspectConfigurationSyncReferences === undefined)
    throw new DomainError(
      "CONTENT_INVALID_STATE",
      "Configuration reference checking is unavailable.",
    );
  const issues = await state.inspectConfigurationSyncReferences(input);
  return issues.map((issue) => {
    const check: ConfigurationSyncReferenceCheck = input.checks[issue.index]!;
    const row = check.references.find(
      (item) =>
        item.purpose === "reference" &&
        item.targetId === issue.targetId &&
        (check.state === "draft" || item.delivered),
    );
    const source = issue.sourceKey ?? row?.sourceKey;
    const pointer = issue.pointer ?? row?.pointer;
    const path =
      pointer === undefined ? undefined : (source === "$fields" ? "/fields" : "/data") + pointer;
    const stages = input.sequence === true && issue.code === "reference_cycle";
    const direction = stages
      ? " Split the migration into stages that remove the blocking dependencies before adding their replacements."
      : "";
    return diagnostic(
      stages ? "REFERENCE_SYNC_STAGES_REQUIRED" : "REFERENCE_SYNC_INVALID",
      check.modelKey,
      `The ${check.state} reference ${explanations[issue.code] ?? "cannot be validated"}.${direction}`,
      {
        snapshots: [
          {
            entryId: check.entryId,
            state: check.state,
            title: check.title,
            ...(source === undefined || source === "$fields" ? {} : { blockKey: source }),
            ...(path === undefined ? {} : { path }),
            reason: issue.code,
          },
        ],
      },
    );
  });
}
