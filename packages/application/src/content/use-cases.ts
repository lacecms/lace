import { authorizeContentOperation } from "./authority.js";
import { resolveCollectionQuery, validateListQueryBudget } from "./collection-queries.js";
import type { ListQueryLimits } from "./collection-queries.js";
import type { NormalizedContentModel } from "@lacecms/config";
import {
  toBlockMetadata,
  detachFieldMedia,
  FIELD_KEY_SOURCE,
  sha256CanonicalJson,
} from "@lacecms/content";
import type { JsonValue } from "@lacecms/content";

/**
 * Thrown by the content use cases when a submitted or published aggregate
 * fails content validation; its issues carry stable codes and paths.
 */
export { ContentValidationError } from "@lacecms/content";
import {
  DomainError,
  CollectionQueryValidationError,
  isContentSlug,
  isSingletonKind,
  auditActor,
  assertCollectionEntryOperation,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  requirePermission,
  requirePublishedSnapshot,
  contentPublicPath,
} from "@lacecms/domain";
import type {
  Actor,
  ContentEntry,
  ContentEntryId,
  DraftSnapshot,
  EntrySeo,
  PublishedSnapshot,
} from "@lacecms/domain";
import {
  CONTENT_ENTRY_SORTS,
  CONTENT_ENTRY_STATUSES,
  DEFAULT_CONTENT_ENTRY_SORT,
} from "../ports/content.js";
import { publicationIdempotencyKey, publicationRequestFingerprint } from "../shared/brands.js";
import type { ActorSummary } from "../shared/actors.js";
import type {
  ContentCommandResult,
  SaveCompleteDraftInput,
  ContentEntryListPage,
  ContentEntrySort,
  ContentEntryStatus,
} from "../ports/content.js";
import type { PublicationIdempotencyKey } from "../shared/brands.js";
import { contentModelRoute } from "../shared/model-route.js";
import { siteBuildEvent } from "../ports/outbox.js";
import { validateDraft } from "./draft-validation.js";
import {
  entryReferenceCandidate,
  publishedProjection,
  snapshotEntryReferences,
} from "./publication-projection.js";

import type {
  ContentUseCaseDependencies,
  ContentModelDiscovery,
  AdminContentEntryProjection,
  CreateContentEntryUseCaseInput,
  ListContentEntriesUseCaseInput,
  DescribeActorUseCaseInput,
  LoadContentEntryUseCaseInput,
  SaveContentDraftUseCaseInput,
  PublishContentEntryUseCaseInput,
  UnpublishContentEntryUseCaseInput,
  RevertContentDraftUseCaseInput,
  DuplicateContentEntryUseCaseInput,
  DetachMediaFromDraftUseCaseInput,
  DeleteContentEntryUseCaseInput,
  PublishContentEntryUseCaseResult,
  UnpublishContentEntryUseCaseResult,
} from "./use-case-inputs.js";
import {
  duplicateTitle,
  type NormalizedDraft,
  seoEnabled,
  detached,
  systemTitle,
} from "./draft-normalization.js";
const FIELD_SORT_PATTERN = new RegExp(`^-?field:${FIELD_KEY_SOURCE}$`, "u");

function commandEntry(result: ContentCommandResult): ContentEntry {
  if (result.entry === undefined) {
    throw new DomainError("CONTENT_INVALID_STATE", "Content command did not return an entry.");
  }
  return detached(result.entry);
}

/**
 * Portable orchestration for content lifecycle commands. Transport handlers and
 * persistence adapters remain outside this service.
 */
export class ContentUseCases {
  public readonly listQueryLimits: ListQueryLimits;
  /** Memoized `declaresFieldVisibility` per model key and block type; config is fixed. */
  private readonly visibilityOwners = new Map<string, boolean>();
  public constructor(private readonly dependencies: ContentUseCaseDependencies) {
    if (dependencies.listQueryLimits == null)
      throw new TypeError("Content list-query limits are required.");
    this.listQueryLimits = Object.freeze({ ...dependencies.listQueryLimits });
  }

