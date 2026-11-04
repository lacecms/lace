import {
  transformConfigurationSyncFields,
  configurationSyncFieldChanges,
  configurationSyncAdvancesPublicState,
  configurationSyncBackfills,
  contentSyncActor,
  planConfigurationSynchronization,
  renderConfigurationSyncPlanJson,
} from "@lacecms/application";
import type {
  ApplyConfigurationSynchronizationInput,
  ApplyConfigurationSynchronizationResult,
  ApplyConfigurationSyncBlockMigrationsInput,
  ConfigurationSyncMigrationCounts,
  ConfigurationSyncMigrationEntry,
  ConfigurationSyncMigrationPage,
  ConfigurationSyncMigrationScanInput,
  ConfigurationSyncSnapshot,
  ConfigurationSyncSnapshotPage,
  ConfigurationSyncSnapshotScanInput,
  StoredContentModelState,
} from "@lacecms/application";
import { DomainError, mediaId, isSingletonKind } from "@lacecms/domain";
import type {
  ContentBlock,
  ContentEntry,
  DraftMediaReference,
  DraftSnapshot,
  PublishedSnapshot,
} from "@lacecms/domain";

import type { FieldVisibility, JsonValue } from "@lacecms/content";
import { clone } from "../shared/assertions.js";
import {
  copyEntry,
  sameStoredModelStates,
  stateForModel,
  staleMigration,
  entrySnapshots,
  withFieldDefault,
  routeForModel,
} from "./support.js";
import { InMemoryContentStoreMedia } from "./media.js";

export class InMemoryContentStoreSync extends InMemoryContentStoreMedia {
  public async readConfigurationSyncState(): Promise<readonly StoredContentModelState[]> {
    return this.storedModelStates();
  }

  public async readConfigurationSyncSnapshots(
    input: ConfigurationSyncSnapshotScanInput,
  ): Promise<ConfigurationSyncSnapshotPage> {
    const all: ConfigurationSyncSnapshot[] = [...this.entries.values()]
      .filter((entry) => entry.model.key === input.modelKey)
      .flatMap((entry) =>
        entrySnapshots(entry).map((snapshot) => ({
          blocks: snapshot.blocks.map(
            ({ key, schemaVersion, type, data, settings, hidden }: ContentBlock) => ({
              data: clone(data),
              settings: clone(settings),
              hidden,
              key,
              schemaVersion,
              type,
            }),
          ),
          entryId: entry.id,
          fields: clone(snapshot.fields),
          references: clone(this.references.get(snapshot.id) ?? []),
          hasSeo: snapshot.seo !== undefined,
          revision: snapshot.revision,
          snapshotId: snapshot.id,
          state: snapshot.state,
          title: snapshot.title,
        })),
      )
      .filter((snapshot) => snapshot.snapshotId > (input.after ?? ""))
      .sort((left, right) => (left.snapshotId < right.snapshotId ? -1 : 1));
    const items = all.slice(0, input.limit);
    const last = items.at(-1);
    return Object.freeze({
      items: Object.freeze(items),
      ...(all.length > input.limit && last !== undefined ? { next: last.snapshotId } : {}),
    });
  }

  public async readConfigurationSyncMigrationEntries(
    input: ConfigurationSyncMigrationScanInput,
  ): Promise<ConfigurationSyncMigrationPage> {
    const types = new Map(input.targets.map((target) => [target.type, target.version]));
    const stale = (snapshot: DraftSnapshot | PublishedSnapshot | undefined): boolean =>
      snapshot?.blocks.some(
        (block) => types.has(block.type) && types.get(block.type) !== block.schemaVersion,
      ) === true;
    const matching = [...this.entries.values()]
      .filter(
        (entry) =>
          entry.model.key === input.modelKey &&
          entry.id > (input.after ?? "") &&
          (stale(entry.draft) || stale(entry.published)),
      )
      .sort((left, right) => (left.id < right.id ? -1 : 1));
    const view = (snapshot: DraftSnapshot | PublishedSnapshot) =>
      Object.freeze({
        blocks: snapshot.blocks.map((block) => ({
          data: clone(block.data),
          hidden: block.hidden,
          key: block.key,
          position: block.position,
          schemaVersion: block.schemaVersion,
          ...(types.has(block.type) ? { settings: clone(block.settings) } : {}),
          type: block.type,
        })),
        fields: clone(snapshot.fields),
        references: clone(this.references.get(snapshot.id) ?? []),
        revision: snapshot.revision,
        snapshotId: snapshot.id,
        state: snapshot.state,
        title: snapshot.title,
      });
    const items: ConfigurationSyncMigrationEntry[] = matching.slice(0, input.limit).map((entry) =>
      Object.freeze({
        draft: view(entry.draft),
        entryId: entry.id,
        ...(entry.published === undefined ? {} : { published: view(entry.published) }),
      }),
    );
    const last = items.at(-1);
    return Object.freeze({
      items: Object.freeze(items),
      ...(matching.length > input.limit && last !== undefined ? { next: last.entryId } : {}),
    });
  }

