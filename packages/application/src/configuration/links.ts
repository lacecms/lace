import type {
  ConfigurationSyncPlan,
  ConfigurationSyncStateReadPort,
  ConfigurationSyncSingletonEntry,
  ConfigurationSyncLinkRewrite,
  ConfigurationSyncEntryUsage,
  ConfigurationSyncSnapshotMigration,
  ConfigurationSyncReferenceRenames,
  ConfigurationSyncSnapshotReference,
  StoredContentModelState,
} from "./types.js";
import { contentModelKey } from "@lacecms/domain";
import type { NormalizedContentModel } from "@lacecms/config";
import {
  canonicalizeJson,
  collectSnapshotEntryReferences,
  ContentValidationError,
  encodeFieldPath,
} from "@lacecms/content";
import type {
  BlockRegistry,
  FieldVisibility,
  ModelFieldDefinitions,
  SnapshotEntryReference,
} from "@lacecms/content";
import { configurationSyncFieldChanges, transformConfigurationSyncFields } from "./fields.js";
import { referenceBlockDescriptors, referenceSelections } from "./reference-occurrences.js";

export class ConfigurationReferenceProjectionError extends ContentValidationError {
  public constructor(
    public readonly modelKey: string,
    public readonly snapshot: ConfigurationSyncSnapshotReference,
    error: ContentValidationError,
  ) {
    super(error.issues);
  }
}

function projectReferences(
  modelKey: string,
  snapshot: ConfigurationSyncSnapshotReference,
  project: () => readonly SnapshotEntryReference[],
  blockKeys: readonly string[],
) {
  try {
    return project();
  } catch (error) {
    if (!(error instanceof ContentValidationError)) throw error;
    const [issue] = error.issues;
    const pointer = issue === undefined ? undefined : encodeFieldPath(issue.path);
    const blockIndex = issue?.path[0] === "blocks" ? Number(issue.path[1]) : -1;
    const blockKey = blockKeys[blockIndex];
    throw new ConfigurationReferenceProjectionError(
      modelKey,
      {
        ...snapshot,
        ...(pointer === undefined ? {} : { path: pointer }),
        ...(blockKey === undefined ? {} : { blockKey }),
        ...(issue === undefined ? {} : { reason: issue.code }),
      },
      error,
    );
  }
}

