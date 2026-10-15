import type { NormalizedContentModel, RuntimeConfigProjection } from "@lacecms/config";
import {
  collectFieldMedia,
  detachFieldMedia,
  encodeFieldPath,
  MAX_TITLE_LENGTH,
  sha256CanonicalJson,
  validateEntryAggregate,
} from "@lacecms/content";
import type { FieldDefinition, JsonObject, JsonValue } from "@lacecms/content";

/**
 * Thrown by the content use cases when a submitted or published aggregate
 * fails content validation; its issues carry stable codes and paths.
 */
export { ContentValidationError } from "@lacecms/content";
import {
  DomainError,
  assertCollectionEntryOperation,
  assertOrderedBlockPositions,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  mediaId,
  normalizeEntrySeo,
  requirePermission,
  requirePublishedSnapshot,
  contentPublicPath,
} from "@lacecms/domain";
import type {
  Actor,
  ContentBlock,
  ContentBlockInput,
  ContentEntry,
  ContentEntryId,
  ContentModelKey,
  ContentModelRoute,
  ContentSnapshotId,
  DraftMediaReference,
  DraftSnapshot,
  EntrySeo,
  MediaId,
  PublishedSnapshot,
} from "@lacecms/domain";
import {
  CONTENT_ENTRY_SORTS,
  CONTENT_ENTRY_STATUSES,
  DEFAULT_CONTENT_ENTRY_SORT,
  MAX_CONTENT_ENTRY_SEARCH_LENGTH,
  publicationIdempotencyKey,
  publicationRequestFingerprint,
} from "./index.js";
import type {
  ActorSummary,
  Clock,
  ContentCommandResult,
  ContentEntryCommandPort,
  ContentEntryListPage,
  ContentEntryReadPort,
  ContentEntrySort,
  ContentEntryStatus,
  IdGenerator,
  ContentMediaReadPort,
  OpaqueCursor,
  PublicationIdempotencyKey,
  PublicContentReadPort,
} from "./index.js";

export interface ContentUseCaseDependencies {
  readonly clock: Clock;
  readonly config: RuntimeConfigProjection;
  readonly content: ContentEntryReadPort & ContentEntryCommandPort & PublicContentReadPort;
  readonly idGenerator: IdGenerator;
  readonly media: ContentMediaReadPort;
}

export interface CompleteDraftInput {
  /** Omitted envelope values take their defaults (visible, declared setting defaults). */
  readonly blocks: readonly ContentBlockInput[];
  readonly fields: JsonObject;
  /**
   * The submitted SEO group; absent or `null` stores none. Validated against the
   * shared rules, and refused for a model without SEO.
   */
  readonly seo?: unknown;
  readonly slug?: string;
  readonly title: string;
}

export interface CreateContentEntryUseCaseInput extends CompleteDraftInput {
  readonly actor: Actor;
  readonly modelKey: ContentModelKey | string;
}

export interface ListContentEntriesUseCaseInput {
  readonly actor: Actor;
  readonly after?: OpaqueCursor;
  readonly limit: number;
  readonly modelKey: string;
  readonly q?: string;
  readonly sort?: string;
  readonly status?: string;
}

export interface DescribeActorUseCaseInput {
  readonly actor: Actor;
  readonly actorId: Actor["id"];
}

export interface LoadContentEntryUseCaseInput {
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
}

export interface SaveContentDraftUseCaseInput extends CompleteDraftInput {
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
  readonly expectedRevision: number;
}

export interface PublishContentEntryUseCaseInput {
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
  readonly expectedRevision: number;
  readonly idempotencyKey?: string;
}

export interface UnpublishContentEntryUseCaseInput {
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
  readonly expectedPublishedSnapshotId: ContentSnapshotId;
  readonly idempotencyKey?: string;
}

export interface RevertContentDraftUseCaseInput {
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
  readonly expectedRevision: number;
}

export interface DuplicateContentEntryUseCaseInput {
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
  /** When supplied, the source draft must still be at this revision. */
  readonly expectedRevision?: number;
}

export interface DetachMediaFromDraftUseCaseInput {
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
  readonly mediaId: MediaId;
}

export interface DeleteContentEntryUseCaseInput {
  readonly actor: Actor;
  readonly entryId: ContentEntryId;
  readonly expectedRevision: number;
}

export type BuildDispatchOutcome =
  | Readonly<{ readonly status: "queued"; readonly targetVersion: number }>
  | Readonly<{ readonly status: "not-dispatched" }>;