  public async applyConfigurationSyncBlockMigrations(
    input: ApplyConfigurationSyncBlockMigrationsInput,
  ): Promise<ConfigurationSyncMigrationCounts> {
    const counts = { blocks: 0, drafts: 0, published: 0 };
    for (const unit of input.units) {
      const entry = this.entries.get(unit.entryId);
      if (entry === undefined) throw staleMigration();
      let next: ContentEntry = entry;
      const references = new Map<string, readonly DraftMediaReference[]>();
      for (const migration of unit.snapshots) {
        const snapshot = migration.state === "draft" ? next.draft : next.published;
        if (
          snapshot === undefined ||
          snapshot.id !== migration.snapshotId ||
          snapshot.revision !== migration.expectedRevision ||
          (migration.draftGuard !== undefined &&
            (next.draft.id !== migration.draftGuard.snapshotId ||
              next.draft.revision !== migration.draftGuard.revision)) ||
          migration.blocks.some(
            (block) =>
              snapshot.blocks.find((stored) => stored.key === block.key)?.schemaVersion !==
              block.expectedSchemaVersion,
          )
        ) {
          throw staleMigration();
        }
        this.assertActiveReferences(migration.references as readonly DraftMediaReference[]);
        const migrated = new Map(migration.blocks.map((block) => [block.key, block]));
        const rewritten = Object.freeze({
          ...snapshot,
          blocks: Object.freeze(
            snapshot.blocks.map((block) => {
              const value = migrated.get(block.key);
              return value === undefined
                ? block
                : Object.freeze({
                    ...block,
                    data: clone(value.data),
                    schemaVersion: value.schemaVersion,
                    settings: clone(value.settings),
                  });
            }),
          ),
          revision: migration.revision,
          updatedAt: input.migratedAt,
          ...(migration.updatedBy === undefined ? {} : { updatedBy: contentSyncActor }),
        });
        references.set(snapshot.id, [
          ...(this.references.get(snapshot.id) ?? []).filter(
            (reference) => !migrated.has(reference.sourceKey),
          ),
          ...(clone(migration.references) as readonly DraftMediaReference[]),
        ]);
        next = Object.freeze(
          migration.state === "draft"
            ? { ...next, draft: rewritten as DraftSnapshot }
            : { ...next, published: rewritten as PublishedSnapshot },
        );
        counts.blocks += migration.blocks.length;
        counts[migration.state === "draft" ? "drafts" : "published"] += 1;
      }
      this.entries.set(next.id, next);
      for (const [snapshotId, values] of references) this.references.set(snapshotId, values);
    }
    return Object.freeze(counts);
  }