function identity(references: readonly ConfigurationSyncEntryUsage[]): string {
  return canonicalizeJson(
    references
      .map((ref) => [
        ref.sourceKey,
        ref.area,
        ref.pointer,
        ref.targetId,
        ref.delivered,
        ref.purpose ?? "url",
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

export function configurationReferenceRenames(
  plan: ConfigurationSyncPlan,
): ConfigurationSyncReferenceRenames {
  return plan.operations.flatMap((operation) =>
    operation.action === "rename" ? [[operation.renamedFrom, operation.model.key] as const] : [],
  );
}

/** Rebuild projections against the prospective fields, blocks and model identities. */
export async function configurationSyncLinkRewrites(input: {
  readonly models: readonly NormalizedContentModel[];
  readonly plan: ConfigurationSyncPlan;
  readonly state: ConfigurationSyncStateReadPort;
  readonly singletons: readonly ConfigurationSyncSingletonEntry[];
  readonly storedModels?: readonly StoredContentModelState[];
  readonly blocks?: BlockRegistry;
  readonly migrated?: ReadonlyMap<string, ConfigurationSyncSnapshotMigration>;
}): Promise<readonly ConfigurationSyncLinkRewrite[]> {
  const result: ConfigurationSyncLinkRewrite[] = [];
  const renames = configurationReferenceRenames(input.plan);
  for (const operation of input.plan.operations) {
    if (operation.action !== "rename" && operation.action !== "version-update") continue;
    if (operation.evolution === undefined) continue;
    const model = input.models.find((model) => model.key === operation.model.key)!;
    const readKey = contentModelKey(
      operation.action === "rename" ? operation.renamedFrom : model.key,
    );
    const baseline = input.storedModels?.find((stored) => stored.key === readKey)?.structure;
    const priorFields = (baseline?.fields ?? model.fields) as ModelFieldDefinitions;
    const oldBlocks = referenceBlockDescriptors(baseline);
    const blocks = referenceBlockDescriptors(model.structure);
    const changes = configurationSyncFieldChanges(operation.evolution.changes);
    const removed = new Set(operation.evolution.blockRemovals ?? []);
    let after: string | undefined;
    do {
      const page = await input.state.readConfigurationSyncSnapshots({
        modelKey: readKey,
        limit: 100,
        ...(after === undefined ? {} : { after }),
      });
      for (const snapshot of page.items) {
        const fields = transformConfigurationSyncFields(
          model.fields,
          changes,
          snapshot.fields,
          snapshot.state,
          model.visibility as FieldVisibility | undefined,
        ).fields;
        const migration = input.migrated?.get(snapshot.snapshotId);
        const migratedData = new Map(migration?.blocks.map((block) => [block.key, block.data]));
        const retained = snapshot.blocks.filter((block) => !removed.has(block.type));
        const references = projectReferences(
          model.key,
          {
            entryId: snapshot.entryId,
            state: snapshot.state,
            title: snapshot.title,
          },
          () =>
            collectSnapshotEntryReferences(
              model.fields,
              fields,
              retained.map((block) => {
                const definition = input.blocks?.get(block.type) ?? blocks.get(block.type);
                return {
                  key: block.key,
                  fields: definition?.fields ?? {},
                  data: migratedData.get(block.key) ?? block.data ?? {},
                  hidden: block.hidden === true,
                  ...(definition?.visibility === undefined
                    ? {}
                    : { visibility: definition.visibility }),
                };
              }),
              model.visibility as FieldVisibility | undefined,
            ),
          retained.map((block) => block.key),
        );
        const prior = snapshot.internalLinks ?? [];
        const selections = referenceSelections({
          references,
          prior,
          priorFields,
          renames,
          changes,
          priorBlockFields: new Map(
            snapshot.blocks.map((block) => {
              const current = blocks.get(block.type);
              const baseline = oldBlocks.get(block.type);
              const descriptor =
                current?.version === block.schemaVersion && baseline?.version !== current.version
                  ? current
                  : (baseline ?? current);
              return [block.key, descriptor?.fields ?? {}];
            }),
          ),
        });
        const changed = identity(references) !== identity(prior);
        const typed = selections.length > 0 || prior.some((row) => row.purpose === "reference");
        if (changed || typed)
          result.push({
            snapshotId: snapshot.snapshotId,
            references,
            ...(changed ? {} : { checkOnly: true }),
            ...(typed
              ? {
                  referenceCheck: {
                    entryId: snapshot.entryId,
                    modelKey: contentModelKey(model.key),
                    snapshotId: snapshot.snapshotId,
                    state: snapshot.state,
                    title: snapshot.title,
                    references,
                    selections,
                  },
                }
              : {}),
          });
      }
      after = page.next;
    } while (after !== undefined);
  }
  for (const singleton of input.singletons) {
    const model = input.models.find((model) => model.key === singleton.modelKey)!;
    const { draft, id } = singleton.entry;
    const references = collectSnapshotEntryReferences(
      model.fields,
      draft.fields,
      [],
      model.visibility as FieldVisibility | undefined,
    );
    const selections = references.flatMap((reference) =>
      reference.purpose === "reference" ? [{ reference, allowMissing: false }] : [],
    );
    if (references.length)
      result.push({
        snapshotId: draft.id,
        references,
        ...(selections.length
          ? {
              referenceCheck: {
                entryId: id,
                modelKey: singleton.modelKey,
                snapshotId: draft.id,
                state: "draft",
                title: draft.title,
                references,
                selections,
              },
            }
          : {}),
      });
  }
  return result;
}