  public discoverModels(input: { readonly actor: Actor }): ContentModelDiscovery {
    authorizeContentOperation(input.actor, "discoverModels");
    return detached({
      items: this.dependencies.config.content.map((model) => ({
        key: model.key,
        kind: model.kind,
        version: model.version,
        fields: model.fields,
        blocks: model.blocks,
        blockDefinitions: model.blocks.map((type) => {
          const definition = this.dependencies.config.blocks.get(type);
          if (!definition)
            throw new DomainError(
              "CONTENT_INVALID_STATE",
              "Configured block metadata is unavailable.",
            );
          return toBlockMetadata(definition);
        }),
        ...(model.label === undefined ? {} : { label: model.label }),
        ...(model.description === undefined ? {} : { description: model.description }),
        ...(model.icon === undefined ? {} : { icon: model.icon }),
        ...(model.layout === undefined ? {} : { layout: model.layout }),
        ...(model.visibility === undefined ? {} : { visibility: model.visibility }),
        ...(model.kind === "page" ? { path: model.path } : {}),
        ...(model.kind === "collection"
          ? {
              route: model.route,
              ...(model.listFields === undefined ? {} : { listFields: model.listFields }),
              ...(model.listOptions === undefined ? {} : { listOptions: model.listOptions }),
            }
          : {}),
        ...(model.kind !== "global" && model.seo !== undefined ? { seo: model.seo } : {}),
        ...(model.kind === "global" && model.seoDefaults !== undefined
          ? { seoDefaults: model.seoDefaults }
          : {}),
      })),
      listQueryLimits: this.listQueryLimits,
    });
  }

  /** Full authorized admin read, including safe attribution and SEO visibility. */
  public async loadAdminEntry(
    input: LoadContentEntryUseCaseInput,
  ): Promise<AdminContentEntryProjection | null> {
    authorizeContentOperation(input.actor, "load");
    const entry = await this.dependencies.content.load({ entryId: input.entryId });
    return entry === null ? null : this.adminProjection(entry);
  }

  /** Prepares the same read projection after a create/save without adapter lookups. */
  public async projectAdminEntry(input: {
    readonly actor: Actor;
    readonly entry: ContentEntry;
  }): Promise<AdminContentEntryProjection> {
    authorizeContentOperation(input.actor, "load");
    return this.adminProjection(input.entry);
  }

  /** Shared publication enrichment for REST and MCP, using safe admin metadata. */
  public async projectPublicationResult(input: {
    readonly actor: Actor;
    readonly result: PublishContentEntryUseCaseResult;
  }): Promise<
    PublishContentEntryUseCaseResult & Pick<AdminContentEntryProjection, "seo" | "updatedBy">
  > {
    authorizeContentOperation(input.actor, "publish");
    const projection = await this.adminProjection(input.result.entry);
    return { ...input.result, seo: projection.seo, updatedBy: projection.updatedBy };
  }

  private async adminProjection(entry: ContentEntry): Promise<AdminContentEntryProjection> {
    const model = this.model(entry.model.key);
    return detached({
      entry,
      updatedBy: await this.actorSummary(entry.draft.updatedBy.id),
      seo: seoEnabled(model),
    });
  }

  private async actorSummary(id: Actor["id"]): Promise<ActorSummary> {
    const [summary] = await this.dependencies.content.describeActors([id]);
    if (!summary || summary.id !== id)
      throw new DomainError("CONTENT_INVALID_STATE", "Actor description is unavailable.");
    return { id: summary.id, displayName: summary.displayName };
  }