export interface PublishContentEntryUseCaseResult {
  readonly build: BuildDispatchOutcome;
  readonly entry: ContentEntry;
  readonly publication: "published" | "replayed";
}

export interface UnpublishContentEntryUseCaseResult {
  readonly build: BuildDispatchOutcome;
  readonly entry: ContentEntry;
  readonly unpublication: "replayed" | "unpublished";
}

const DUPLICATE_TITLE_SUFFIX = " (copy)";

/**
 * Appends the duplicate suffix, shortening the source title so the result
 * fits the shared title limit without leaving a lone surrogate.
 */
export function duplicateTitle(title: string): string {
  const room = MAX_TITLE_LENGTH - DUPLICATE_TITLE_SUFFIX.length;
  if (title.length <= room) return `${title}${DUPLICATE_TITLE_SUFFIX}`;
  let base = title.slice(0, room);
  const last = base.charCodeAt(base.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) base = base.slice(0, -1);
  return `${base}${DUPLICATE_TITLE_SUFFIX}`;
}

interface NormalizedDraft extends Omit<CompleteDraftInput, "seo"> {
  readonly blocks: readonly ContentBlock[];
  readonly fields: JsonObject;
  readonly mediaReferences: readonly DraftMediaReference[];
  readonly seo?: EntrySeo;
}

/** Whether a configured model enables the per-entry SEO group. */
function seoEnabled(model: NormalizedContentModel): boolean {
  return model.kind !== "global" && model.seo !== undefined;
}

function detached<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

/** Maps a configured model to the route identity stored with its entries. */
export function contentModelRoute(model: NormalizedContentModel): ContentModelRoute {
  const key = contentModelKey(model.key);
  switch (model.kind) {
    case "page":
      return { key, kind: "page", path: model.path };
    case "collection":
      return { key, kind: "collection", route: model.route };
    case "global":
      return { key, kind: "global" };
    default:
      return model satisfies never;
  }
}