  public async applyConfigurationSynchronization(
    input: ApplyConfigurationSynchronizationInput,
  ): Promise<ApplyConfigurationSynchronizationResult> {
    const current = this.storedModelStates();
    const actualPlan = planConfigurationSynchronization({
      evidence: input.evidence,
      models: input.models,
      storedModels: current,
    });
    if (
      !input.plan.isValid ||
      !sameStoredModelStates(input.expectedStoredModels, current) ||
      renderConfigurationSyncPlanJson(input.plan) !== renderConfigurationSyncPlanJson(actualPlan)
    ) {
      throw new DomainError(
        "CONTENT_INVALID_STATE",
        "Configuration synchronization plan is stale.",
      );
    }
    if (!actualPlan.requiresApply) {
      return Object.freeze({ operations: Object.freeze([]), status: "noop" });
    }

    const models = new Map(input.models.map((model) => [model.key, model]));
    const singletonEntries = new Map(
      input.singletonEntries.map((page) => [page.modelKey, page.entry]),
    );
    const nextStates = new Map(this.modelStates);
    const nextEntries = new Map(this.entries);
    const nextReferences = new Map(this.references);
    for (const operation of actualPlan.operations) {
      if (operation.action === "create") {
        const currentModel = models.get(operation.model.key);
        if (currentModel === undefined) {
          throw new DomainError("CONTENT_INVALID_STATE", "Synchronization model is unavailable.");
        }
        nextStates.set(operation.model.key, stateForModel(operation.model, currentModel));
        if (isSingletonKind(currentModel.kind)) {
          const entry = singletonEntries.get(operation.model.key);
          if (
            entry === undefined ||
            entry.model.key !== operation.model.key ||
            nextEntries.has(entry.id)
          ) {
            throw new DomainError(
              "CONTENT_INVALID_STATE",
              "Singleton synchronization entry is invalid.",
            );
          }
          nextEntries.set(entry.id, copyEntry(entry));
        }
        continue;
      }
      if (operation.action === "remove") {
        nextStates.delete(operation.model.key);
        continue;
      }
      const currentModel = models.get(operation.model.key);
      if (currentModel === undefined) {
        throw new DomainError("CONTENT_INVALID_STATE", "Synchronization model is unavailable.");
      }
      const previousKey =
        operation.action === "rename" ? operation.renamedFrom : operation.model.key;
      const previous = nextStates.get(previousKey);
      if (previous === undefined) {
        throw new DomainError(
          "CONTENT_INVALID_STATE",
          "Synchronization model is no longer available.",
        );
      }
      nextStates.delete(previousKey);
      nextStates.set(operation.model.key, stateForModel(operation.model, currentModel));
      if (operation.action === "rename") {
        for (const [entryId, entry] of nextEntries) {
          if (entry.model.key !== previousKey) continue;
          nextEntries.set(
            entryId,
            Object.freeze({ ...copyEntry(entry), model: routeForModel(currentModel) }),
          );
        }
      }
      const evolution =
        operation.action === "version-update" || operation.action === "rename"
          ? operation.evolution
          : undefined;
      if (evolution?.recursiveFields) {
        const definitions = currentModel.fields;
        const changes = configurationSyncFieldChanges(evolution.changes);
        const removed = new Set(evolution.blockRemovals ?? []);
        for (const [entryId, entry] of nextEntries) {
          if (entry.model.key !== operation.model.key) continue;
          function rewrite(snapshot: DraftSnapshot): DraftSnapshot;
          function rewrite(snapshot: PublishedSnapshot): PublishedSnapshot;
          function rewrite(
            snapshot: DraftSnapshot | PublishedSnapshot,
          ): DraftSnapshot | PublishedSnapshot {
            const result = transformConfigurationSyncFields(
              definitions,
              changes,
              snapshot.fields,
              snapshot.state,
              currentModel?.visibility as FieldVisibility | undefined,
            );
            const kept = (nextReferences.get(snapshot.id) ?? []).filter(
              (reference) =>
                reference.sourceKey !== "$fields" &&
                !snapshot.blocks.some(
                  (block) => removed.has(block.type) && block.key === reference.sourceKey,
                ),
            );
            nextReferences.set(snapshot.id, [
              ...kept,
              ...result.references.map((reference) => ({
                ...reference,
                mediaId: mediaId(reference.mediaId),
                sourceKey: "$fields" as const,
              })),
            ]);
            return Object.freeze({
              ...snapshot,
              fields: result.fields,
              blocks: snapshot.blocks.filter((block) => !removed.has(block.type)),
            });
          }
          nextEntries.set(
            entryId,
            Object.freeze({
              ...entry,
              draft: rewrite(entry.draft),
              ...(entry.published === undefined ? {} : { published: rewrite(entry.published) }),
            }),
          );
        }
      }
      if (evolution?.seoRemoval === true) {
        for (const [entryId, entry] of nextEntries) {
          if (entry.model.key !== operation.model.key) continue;
          const withoutSeo = <Snapshot extends DraftSnapshot | PublishedSnapshot>(
            snapshot: Snapshot,
          ): Snapshot => {
            const { seo: _seo, ...rest } = snapshot;
            const references = nextReferences.get(snapshot.id);
            if (references !== undefined) {
              nextReferences.set(
                snapshot.id,
                Object.freeze(references.filter((reference) => reference.sourceKey !== "$seo")),
              );
            }
            return Object.freeze(rest) as Snapshot;
          };
          nextEntries.set(
            entryId,
            Object.freeze({
              ...entry,
              draft: withoutSeo(entry.draft),
              ...(entry.published === undefined ? {} : { published: withoutSeo(entry.published) }),
            }),
          );
        }
      }
      for (const backfill of evolution?.recursiveFields
        ? []
        : configurationSyncBackfills(operation, currentModel)) {
        const value = JSON.parse(backfill.json) as JsonValue;
        for (const [entryId, entry] of nextEntries) {
          if (entry.model.key !== operation.model.key) continue;
          nextEntries.set(
            entryId,
            Object.freeze({
              ...entry,
              draft: withFieldDefault(entry.draft, backfill.fieldKey, value),
              ...(entry.published === undefined
                ? {}
                : { published: withFieldDefault(entry.published, backfill.fieldKey, value) }),
            }),
          );
        }
      }
    }
    for (const rewrite of input.linkRewrites ?? [])
      this.linkReferences.set(rewrite.snapshotId, clone(rewrite.references));
    this.modelStates = nextStates;
    this.entries = nextEntries;
    this.references.clear();
    for (const [snapshotId, references] of nextReferences)
      this.references.set(snapshotId, references);
    if (!configurationSyncAdvancesPublicState(actualPlan)) {
      return Object.freeze({ operations: actualPlan.operations, status: "applied" });
    }
    this.publicVersion += 1;
    this.configurationSyncBuildRequests.push(this.publicVersion);
    return Object.freeze({
      operations: actualPlan.operations,
      status: "applied",
      targetVersion: this.publicVersion,
    });
  }
}