  public async create(input: CreateContentEntryUseCaseInput): Promise<ContentEntry> {
    authorizeContentOperation(input.actor, "create");
    const model = this.model(input.modelKey);
    const draft = await validateDraft(
      this.dependencies,
      { ...input, title: systemTitle(model, input.title) },
      model,
      "draft",
    );
    const references = entryReferenceCandidate(model, draft.entryReferences);
    const now = this.dependencies.clock.now();
    const id = contentEntryId(this.dependencies.idGenerator.next());
    const entry = createContentEntry({
      draft: {
        ...draft,
        createdAt: now,
        entryId: id,
        id: contentSnapshotId(this.dependencies.idGenerator.next()),
        revision: 1,
        state: "draft",
        updatedAt: now,
        updatedBy: auditActor(input.actor),
      },
      id,
      model: contentModelRoute(model),
    });
    return commandEntry(
      await this.dependencies.content.create({
        entry,
        ...(references === undefined ? {} : { entryReferences: references }),
        mediaReferences: draft.mediaReferences,
        internalLinks: draft.internalLinks,
      }),
    );
  }

  public async list(input: ListContentEntriesUseCaseInput): Promise<ContentEntryListPage> {
    authorizeContentOperation(input.actor, "list");
    const model = this.model(input.modelKey);
    const q = input.q?.trim();
    if (
      input.status !== undefined &&
      !CONTENT_ENTRY_STATUSES.includes(input.status as ContentEntryStatus)
    ) {
      throw new DomainError("CONTENT_INVALID_STATE", "Entry status filter is unsupported.");
    }
    if (
      input.sort !== undefined &&
      !CONTENT_ENTRY_SORTS.includes(input.sort as ContentEntrySort) &&
      !FIELD_SORT_PATTERN.test(input.sort)
    ) {
      throw new DomainError("CONTENT_INVALID_STATE", "Entry sort is unsupported.");
    }
    if (input.slug !== undefined && (isSingletonKind(model.kind) || !isContentSlug(input.slug)))
      throw new CollectionQueryValidationError("/slug");
    // A request without sort uses the collection's configured default.
    const sort =
      (input.sort as ContentEntrySort | undefined) ??
      (model.kind === "collection" ? model.listOptions?.defaultSort : undefined) ??
      DEFAULT_CONTENT_ENTRY_SORT;
    const query = resolveCollectionQuery(model, sort, input.filters, this.listQueryLimits);
    validateListQueryBudget(q, [], this.listQueryLimits);
    return detached(
      await this.dependencies.content.list({
        ...(query === undefined ? {} : { query }),
        ...(input.after === undefined ? {} : { after: input.after }),
        limit: input.limit,
        listQueryLimits: this.listQueryLimits,
        listFields: model.kind === "collection" ? [...(model.listFields ?? [])] : [],
        modelKey: contentModelKey(model.key),
        ...(q === undefined || q.length === 0 ? {} : { q }),
        ...(input.slug === undefined ? {} : { slug: input.slug }),
        sort,
        ...(input.status === undefined ? {} : { status: input.status as ContentEntryStatus }),
      }),
    );
  }

  /** Resolves an audit actor's display name so clients never need the users API. */
  public async describeActor(input: DescribeActorUseCaseInput): Promise<ActorSummary> {
    authorizeContentOperation(input.actor, "describeActor");
    return this.actorSummary(input.actorId);
  }

  public async load(input: LoadContentEntryUseCaseInput): Promise<ContentEntry | null> {
    authorizeContentOperation(input.actor, "load");
    const entry = await this.dependencies.content.load({ entryId: input.entryId });
    return entry === null ? null : detached(entry);
  }

  public async loadDraft(input: LoadContentEntryUseCaseInput): Promise<DraftSnapshot | null> {
    authorizeContentOperation(input.actor, "loadDraft");
    const draft = await this.dependencies.content.loadDraft({ entryId: input.entryId });
    return draft === null ? null : detached(draft);
  }

  public async loadPublished(
    input: LoadContentEntryUseCaseInput,
  ): Promise<PublishedSnapshot | null> {
    authorizeContentOperation(input.actor, "loadPublished");
    const published = await this.dependencies.content.loadPublished({ entryId: input.entryId });
    return published === null ? null : detached(published);
  }