/** A global's title is system-owned: always its model label, or its key. */
function systemTitle(model: NormalizedContentModel, title: string): string {
  return model.kind === "global" ? (model.label ?? model.key) : title;
}

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
  public constructor(private readonly dependencies: ContentUseCaseDependencies) {}

  public async create(input: CreateContentEntryUseCaseInput): Promise<ContentEntry> {
    requirePermission(input.actor, "content:write");
    const model = this.model(input.modelKey);
    const draft = await this.validateDraft(
      { ...input, title: systemTitle(model, input.title) },
      model,
      "draft",
    );
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
        updatedBy: input.actor,
      },
      id,
      model: contentModelRoute(model),
    });
    return commandEntry(
      await this.dependencies.content.create({ entry, mediaReferences: draft.mediaReferences }),
    );
  }

  public async list(input: ListContentEntriesUseCaseInput): Promise<ContentEntryListPage> {
    requirePermission(input.actor, "content:read");
    const model = this.model(input.modelKey);
    const q = input.q?.trim();
    if (q !== undefined && q.length > MAX_CONTENT_ENTRY_SEARCH_LENGTH) {
      throw new DomainError(
        "CONTENT_INVALID_STATE",
        `Search terms must not exceed ${MAX_CONTENT_ENTRY_SEARCH_LENGTH} characters.`,
      );
    }
    if (
      input.status !== undefined &&
      !CONTENT_ENTRY_STATUSES.includes(input.status as ContentEntryStatus)
    ) {
      throw new DomainError("CONTENT_INVALID_STATE", "Entry status filter is unsupported.");
    }
    if (input.sort !== undefined && !CONTENT_ENTRY_SORTS.includes(input.sort as ContentEntrySort)) {
      throw new DomainError("CONTENT_INVALID_STATE", "Entry sort is unsupported.");
    }
    return detached(
      await this.dependencies.content.list({
        ...(input.after === undefined ? {} : { after: input.after }),
        limit: input.limit,
        listFields: model.kind === "collection" ? [...(model.listFields ?? [])] : [],
        modelKey: contentModelKey(model.key),
        ...(q === undefined || q.length === 0 ? {} : { q }),
        sort: (input.sort as ContentEntrySort | undefined) ?? DEFAULT_CONTENT_ENTRY_SORT,
        ...(input.status === undefined ? {} : { status: input.status as ContentEntryStatus }),
      }),
    );
  }

  /** Resolves an audit actor's display name so clients never need the users API. */
  public async describeActor(input: DescribeActorUseCaseInput): Promise<ActorSummary> {
    requirePermission(input.actor, "content:read");
    const [summary] = await this.dependencies.content.describeActors([input.actorId]);
    if (summary === undefined || summary.id !== input.actorId) {
      throw new DomainError("CONTENT_INVALID_STATE", "Actor description is unavailable.");
    }
    return detached(summary);
  }

  public async load(input: LoadContentEntryUseCaseInput): Promise<ContentEntry | null> {
    requirePermission(input.actor, "content:read");
    const entry = await this.dependencies.content.load({ entryId: input.entryId });
    return entry === null ? null : detached(entry);
  }

  public async loadDraft(input: LoadContentEntryUseCaseInput): Promise<DraftSnapshot | null> {
    requirePermission(input.actor, "content:read");
    const draft = await this.dependencies.content.loadDraft({ entryId: input.entryId });
    return draft === null ? null : detached(draft);
  }

  public async loadPublished(
    input: LoadContentEntryUseCaseInput,
  ): Promise<PublishedSnapshot | null> {
    requirePermission(input.actor, "content:read");
    const published = await this.dependencies.content.loadPublished({ entryId: input.entryId });
    return published === null ? null : detached(published);
  }

  public async save(input: SaveContentDraftUseCaseInput): Promise<ContentEntry> {
    requirePermission(input.actor, "content:write");
    const entry = await this.entry(input.entryId);
    const model = this.model(entry.model.key);
    const draft = await this.validateDraft(
      { ...input, title: systemTitle(model, input.title) },
      model,
      "draft",
    );
    return commandEntry(
      await this.dependencies.content.saveCompleteDraft({
        entryId: entry.id,
        mutation: {
          ...draft,
          expectedRevision: input.expectedRevision,
          updatedAt: this.dependencies.clock.now(),
          updatedBy: input.actor,
        },
      }),
    );
  }

  public async publish(
    input: PublishContentEntryUseCaseInput,
  ): Promise<PublishContentEntryUseCaseResult> {
    requirePermission(input.actor, "content:publish");
    const entry = await this.entry(input.entryId);
    const draft = await this.validateDraft(entry.draft, this.model(entry.model.key), "publish");
    contentPublicPath(entry.model, draft.slug);
    const result = await this.dependencies.content.publish({
      entryId: entry.id,
      expectedRevision: input.expectedRevision,
      ...(input.idempotencyKey === undefined
        ? {}
        : { idempotency: await this.idempotency(input, draft) }),
      publishedAt: this.dependencies.clock.now(),
      publishedBy: input.actor,
      publishedSnapshotId: contentSnapshotId(this.dependencies.idGenerator.next()),
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
    requirePermission(input.actor, "content:publish");
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
              }),
            ),
            key: publicationIdempotencyKey(input.idempotencyKey),
          };
    // A keyed retry after success must reach the adapter so it can replay.
    if (idempotency === undefined) {
      requirePublishedSnapshot(entry, input.expectedPublishedSnapshotId);
    }
    const result = await this.dependencies.content.unpublish({
      entryId: entry.id,
      expectedPublishedSnapshotId: input.expectedPublishedSnapshotId,
      ...(idempotency === undefined ? {} : { idempotency }),
      unpublishedAt: this.dependencies.clock.now(),
      unpublishedBy: input.actor,
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
    requirePermission(input.actor, "content:write");
    const entry = await this.entry(input.entryId);
    const published = requirePublishedSnapshot(entry);
    return commandEntry(
      await this.dependencies.content.revertDraft({
        entryId: entry.id,
        expectedPublishedSnapshotId: published.id,
        expectedRevision: input.expectedRevision,
        revertedAt: this.dependencies.clock.now(),
        revertedBy: input.actor,
      }),
    );
  }

  public async duplicate(input: DuplicateContentEntryUseCaseInput): Promise<ContentEntry> {
    requirePermission(input.actor, "content:write");
    const source = await this.entry(input.entryId);
    assertCollectionEntryOperation(source, "duplicate");
    if (input.expectedRevision !== undefined && input.expectedRevision !== source.draft.revision) {
      throw new DomainError(
        "CONTENT_REVISION_CONFLICT",
        "The draft revision no longer matches the expected revision.",
      );
    }
    const model = this.model(source.model.key);
    const draft = await this.validateDraft(
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
        updatedBy: input.actor,
      },
      id,
      model: contentModelRoute(model),
    });
    return commandEntry(
      await this.dependencies.content.create({
        duplicateOf: { entryId: source.id, expectedRevision: source.draft.revision },
        entry,
        mediaReferences: draft.mediaReferences,
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
    requirePermission(input.actor, "content:write");
    const entry = await this.entry(input.entryId);
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
    await this.save({
      actor: input.actor,
      blocks,
      entryId: entry.id,
      expectedRevision: draft.revision,
      fields,
      ...(seo === undefined ? {} : { seo }),
      ...(draft.slug === undefined ? {} : { slug: draft.slug }),
      title: draft.title,
    });
    return true;
  }

  public async delete(input: DeleteContentEntryUseCaseInput): Promise<void> {
    requirePermission(input.actor, "content:write");
    const entry = await this.entry(input.entryId);
    assertCollectionEntryOperation(entry, "delete");
    if (entry.published !== undefined) requirePermission(input.actor, "content:publish");
    await this.dependencies.content.delete({
      deletedAt: this.dependencies.clock.now(),
      deletedBy: input.actor,
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
    draft: NormalizedDraft,
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

  private async validateDraft(
    input: CompleteDraftInput,
    model: NormalizedContentModel,
    mode: "draft" | "publish",
  ): Promise<NormalizedDraft> {
    assertOrderedBlockPositions(input.blocks);
    const aggregate = validateEntryAggregate(
      {
        blocks: input.blocks.map(
          ({ anchor, className, data, hidden, key, schemaVersion, settings, type }) => ({
            ...(anchor === undefined ? {} : { anchor }),
            ...(className === undefined ? {} : { className }),
            data,
            ...(hidden === undefined ? {} : { hidden }),
            key,
            schemaVersion,
            ...(settings === undefined ? {} : { settings }),
            type,
          }),
        ),
        fields: input.fields,
        kind: model.kind,
        ...(input.slug === undefined ? {} : { slug: input.slug }),
        title: input.title,
      },
      model,
      this.dependencies.config.blocks,
      mode,
    );
    const blocks: ContentBlock[] = aggregate.blocks.map((block, index) => ({
      ...(block.anchor === undefined ? {} : { anchor: block.anchor }),
      ...(block.className === undefined ? {} : { className: block.className }),
      data: block.data as JsonObject,
      hidden: block.hidden,
      key: blockKey(block.key),
      position: input.blocks[index]!.position,
      schemaVersion: block.schemaVersion,
      settings: block.settings,
      type: block.type,
    }));
    const seo = normalizeEntrySeo(input.seo ?? null, { enabled: seoEnabled(model) });
    const normalized = {
      blocks,
      fields: aggregate.fields as JsonObject,
      ...(seo === undefined ? {} : { seo }),
      ...(aggregate.slug === undefined ? {} : { slug: aggregate.slug }),
      title: aggregate.title,
    };
    const mediaReferences = this.collectMedia(normalized.fields, model.fields, "$fields");
    if (seo?.image !== undefined) {
      mediaReferences.push({ fieldPath: "image", mediaId: mediaId(seo.image), sourceKey: "$seo" });
    }
    for (const block of normalized.blocks) {
      mediaReferences.push(
        ...this.collectMedia(
          block.data,
          this.dependencies.config.blocks.get(block.type)!.fields,
          block.key,
        ),
      );
    }
    if (mediaReferences.length > 200) {
      throw new DomainError(
        "CONTENT_INVALID_STATE",
        "A draft must not contain more than 200 media references.",
      );
    }
    const ids = [...new Set(mediaReferences.map((reference) => reference.mediaId))];
    const active = new Set(
      (ids.length === 0 ? [] : await this.dependencies.media.loadMediaMany(ids))
        .filter((media) => media.status === "active")
        .map((media) => media.id),
    );
    for (const id of ids) {
      if (!active.has(id))
        throw new DomainError("CONTENT_INVALID_STATE", `Media ${id} is unavailable.`);
    }
    return { ...normalized, mediaReferences: Object.freeze(mediaReferences) };
  }

  private collectMedia(
    values: JsonObject,
    definitions: Readonly<Record<string, FieldDefinition>>,
    sourceKey: "$fields" | ReturnType<typeof blockKey>,
  ): DraftMediaReference[] {
    return collectFieldMedia(definitions, values).map(({ mediaId: id, path }) => ({
      fieldPath: encodeFieldPath(path),
      mediaId: mediaId(id),
      sourceKey,
    }));
  }
}
