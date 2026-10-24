import { contentModelKey } from "@lacecms/domain";
import type { NormalizedContentModel } from "@lacecms/config";
import { canonicalizeJson, collectSnapshotInternalLinks } from "@lacecms/content";
import type { InternalLinkReference, ModelFieldDefinitions } from "@lacecms/content";
import type {
  ConfigurationSyncPlan,
  ConfigurationSyncStateReadPort,
  ConfigurationSyncSingletonEntry,
} from "./configuration-sync.js";
import {
  configurationSyncFieldChanges,
  transformConfigurationSyncFields,
} from "./configuration-fields.js";

export interface ConfigurationSyncLinkRewrite {
  readonly snapshotId: string;
  readonly references: readonly InternalLinkReference[];
}
function identity(references: readonly InternalLinkReference[]): string {
  return canonicalizeJson(
    references
      .map((ref) => [ref.sourceKey, ref.area, ref.pointer, ref.targetId, ref.delivered])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}
/** Rebuild only changed projections against the exact prospective schema and content. */
export async function configurationSyncLinkRewrites(input: {
  readonly models: readonly NormalizedContentModel[];
  readonly plan: ConfigurationSyncPlan;
  readonly state: ConfigurationSyncStateReadPort;
  readonly singletons: readonly ConfigurationSyncSingletonEntry[];
}): Promise<readonly ConfigurationSyncLinkRewrite[]> {
  const result: ConfigurationSyncLinkRewrite[] = [];
  for (const operation of input.plan.operations) {
    if (operation.action !== "rename" && operation.action !== "version-update") continue;
    if (operation.evolution === undefined) continue;
    const model = input.models.find((model) => model.key === operation.model.key)!;
    const metadata = model.structure?.blockDefinitions as
      | readonly { readonly type: string; readonly fields: ModelFieldDefinitions }[]
      | undefined;
    const blocks = new Map((metadata ?? []).map((block) => [block.type, block.fields]));
    const removed = new Set(operation.evolution.blockRemovals ?? []);
    let after: string | undefined;
    do {
      const page = await input.state.readConfigurationSyncSnapshots({
        modelKey: contentModelKey(
          operation.action === "rename" ? operation.renamedFrom : model.key,
        ),
        limit: 100,
        ...(after === undefined ? {} : { after }),
      });
      for (const snapshot of page.items) {
        const fields = transformConfigurationSyncFields(
          model.fields,
          configurationSyncFieldChanges(operation.evolution.changes),
          snapshot.fields,
          snapshot.state,
        ).fields;
        const references = collectSnapshotInternalLinks(
          model.fields,
          fields,
          snapshot.blocks
            .filter((block) => !removed.has(block.type))
            .map((block) => ({
              key: block.key,
              fields: blocks.get(block.type) ?? {},
              data: block.data ?? {},
              hidden: block.hidden === true,
            })),
        );
        if (identity(references) !== identity(snapshot.internalLinks ?? []))
          result.push({ snapshotId: snapshot.snapshotId, references });
      }
      after = page.next;
    } while (after !== undefined);
  }
  for (const singleton of input.singletons) {
    const model = input.models.find((model) => model.key === singleton.modelKey)!;
    const references = collectSnapshotInternalLinks(model.fields, singleton.entry.draft.fields, []);
    if (references.length) result.push({ snapshotId: singleton.entry.draft.id, references });
  }
  return result;
}