  public async save(input: SaveContentDraftUseCaseInput): Promise<ContentEntry> {
    authorizeContentOperation(input.actor, "save");
    const entry = await this.entry(input.entryId);
    return commandEntry(
      await this.dependencies.content.saveCompleteDraft(await this.draftWrite(entry, input)),
    );
  }

  private async draftWrite(
    entry: Pick<ContentEntry, "id" | "model">,
    input: SaveContentDraftUseCaseInput,
  ): Promise<SaveCompleteDraftInput> {
    const model = this.model(entry.model.key);
    const draft = await validateDraft(
      this.dependencies,
      { ...input, title: systemTitle(model, input.title) },
      model,
      "draft",
    );
    const references = entryReferenceCandidate(model, draft.entryReferences);
    return {
      entryId: entry.id,
      ...(references === undefined ? {} : { entryReferences: references }),
      internalLinks: draft.internalLinks,
      mutation: {
        ...draft,
        expectedRevision: input.expectedRevision,
        updatedAt: this.dependencies.clock.now(),
        updatedBy: auditActor(input.actor),
      },
    };
  }

  public async publish(
    input: PublishContentEntryUseCaseInput,
  ): Promise<PublishContentEntryUseCaseResult> {
    authorizeContentOperation(input.actor, "publish");
    const entry = await this.entry(input.entryId);
    const model = this.model(entry.model.key);
    const draft = await validateDraft(this.dependencies, entry.draft, model, "publish", entry.id);
    contentPublicPath(entry.model, draft.slug);
    const projected = publishedProjection(this.dependencies, this.visibilityOwners, model, draft);
    const { entryReferences, ...projection } = projected ?? draft;
    const references = entryReferenceCandidate(
      model,
      entryReferences,
      draft.entryReferences.some((row) => row.purpose === "reference"),
    );
    // A projection belongs to one draft revision; never attach it to another.
    if (
      projected !== undefined &&
      entry.draft.revision !== input.expectedRevision &&
      input.idempotencyKey === undefined
    )
      throw new DomainError(
        "CONTENT_REVISION_CONFLICT",
        "The draft revision no longer matches the expected revision.",
      );
    const publishedAt = this.dependencies.clock.now();
    const publishedSnapshotId = contentSnapshotId(this.dependencies.idGenerator.next());
    const result = await this.dependencies.content.publish({
      events: [
        siteBuildEvent({
          reason: "publication",
          requestedAt: publishedAt,
          requestedBy: input.actor.id,
          publishedSnapshotId,
        }),
      ],
      entryId: entry.id,
      expectedRevision: input.expectedRevision,
      ...(references === undefined ? {} : { entryReferences: references }),
      ...(projected === undefined ? {} : { projection }),
      ...(input.idempotencyKey === undefined
        ? {}
        : { idempotency: await this.idempotency(input, draft) }),
      publishedAt,
      publishedBy: auditActor(input.actor),
      publishedSnapshotId,
    });
    return {
      build:
        result.outcome === "replayed"
          ? { status: "not-dispatched" }
          : { status: "queued", targetVersion: result.targetVersion },
      entry: detached(result.entry),
      publication: result.outcome,
    };
  }

  public async unpublish(
    input: UnpublishContentEntryUseCaseInput,
  ): Promise<UnpublishContentEntryUseCaseResult> {
    authorizeContentOperation(input.actor, "unpublish");
    const entry = await this.entry(input.entryId);
    const idempotency =
      input.idempotencyKey === undefined
        ? undefined
        : {
            actorId: input.actor.id,
            fingerprint: publicationRequestFingerprint(
              await sha256CanonicalJson({
                actorId: input.actor.id,
                entryId: input.entryId,
                expectedPublishedSnapshotId: input.expectedPublishedSnapshotId,
                operation: "unpublish",
                ...(input.linkImpact === undefined ? {} : { linkImpact: { ...input.linkImpact } }),
              }),
            ),
            key: publicationIdempotencyKey(input.idempotencyKey),
          };
    // A keyed retry after success must reach the adapter so it can replay.
    if (idempotency === undefined) {
      requirePublishedSnapshot(entry, input.expectedPublishedSnapshotId);
    }
    const unpublishedAt = this.dependencies.clock.now();
    const result = await this.dependencies.content.unpublish({
      events: [
        siteBuildEvent({
          reason: "publication",
          requestedAt: unpublishedAt,
          requestedBy: input.actor.id,
          publishedSnapshotId: input.expectedPublishedSnapshotId,
        }),
      ],
      entryId: entry.id,
      expectedPublishedSnapshotId: input.expectedPublishedSnapshotId,
      ...(input.linkImpact === undefined ? {} : { linkImpact: input.linkImpact }),
      ...(idempotency === undefined ? {} : { idempotency }),
      unpublishedAt,
      unpublishedBy: auditActor(input.actor),
    });
    return {
      build:
        result.outcome === "replayed"
          ? { status: "not-dispatched" }
          : { status: "queued", targetVersion: result.targetVersion },
      entry: detached(result.entry),
      unpublication: result.outcome,
    };
  }

