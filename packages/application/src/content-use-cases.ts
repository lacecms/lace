import type { NormalizedContentModel, RuntimeConfigProjection } from "@lacecms/config";
import { sha256CanonicalJson, validateEntryAggregate } from "@lacecms/content";
import type { FieldDefinition, JsonObject, JsonValue } from "@lacecms/content";

/**
 * Thrown by the content use cases when a submitted or published aggregate
 * fails content validation; its issues carry stable codes and paths.
 */
export { ContentValidationError } from "@lacecms/content";
import {
  DomainError,
  assertOrderedBlockPositions,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  mediaId,
  requirePermission,
  resolveContentPublicPath,
} from "@lacecms/domain";
import type {
  Actor,
  ContentBlock,
  ContentEntry,
  ContentEntryId,
  ContentModelKey,
  ContentModelRoute,
  DraftMediaReference,
  DraftSnapshot,
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
  readonly blocks: readonly ContentBlock[];
  readonly fields: JsonObject;
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

interface NormalizedDraft extends CompleteDraftInput {
  readonly blocks: readonly ContentBlock[];
  readonly fields: JsonObject;
  readonly mediaReferences: readonly DraftMediaReference[];
}

function detached<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function modelRoute(model: NormalizedContentModel): ContentModelRoute {
  const key = contentModelKey(model.key);
  return model.kind === "page"
    ? { key, kind: "page", path: model.path }
    : { key, kind: "collection", route: model.route };
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
    const draft = await this.validateDraft(input, model, "draft");
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
      model: modelRoute(model),
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
    const draft = await this.validateDraft(input, this.model(entry.model.key), "draft");
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
    resolveContentPublicPath(entry.model, draft.slug);
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

  public async delete(input: DeleteContentEntryUseCaseInput): Promise<void> {
    requirePermission(input.actor, "content:write");
    const entry = await this.entry(input.entryId);
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
        blocks: input.blocks.map(({ data, key, schemaVersion, type }) => ({
          data,
          key,
          schemaVersion,
          type,
        })),
        fields: input.fields,
        kind: model.kind,
        ...(input.slug === undefined ? {} : { slug: input.slug }),
        title: input.title,
      },
      model,
      this.dependencies.config.blocks,
      mode,
    );
    const blocks = aggregate.blocks.map((block, index) => ({
      data: block.data as JsonObject,
      key: blockKey(block.key),
      position: input.blocks[index]!.position,
      schemaVersion: block.schemaVersion,
      type: block.type,
    }));
    const normalized = {
      blocks,
      fields: aggregate.fields as JsonObject,
      ...(aggregate.slug === undefined ? {} : { slug: aggregate.slug }),
      title: aggregate.title,
    };
    const mediaReferences = this.collectMedia(normalized.fields, model.fields, "$fields");
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
    const references: DraftMediaReference[] = [];
    for (const [key, definition] of Object.entries(definitions)) {
      if (definition.type !== "media" || !Object.hasOwn(values, key)) continue;
      const value = values[key] as string;
      references.push({ fieldPath: key, mediaId: mediaId(value), sourceKey });
    }
    return references;
  }
}
