import {
  planConfigurationSynchronization,
  renderConfigurationSyncPlanJson,
} from "@lacecms/application";
import type {
  ApplyConfigurationSynchronizationInput,
  ConfigurationSyncPlan,
  StoredContentModelState,
} from "@lacecms/application";
import { staleSynchronizationPlan } from "./block-migration-scan.js";
import { sameStoredModelStates } from "./model-state.js";

/** Revalidate the exact reviewed report against the state the adapter just read. */
export function prepareConfigurationSync(
  input: ApplyConfigurationSynchronizationInput,
  current: readonly StoredContentModelState[],
): ConfigurationSyncPlan {
  if (!input.plan.isValid || !sameStoredModelStates(input.expectedStoredModels, current))
    staleSynchronizationPlan();
  const report = planConfigurationSynchronization({
    evidence: input.evidence,
    models: input.models,
    storedModels: current,
  });
  if (
    !report.isValid ||
    renderConfigurationSyncPlanJson(input.plan) !== renderConfigurationSyncPlanJson(report)
  )
    staleSynchronizationPlan();
  return report;
}