  public async revertDraft(input: RevertContentDraftUseCaseInput): Promise<ContentEntry> {
    authorizeContentOperation(input.actor, "revertDraft");
    const entry = await this.entry(input.entryId);
    const published = requirePublishedSnapshot(entry);
    const model = this.model(entry.model.key);
    const references = entryReferenceCandidate(
      model,
      snapshotEntryReferences(this.dependencies, model, published.fields, published.blocks),
    );
    return commandEntry(
      await this.dependencies.content.revertDraft({
        entryId: entry.id,
        ...(references === undefined ? {} : { entryReferences: references }),
        expectedPublishedSnapshotId: published.id,
        expectedRevision: input.expectedRevision,
        revertedAt: this.dependencies.clock.now(),
        revertedBy: auditActor(input.actor),
      }),
    );
  }

  public async duplicate(input: DuplicateContentEntryUseCaseInput): Promise<ContentEntry> {
    authorizeContentOperation(input.actor, "duplicate");
    const source = await this.entry(input.entryId);
    assertCollectionEntryOperation(source, "duplicate");
    if (input.expectedRevision !== undefined && input.expectedRevision !== source.draft.revision) {
      throw new DomainError(
        "CONTENT_REVISION_CONFLICT",
        "The draft revision no longer matches the expected revision.",
      );
    }
    const model = this.model(source.model.key);
    const draft = await validateDraft(
      this.dependencies,
      {
        blocks: source.draft.blocks.map((block) => ({
          ...block,
          key: blockKey(this.dependencies.idGenerator.next()),
        })),
        fields: source.draft.fields,
        ...(source.draft.seo === undefined ? {} : { seo: source.draft.seo }),
        title: duplicateTitle(source.draft.title),
      },
      model,
      "draft",
    );
    const references = entryReferenceCandidate(model, draft.entryReferences);
    const now = this.dependencies.clock.now();
    const id = contentEntryId(this.dependencies.idGenerator.next());
    const entry = createContentEntry({
      draft: {
        ...draft,
        createdAt: now,
        entryId: id,
        id: contentSnapshotId(this.dependencies.idGenerator.next()),
        revision: 1,
        state: "draft",
        updatedAt: now,
        updatedBy: auditActor(input.actor),
      },
      id,
      model: contentModelRoute(model),
    });
    return commandEntry(
      await this.dependencies.content.create({
        duplicateOf: { entryId: source.id, expectedRevision: source.draft.revision },
        entry,
        ...(references === undefined ? {} : { entryReferences: references }),
        mediaReferences: draft.mediaReferences,
        internalLinks: draft.internalLinks,
      }),
    );
  }

  /**
   * Removes one media item from the entry's current draft: from entry fields,
   * the data of every block and the SEO image. The rewritten draft is saved as
   * an ordinary guarded draft save at the revision it was read with; a draft
   * that does not use the item is left unchanged. Returns whether it saved.
   */
  public async detachMedia(input: DetachMediaFromDraftUseCaseInput): Promise<boolean> {
    authorizeContentOperation(input.actor, "detachMedia");
    requirePermission(input.actor, "media:write");
    const entry = await this.dependencies.content.loadDraftForEdit({ entryId: input.entryId });
    if (entry === null) return false;
    const model = this.model(entry.model.key);
    const { draft } = entry;
    const fields = detachFieldMedia(model.fields, draft.fields, input.mediaId);
    let changed = fields !== draft.fields;
    const blocks = draft.blocks.map((block) => {
      const definition = this.dependencies.config.blocks.get(block.type);
      if (definition === undefined) return block;
      const data = detachFieldMedia(definition.fields, block.data, input.mediaId);
      if (data === block.data) return block;
      changed = true;
      return { ...block, data };
    });
    let seo: EntrySeo | undefined = draft.seo;
    if (seo?.image === input.mediaId) {
      const { image: _image, ...rest } = seo;
      seo = rest;
      changed = true;
    }
    if (!changed) return false;
    if (draft.revision !== input.expectedRevision)
      throw new DomainError(
        "CONTENT_REVISION_CONFLICT",
        "The draft revision no longer matches the expected revision.",
      );
    const write = await this.draftWrite(entry, {
      actor: input.actor,
      blocks,
      entryId: entry.id,
      expectedRevision: draft.revision,
      fields,
      ...(seo === undefined ? {} : { seo }),
      ...(draft.slug === undefined ? {} : { slug: draft.slug }),
      title: draft.title,
    });
    return this.dependencies.content.saveDetachedDraft({
      ...write,
      draftId: draft.id,
      mediaId: input.mediaId,
    });
  }

  public async delete(input: DeleteContentEntryUseCaseInput): Promise<void> {
    authorizeContentOperation(input.actor, "delete");
    const entry = await this.entry(input.entryId);
    assertCollectionEntryOperation(entry, "delete");
    if (entry.published !== undefined) requirePermission(input.actor, "content:publish");
    const deletedAt = this.dependencies.clock.now();
    await this.dependencies.content.delete({
      events:
        entry.published === undefined
          ? []
          : [
              siteBuildEvent({
                reason: "publication",
                requestedAt: deletedAt,
                requestedBy: input.actor.id,
                publishedSnapshotId: entry.published.id,
              }),
            ],
      deletedAt,
      ...(input.linkImpact === undefined ? {} : { linkImpact: input.linkImpact }),
      ...(input.referenceImpact === undefined ? {} : { referenceImpact: input.referenceImpact }),
      deletedBy: auditActor(input.actor),
      entryId: entry.id,
      ...(entry.published === undefined ? {} : { expectedPublishedSnapshotId: entry.published.id }),
      expectedRevision: input.expectedRevision,
    });
  }

  private async entry(entryId: ContentEntryId): Promise<ContentEntry> {
    const entry = await this.dependencies.content.load({ entryId });
    if (entry === null) {
      throw new DomainError("CONTENT_INVALID_STATE", "Content entry does not exist.");
    }
    return entry;
  }

  private async idempotency(
    input: PublishContentEntryUseCaseInput,
    { entryReferences: _entryReferences, ...draft }: NormalizedDraft,
  ): Promise<{
    readonly actorId: Actor["id"];
    readonly fingerprint: ReturnType<typeof publicationRequestFingerprint>;
    readonly key: PublicationIdempotencyKey;
  }> {
    return {
      actorId: input.actor.id,
      fingerprint: publicationRequestFingerprint(
        await sha256CanonicalJson({
          actorId: input.actor.id,
          draft,
          entryId: input.entryId,
          expectedRevision: input.expectedRevision,
        } as unknown as JsonValue),
      ),
      key: publicationIdempotencyKey(input.idempotencyKey!),
    };
  }

  private model(key: string): NormalizedContentModel {
    const model = this.dependencies.config.content.find((candidate) => candidate.key === key);
    if (model === undefined) {
      throw new DomainError("CONTENT_INVALID_STATE", `Content model ${key} does not exist.`);
    }
    return model;
  }
}
