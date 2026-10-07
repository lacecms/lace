import {
  actorDisplayName,
  ALLOWED_MEDIA_MIME_TYPES,
  DISPATCHER_LEASE_DURATION_MS,
  MAX_MEDIA_USAGE_ENTRIES,
  MEDIA_SORTS,
  foldAscii,
  dispatcherLeaseId,
  opaqueCursor,
  opaqueTokenVerifier,
  planConfigurationSynchronization,
  renderConfigurationSyncPlanJson,
} from "@lacecms/application";
import type {
  ActorSummary,
  ApplyConfigurationSynchronizationInput,
  ApplyConfigurationSynchronizationResult,
  BuildContentExport,
  BuildTriggerResult,
  ByteStream,
  Cache,
  ClaimDispatcherEventsInput,
  Clock,
  CompleteDispatcherLeaseInput,
  ContentCommandResult,
  ContentEntryCommandPort,
  ContentEntryListPage,
  ContentEntryListValues,
  ContentEntryReadPort,
  ContentEntrySort,
  ContentEntryStatus,
  ContentEntrySummary,
  CreateMediaMetadataInput,
  ConfigurationSyncApplyPort,
  ConfigurationSyncModel,
  ConfigurationSyncStateReadPort,
  CreateContentEntryInput,
  CursorPage,
  DeleteContentEntryInput,
  DispatcherEvent,
  DispatcherLease,
  DispatcherLeasePort,
  IdGenerator,
  ListContentEntriesInput,
  ListPublicContentInput,
  LoadContentEntryInput,
  MarkMediaForDeletionInput,
  MarkMediaForDeletionResult,
  RetryDispatcherLeaseInput,
  LoadMediaUsageInput,
  MediaCatalogItem,
  MediaCatalogPort,
  MediaCommandPort,
  MediaListPort,
  MediaReadPort,
  MediaSort,
  MediaUsageEntry,
  MediaUsageLocation,
  MediaUsageState,
  StoredContentModelState,
  ObjectStorage,
  OpaqueCursor,
  OpaqueTokenHasher,
  OpaqueTokenSecret,
  OpaqueTokenVerifier,
  PublicContentEntry,
  PublicContentReadPort,
  PublishContentEntryCommand,
  PublishContentEntryResult,
  PutObjectInput,
  ReadUrlOptions,
  SaveCompleteDraftInput,
  SiteBuildRequest,
  SiteBuildTrigger,
  StoredObject,
} from "@lacecms/application";
import {
  DomainError,
  assertEntryCreationAllowed,
  assertPublicPathAvailable,
  contentSnapshotId,
  contentModelKey,
  createContentEntry,
  publishContentEntry,
  resolveContentPublicPath,
  saveCompleteDraft,
  unixMilliseconds,
} from "@lacecms/domain";
import type {
  ActorId,
  BlockKey,
  ContentEntry,
  DraftMediaReference,
  MediaMetadata,
  PublishedRoute,
  PublishedSnapshot,
  UnixMilliseconds,
} from "@lacecms/domain";
import type { NormalizedContentModel } from "@lacecms/config";

export const packageName = "@lacecms/test-utils";

/** Reusable assertion primitive for persistence adapters with injectable write checkpoints. */
export async function assertAtomicCheckpoints(input: {
  readonly checkpoints: readonly string[];
  readonly run: (checkpoint: string) => Promise<void>;
}): Promise<void> {
  for (const checkpoint of input.checkpoints) await input.run(checkpoint);
}

/** Makes index-plan fixtures insensitive to SQLite's non-semantic planner wording. */
export function assertQueryPlanUsesIndex(
  rows: readonly { readonly detail: string }[],
  index: string,
): void {
  if (!rows.some((row) => row.detail.includes(index))) {
    throw new Error(`Expected query plan to use index ${index}.`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
}

function clone<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function copyEntry(entry: ContentEntry): ContentEntry {
  const draft = clone(entry.draft);
  const copied = createContentEntry({ draft, id: entry.id, model: clone(entry.model) });
  if (entry.published === undefined) return copied;
  const publishedSource = createContentEntry({
    draft: {
      ...clone(entry.published),
      id: contentSnapshotId(`copy-${entry.published.id}`),
      state: "draft",
    },
    id: entry.id,
    model: clone(entry.model),
  });
  const publication = publishContentEntry(publishedSource, {
    expectedRevision: publishedSource.draft.revision,
    publishedAt: entry.published.createdAt,
    publishedBy: entry.published.updatedBy,
    publishedSnapshotId: entry.published.id,
  });
  return Object.freeze({
    draft: copied.draft,
    id: copied.id,
    model: copied.model,
    published: publication.published!,
  });
}

function copyCursorPage<Value>(page: CursorPage<Value>): CursorPage<Value> {
  return Object.freeze({
    items: Object.freeze(page.items.map((item) => clone(item))),
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
  });
}

function sameStoredModelStates(
  expected: readonly StoredContentModelState[],
  actual: readonly StoredContentModelState[],
): boolean {
  if (expected.length !== actual.length) return false;
  return expected.every((value, index) => {
    const candidate = actual[index];
    return (
      candidate !== undefined &&
      value.key === candidate.key &&
      value.kind === candidate.kind &&
      value.version === candidate.version &&
      value.structureHash === candidate.structureHash &&
      value.projectionHash === candidate.projectionHash &&
      value.entryCount === candidate.entryCount &&
      value.draftSnapshotCount === candidate.draftSnapshotCount &&
      value.publishedSnapshotCount === candidate.publishedSnapshotCount
    );
  });
}

function stateForModel(model: ConfigurationSyncModel): StoredContentModelState {
  return Object.freeze({
    draftSnapshotCount: 0,
    entryCount: 0,
    key: model.key,
    kind: model.kind,
    projectionHash: model.projectionHash,
    publishedSnapshotCount: 0,
    structureHash: model.structureHash,
    version: model.version,
  });
}

function routeForModel(model: NormalizedContentModel) {
  return Object.freeze(
    model.kind === "page"
      ? { key: contentModelKey(model.key), kind: "page" as const, path: model.path }
      : { key: contentModelKey(model.key), kind: "collection" as const, route: model.route },
  );
}

async function collectBytes(stream: ByteStream): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const copied = chunk.slice();
    chunks.push(copied);
    size += copied.byteLength;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function bytesStream(bytes: Uint8Array): ByteStream {
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
      yield bytes.slice();
    },
  };
}

/** Deterministic clock for portable application and adapter contract tests. */
export class DeterministicClock implements Clock {
  private value: UnixMilliseconds;

  public constructor(initial: UnixMilliseconds) {
    this.value = initial;
  }

  public advanceBy(milliseconds: number): UnixMilliseconds {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
      throw new TypeError("milliseconds must be a non-negative safe integer.");
    }
    this.value = unixMilliseconds(this.value + milliseconds);
    return this.now();
  }

  public now(): UnixMilliseconds {
    return this.value;
  }
}

/** Deterministic IDs make stateful fakes reproducible without a runtime UUID API. */
export class DeterministicIdGenerator implements IdGenerator {
  private nextValue = 1;

  public constructor(private readonly prefix = "id") {}

  public next(): string {
    const value = `${this.prefix}-${this.nextValue}`;
    this.nextValue += 1;
    return value;
  }
}

export class InMemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  public async createReadUrl(key: string, options?: ReadUrlOptions): Promise<string> {
    if (!this.objects.has(key)) throw new Error(`Object ${key} does not exist.`);
    const expires = options?.expiresAt === undefined ? "" : `?expires=${options.expiresAt}`;
    return `memory-object://${encodeURIComponent(key)}${expires}`;
  }

  public async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  public async get(key: string): Promise<ByteStream | null> {
    const object = this.objects.get(key);
    return object === undefined ? null : bytesStream(object.bytes);
  }

  public async put(input: PutObjectInput): Promise<StoredObject> {
    const bytes = await collectBytes(input.body);
    this.objects.set(input.key, { bytes: bytes.slice(), contentType: input.contentType });
    return Object.freeze({
      contentType: input.contentType,
      key: input.key,
      size: bytes.byteLength,
    });
  }
}

/** An intentionally simple cache fake; production callers must tolerate misses. */
export class InMemoryCache implements Cache {
  private readonly values = new Map<string, unknown>();

  public async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  public async get<Value>(key: string): Promise<Value | null> {
    const value = this.values.get(key);
    return value === undefined ? null : (clone(value) as Value);
  }

  public async set<Value>(key: string, value: Value): Promise<void> {
    this.values.set(key, clone(value));
  }
}

export class InMemorySiteBuildTrigger implements SiteBuildTrigger {
  public readonly requests: SiteBuildRequest[] = [];

  public constructor(private readonly result: BuildTriggerResult = { status: "succeeded" }) {}

  public async trigger(input: SiteBuildRequest): Promise<BuildTriggerResult> {
    this.requests.push(clone(input));
    return clone(this.result);
  }
}

/** Test-only deterministic verifier; production adapters provide password hashing. */
export class DeterministicTokenHasher implements OpaqueTokenHasher {
  public async hash(secret: OpaqueTokenSecret): Promise<OpaqueTokenVerifier> {
    let value = 2_166_136_261;
    for (const character of secret) {
      value ^= character.codePointAt(0) ?? 0;
      value = Math.imul(value, 16_777_619);
    }
    return opaqueTokenVerifier(`test-v1-${(value >>> 0).toString(16)}`);
  }

  public async verify(secret: OpaqueTokenSecret, verifier: OpaqueTokenVerifier): Promise<boolean> {
    return verifier === (await this.hash(secret));
  }
}

interface StoredLease {
  readonly expiresAt: UnixMilliseconds;
  readonly eventId: string;
}

interface StoredPublicationIdempotency {
  readonly entry: ContentEntry;
  readonly fingerprint: string;
}

export class InMemoryDispatcherLeasePort implements DispatcherLeasePort {
  private readonly events = new Map<string, DispatcherEvent>();
  private readonly leases = new Map<string, StoredLease>();
  private nextLease = 1;

  public enqueue(event: DispatcherEvent): void {
    this.events.set(event.id, clone(event));
  }

  public async claim(input: ClaimDispatcherEventsInput): Promise<readonly DispatcherLease[]> {
    assertPositiveInteger(input.limit, "limit");
    if (input.eventTypes.length === 0 || input.eventTypes.some((type) => type.length === 0)) {
      throw new TypeError("eventTypes must contain non-empty strings.");
    }
    const activelyLeased = new Set(
      [...this.leases.values()]
        .filter((lease) => lease.expiresAt > input.now)
        .map((lease) => lease.eventId),
    );
    const leases: DispatcherLease[] = [];
    for (const event of [...this.events.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      if (
        leases.length === input.limit ||
        !input.eventTypes.includes(event.type) ||
        event.availableAt > input.now ||
        activelyLeased.has(event.id)
      )
        continue;
      const id = dispatcherLeaseId(`lease-${this.nextLease}`);
      this.nextLease += 1;
      const expiresAt = unixMilliseconds(input.now + DISPATCHER_LEASE_DURATION_MS);
      this.leases.set(id, { eventId: event.id, expiresAt });
      leases.push(Object.freeze({ event: clone(event), expiresAt, id }));
    }
    return Object.freeze(leases);
  }

  public async complete(input: CompleteDispatcherLeaseInput): Promise<void> {
    const lease = this.leases.get(input.leaseId);
    if (lease === undefined || lease.expiresAt <= input.completedAt) {
      throw new Error("Dispatcher lease is missing or expired.");
    }
    this.leases.delete(input.leaseId);
    this.events.delete(lease.eventId);
  }

  public async retry(input: RetryDispatcherLeaseInput): Promise<void> {
    const lease = this.leases.get(input.leaseId);
    if (lease === undefined || lease.expiresAt <= input.failedAt) {
      throw new Error("Dispatcher lease is missing or expired.");
    }
    this.leases.delete(input.leaseId);
    const event = this.events.get(lease.eventId);
    if (event !== undefined) {
      this.events.set(event.id, {
        ...event,
        attempts: event.attempts + 1,
        availableAt: input.retryAt ?? input.failedAt,
      });
    }
  }
}

function entryStatus(entry: ContentEntry): ContentEntryStatus {
  if (entry.published === undefined) return "draft";
  return entry.published.revision === entry.draft.revision ? "published" : "changed";
}

function listValues(entry: ContentEntry, listFields: readonly string[]): ContentEntryListValues {
  const values: Record<string, boolean | number | string> = {};
  for (const key of listFields) {
    const value = Object.hasOwn(entry.draft.fields, key) ? entry.draft.fields[key] : undefined;
    if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      values[key] = value;
    }
  }
  return Object.freeze(values);
}

function matchesSearch(entry: ContentEntry, q: string | undefined): boolean {
  if (q === undefined) return true;
  const term = foldAscii(q);
  return foldAscii(entry.draft.title).includes(term) || (entry.draft.slug ?? "").includes(term);
}

/** Mirrors SQLite `COLLATE NOCASE`, which folds only ASCII letters before binary comparison. */
function compareNoCase(left: string, right: string): number {
  const foldedLeft = foldAscii(left);
  const foldedRight = foldAscii(right);
  return foldedLeft < foldedRight ? -1 : foldedLeft > foldedRight ? 1 : 0;
}

function compareMedia(left: MediaMetadata, right: MediaMetadata, sort: MediaSort): number {
  const field = sort.startsWith("-") ? sort.slice(1) : sort;
  const direction = sort.startsWith("-") ? -1 : 1;
  const primary =
    field === "filename"
      ? compareNoCase(left.filename, right.filename)
      : field === "size"
        ? left.size - right.size
        : left.createdAt - right.createdAt;
  const tieBreaker = left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  return direction * (primary === 0 ? tieBreaker : primary);
}

function compareSummaries(
  left: ContentEntrySummary,
  right: ContentEntrySummary,
  sort: ContentEntrySort,
): number {
  const field = sort.startsWith("-") ? sort.slice(1) : sort;
  const direction = sort.startsWith("-") ? -1 : 1;
  const primary =
    field === "title"
      ? compareNoCase(left.title, right.title)
      : field === "publishedAt"
        ? (left.publishedAt ?? -1) - (right.publishedAt ?? -1)
        : left.updatedAt - right.updatedAt;
  const tieBreaker = left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  return direction * (primary === 0 ? tieBreaker : primary);
}

/**
 * Reference content adapter used by tests before SQLite/D1 implementations.
 * It validates every guard before replacing its private indexes.
 */
export class InMemoryContentStore
  implements
    ContentEntryReadPort,
    ContentEntryCommandPort,
    ConfigurationSyncApplyPort,
    ConfigurationSyncStateReadPort,
    MediaCatalogPort,
    MediaCommandPort,
    MediaListPort,
    MediaReadPort,
    PublicContentReadPort
{
  public readonly configurationSyncBuildRequests: number[] = [];
  public readonly mediaDeletionRequests: string[] = [];
  private readonly actorNames = new Map<string, string>();
  private entries = new Map<string, ContentEntry>();
  private modelStates = new Map<string, StoredContentModelState>();
  private readonly media = new Map<string, MediaMetadata>();
  private readonly publicationIdempotency = new Map<string, StoredPublicationIdempotency>();
  private readonly references = new Map<string, readonly DraftMediaReference[]>();
  private readonly routes = new Map<string, PublishedRoute>();
  private publicVersion = 0;

  /** Seeds portable stored model identities for configuration-sync planner tests. */
  public setStoredModelStates(models: readonly StoredContentModelState[]): void {
    this.modelStates.clear();
    for (const model of models) this.modelStates.set(model.key, clone(model));
  }

  /** Reports detached stored identities plus the entries and snapshots currently held in memory. */
  public storedModelStates(): readonly StoredContentModelState[] {
    return Object.freeze(
      [...this.modelStates.values()]
        .map((model) => {
          const entries = [...this.entries.values()].filter(
            (entry) => entry.model.key === model.key,
          );
          return Object.freeze({
            ...clone(model),
            draftSnapshotCount: entries.length,
            entryCount: entries.length,
            publishedSnapshotCount: entries.filter((entry) => entry.published !== undefined).length,
          });
        })
        .sort((left, right) => left.key.localeCompare(right.key)),
    );
  }

  public async readConfigurationSyncState(): Promise<readonly StoredContentModelState[]> {
    return this.storedModelStates();
  }

  public async applyConfigurationSynchronization(
    input: ApplyConfigurationSynchronizationInput,
  ): Promise<ApplyConfigurationSynchronizationResult> {
    const current = this.storedModelStates();
    const actualPlan = planConfigurationSynchronization({
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
    const pageEntries = new Map(input.pageEntries.map((page) => [page.modelKey, page.entry]));
    const nextStates = new Map(this.modelStates);
    const nextEntries = new Map(this.entries);
    for (const operation of actualPlan.operations) {
      if (operation.action === "create") {
        const currentModel = models.get(operation.model.key);
        if (currentModel === undefined) {
          throw new DomainError("CONTENT_INVALID_STATE", "Synchronization model is unavailable.");
        }
        nextStates.set(operation.model.key, stateForModel(operation.model));
        if (currentModel.kind === "page") {
          const entry = pageEntries.get(operation.model.key);
          if (
            entry === undefined ||
            entry.model.key !== operation.model.key ||
            nextEntries.has(entry.id)
          ) {
            throw new DomainError(
              "CONTENT_INVALID_STATE",
              "Page synchronization entry is invalid.",
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
      nextStates.set(operation.model.key, stateForModel(operation.model));
      if (operation.action === "rename") {
        for (const [entryId, entry] of nextEntries) {
          if (entry.model.key !== previousKey) continue;
          nextEntries.set(
            entryId,
            Object.freeze({ ...copyEntry(entry), model: routeForModel(currentModel) }),
          );
        }
      }
    }
    this.modelStates = nextStates;
    this.entries = nextEntries;
    this.publicVersion += 1;
    this.configurationSyncBuildRequests.push(this.publicVersion);
    return Object.freeze({
      operations: actualPlan.operations,
      status: "applied",
      targetVersion: this.publicVersion,
    });
  }

  public async create(input: CreateContentEntryInput): Promise<ContentCommandResult> {
    const entry = copyEntry(input.entry);
    if (this.entries.has(entry.id)) {
      throw new DomainError("CONTENT_INVALID_STATE", "Content entry already exists.");
    }
    const existingEntryCount = [...this.entries.values()].filter(
      (candidate) => candidate.model.key === entry.model.key,
    ).length;
    assertEntryCreationAllowed(entry.model.kind, existingEntryCount);
    this.assertActiveReferences(input.mediaReferences ?? []);
    this.entries.set(entry.id, entry);
    this.references.set(entry.draft.id, clone(input.mediaReferences ?? []));
    return Object.freeze({ entry: copyEntry(entry), status: "created" });
  }

  public async delete(input: DeleteContentEntryInput): Promise<ContentCommandResult> {
    const entry = this.entries.get(input.entryId);
    if (entry === undefined)
      throw new DomainError("CONTENT_INVALID_STATE", "Content entry does not exist.");
    if (
      entry.draft.revision !== input.expectedRevision ||
      entry.published?.id !== input.expectedPublishedSnapshotId
    ) {
      throw new DomainError(
        "CONTENT_REVISION_CONFLICT",
        "The draft revision or publication state no longer matches the deletion guard.",
      );
    }
    const nextRoutes = new Map(this.routes);
    for (const [path, route] of nextRoutes)
      if (route.entryId === input.entryId) nextRoutes.delete(path);
    this.entries.delete(input.entryId);
    this.references.delete(entry.draft.id);
    if (entry.published !== undefined) this.references.delete(entry.published.id);
    this.routes.clear();
    for (const [path, route] of nextRoutes) this.routes.set(path, route);
    if (entry.published !== undefined) this.publicVersion += 1;
    return Object.freeze({ status: "deleted" });
  }

  public async load(input: LoadContentEntryInput): Promise<ContentEntry | null> {
    const entry = this.entries.get(input.entryId);
    return entry === undefined ? null : copyEntry(entry);
  }

  public async loadDraft(input: LoadContentEntryInput): Promise<ContentEntry["draft"] | null> {
    const entry = await this.load(input);
    return entry?.draft ?? null;
  }

  public async loadPublished(input: LoadContentEntryInput): Promise<PublishedSnapshot | null> {
    const entry = await this.load(input);
    return entry?.published ?? null;
  }

  /** Seeds stored user names used to resolve audit-actor display names. */
  public setActorDisplayNames(names: Readonly<Record<string, string>>): void {
    this.actorNames.clear();
    for (const [id, name] of Object.entries(names)) this.actorNames.set(id, name);
  }

  public async describeActors(ids: readonly ActorId[]): Promise<readonly ActorSummary[]> {
    return Object.freeze(ids.map((id) => this.actorSummary(id)));
  }

  public async list(input: ListContentEntriesInput): Promise<ContentEntryListPage> {
    const matching = [...this.entries.values()].filter(
      (entry) => entry.model.key === input.modelKey && matchesSearch(entry, input.q),
    );
    const totals = { all: matching.length, changed: 0, draft: 0, published: 0 };
    for (const entry of matching) totals[entryStatus(entry)] += 1;
    const summaries = matching
      .filter((entry) => input.status === undefined || entryStatus(entry) === input.status)
      .map((entry) => this.summarize(entry, input.listFields))
      .sort((left, right) => compareSummaries(left, right, input.sort));
    const prefix = JSON.stringify([
      "entries",
      input.modelKey,
      input.sort,
      input.status ?? null,
      input.q ?? null,
    ]);
    return Object.freeze({
      ...this.page(summaries, input.after, input.limit, prefix),
      totals: Object.freeze(totals),
    });
  }

  public async saveCompleteDraft(input: SaveCompleteDraftInput): Promise<ContentCommandResult> {
    const entry = this.entries.get(input.entryId);
    if (entry === undefined)
      throw new DomainError("CONTENT_INVALID_STATE", "Content entry does not exist.");
    this.assertActiveReferences(input.mutation.mediaReferences ?? []);
    const saved = saveCompleteDraft(entry, input.mutation);
    this.entries.set(saved.id, saved);
    this.references.set(saved.draft.id, clone(input.mutation.mediaReferences ?? []));
    return Object.freeze({ entry: copyEntry(saved), status: "saved" });
  }

  public async publish(input: PublishContentEntryCommand): Promise<PublishContentEntryResult> {
    const idempotencyMapKey = this.publicationIdempotencyMapKey(input);
    if (idempotencyMapKey !== undefined) {
      const prior = this.publicationIdempotency.get(idempotencyMapKey);
      if (prior !== undefined) {
        if (prior.fingerprint !== input.idempotency!.fingerprint) {
          throw new DomainError(
            "CONTENT_INVALID_STATE",
            "Publication idempotency key was reused with different input.",
          );
        }
        return Object.freeze({
          entry: copyEntry(prior.entry),
          outcome: "replayed",
          status: "published",
        });
      }
    }
    const entry = this.entries.get(input.entryId);
    if (entry === undefined)
      throw new DomainError("CONTENT_INVALID_STATE", "Content entry does not exist.");
    const published = publishContentEntry(entry, input);
    const path = resolveContentPublicPath(published.model, published.published!.slug);
    assertPublicPathAvailable(path, published.id, this.routes.get(path));
    const nextRoutes = new Map(this.routes);
    for (const [existingPath, route] of nextRoutes) {
      if (route.entryId === published.id) nextRoutes.delete(existingPath);
    }
    nextRoutes.set(path, {
      entryId: published.id,
      path,
      snapshotId: published.published!.id,
      updatedAt: input.publishedAt,
    });
    this.entries.set(published.id, published);
    // Publication replaces the prior published snapshot, as SQLite cascades its references.
    if (entry.published !== undefined) this.references.delete(entry.published.id);
    this.references.set(published.published!.id, clone(this.references.get(entry.draft.id) ?? []));
    this.routes.clear();
    for (const [routePath, route] of nextRoutes) this.routes.set(routePath, route);
    this.publicVersion += 1;
    if (idempotencyMapKey !== undefined) {
      this.publicationIdempotency.set(idempotencyMapKey, {
        entry: copyEntry(published),
        fingerprint: input.idempotency!.fingerprint,
      });
    }
    return Object.freeze({
      entry: copyEntry(published),
      outcome: "published",
      status: "published",
      targetVersion: this.publicVersion,
    });
  }

  public async listPublic(input: ListPublicContentInput): Promise<CursorPage<PublicContentEntry>> {
    const entries = this.publicEntries()
      .filter(({ entry }) => entry.model.key === input.modelKey)
      .map(({ entry, path }) => Object.freeze({ entry: copyEntry(entry), path }));
    return this.page(entries, input.after, input.limit, `public:${input.modelKey}`);
  }

  public async publishedContentVersion(): Promise<number> {
    return this.publicVersion;
  }

  private publicEntries(): readonly { readonly entry: ContentEntry; readonly path: string }[] {
    return [...this.routes.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, route]) => ({ entry: this.entries.get(route.entryId)!, path }))
      .filter(({ entry }) => entry.published !== undefined);
  }

  public async loadPublic(path: string): Promise<PublicContentEntry | null> {
    const route = this.routes.get(path);
    if (route === undefined) return null;
    const entry = this.entries.get(route.entryId);
    return entry?.published === undefined ? null : Object.freeze({ entry: copyEntry(entry), path });
  }

  public async loadPublicMedia(id: string): Promise<MediaMetadata | null> {
    const isPublished = [...this.routes.values()].some((route) =>
      (this.references.get(route.snapshotId) ?? []).some((reference) => reference.mediaId === id),
    );
    const value = this.media.get(id);
    return isPublished && value !== undefined ? clone(value) : null;
  }

  public registerMedia(value: MediaMetadata): void {
    this.media.set(value.id, clone(value));
  }

  /** Exposes a detached projection for application-layer contract assertions. */
  public mediaReferences(snapshotId: string): readonly DraftMediaReference[] {
    return Object.freeze(clone(this.references.get(snapshotId) ?? []));
  }

  public async createMedia(input: CreateMediaMetadataInput): Promise<MediaMetadata> {
    if (
      this.media.has(input.id) ||
      [...this.media.values()].some((value) => value.storageKey === input.storageKey)
    ) {
      throw new DomainError(
        "CONTENT_INVALID_STATE",
        "Media identity or storage key already exists.",
      );
    }
    const media: MediaMetadata = {
      createdAt: input.createdAt,
      createdBy: input.createdBy,
      filename: input.filename,
      height: input.height,
      id: input.id,
      mimeType: input.mimeType,
      size: input.size,
      status: "active",
      storageKey: input.storageKey,
      updatedAt: input.createdAt,
      width: input.width,
    };
    this.media.set(media.id, clone(media));
    return clone(media);
  }

  public async listMedia(
    input: import("@lacecms/application").ListMediaInput,
  ): Promise<CursorPage<MediaCatalogItem>> {
    if (!MEDIA_SORTS.includes(input.sort)) {
      throw new DomainError("CONTENT_INVALID_STATE", "Media sort is unsupported.");
    }
    if (input.type !== undefined && !ALLOWED_MEDIA_MIME_TYPES.includes(input.type)) {
      throw new DomainError("CONTENT_INVALID_STATE", "Media type filter is unsupported.");
    }
    const term = input.q === undefined ? undefined : foldAscii(input.q);
    const items = [...this.media.values()]
      .filter(
        (value) =>
          (term === undefined || foldAscii(value.filename).includes(term)) &&
          (input.type === undefined || value.mimeType === input.type),
      )
      .sort((left, right) => compareMedia(left, right, input.sort))
      .map((value) => this.catalogItem(value));
    const prefix = JSON.stringify(["media", input.sort, input.type ?? null, input.q ?? null]);
    return this.page(items, input.after, input.limit, prefix);
  }

  public async loadMediaCatalogItem(id: string): Promise<MediaCatalogItem | null> {
    const media = this.media.get(id);
    return media === undefined ? null : this.catalogItem(media);
  }

  public async loadMediaUsage(input: LoadMediaUsageInput): Promise<readonly MediaUsageEntry[]> {
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > MAX_MEDIA_USAGE_ENTRIES
    ) {
      throw new DomainError("CONTENT_INVALID_STATE", "Media usage limit is invalid.");
    }
    return Object.freeze(this.mediaUsage(input.mediaId).slice(0, input.limit));
  }

  public async loadMediaMany(ids: readonly string[]): Promise<readonly MediaMetadata[]> {
    return [...new Set(ids)].flatMap((id) => {
      const media = this.media.get(id);
      return media === undefined ? [] : [clone(media)];
    });
  }

  public async loadMedia(id: string): Promise<MediaMetadata | null> {
    const media = this.media.get(id);
    return media === undefined ? null : clone(media);
  }

  public async markForDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    const media = this.media.get(input.mediaId);
    if (media === undefined || media.status !== "active") {
      throw new DomainError("CONTENT_INVALID_STATE", "Media is not eligible for deletion.");
    }
    if (this.mediaUsage(input.mediaId).length > 0) {
      throw new DomainError("MEDIA_IN_USE", "Media is still referenced by content.");
    }
    const deleting = { ...media, status: "deleting" as const, updatedAt: input.requestedAt };
    this.media.set(input.mediaId, clone(deleting));
    this.mediaDeletionRequests.push(input.mediaId);
    return Object.freeze({ media: clone(deleting), status: "deleting" });
  }

  public async retryDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    const media = this.media.get(input.mediaId);
    if (media === undefined || media.status !== "delete_failed") {
      throw new DomainError("CONTENT_INVALID_STATE", "Media deletion cannot be retried.");
    }
    if (this.mediaUsage(input.mediaId).length > 0) {
      throw new DomainError("MEDIA_IN_USE", "Media is still referenced by content.");
    }
    const deleting = { ...media, status: "deleting" as const, updatedAt: input.requestedAt };
    this.media.set(input.mediaId, clone(deleting));
    this.mediaDeletionRequests.push(input.mediaId);
    return Object.freeze({ media: clone(deleting), status: "deleting" });
  }

  public async exportBuildContent(): Promise<BuildContentExport> {
    return Object.freeze({
      entries: Object.freeze(
        this.publicEntries().map(({ entry, path }) =>
          Object.freeze({ entry: copyEntry(entry), path }),
        ),
      ),
      version: this.publicVersion,
    });
  }

  private assertActiveReferences(references: readonly DraftMediaReference[]): void {
    for (const reference of references) {
      const media = this.media.get(reference.mediaId);
      // Some application tests intentionally validate media through a separate
      // read double; when this store owns the record it still enforces the
      // persistence-time active-state guard.
      if (media !== undefined && media.status !== "active") {
        throw new DomainError("CONTENT_INVALID_STATE", "Media is unavailable for reference.");
      }
    }
  }

  private catalogItem(media: MediaMetadata): MediaCatalogItem {
    return Object.freeze({
      createdBy: this.actorSummary(media.createdBy),
      media: clone(media),
      usageCount: this.mediaUsage(media.id).length,
    });
  }

  /** Usage from each entry's current draft and published reference projections only. */
  private mediaUsage(mediaIdValue: string): MediaUsageEntry[] {
    const usage: { readonly entry: MediaUsageEntry; readonly updatedAt: number }[] = [];
    for (const entry of this.entries.values()) {
      const locations = new Map<
        string,
        {
          blockKey?: BlockKey;
          blockType?: string;
          field: string;
          position: number;
          states: Set<MediaUsageState>;
        }
      >();
      const snapshots = [
        ["draft", entry.draft] as const,
        ...(entry.published === undefined ? [] : [["published", entry.published] as const]),
      ];
      for (const [state, snapshot] of snapshots) {
        for (const reference of this.references.get(snapshot.id) ?? []) {
          if (reference.mediaId !== mediaIdValue) continue;
          const block =
            reference.sourceKey === "$fields"
              ? undefined
              : snapshot.blocks.find((candidate) => candidate.key === reference.sourceKey);
          if (reference.sourceKey !== "$fields" && block === undefined) {
            throw new Error("A media reference names a block that does not exist.");
          }
          const key = `${reference.sourceKey}\u0000${reference.fieldPath}`;
          const location = locations.get(key) ?? {
            ...(block === undefined ? {} : { blockKey: block.key, blockType: block.type }),
            field: reference.fieldPath,
            position: block?.position ?? 0,
            states: new Set<MediaUsageState>(),
          };
          if (block !== undefined) {
            if (state === "draft") location.blockType = block.type;
            location.position = Math.min(location.position, block.position);
          }
          location.states.add(state);
          locations.set(key, location);
        }
      }
      if (locations.size === 0) continue;
      const ordered = [...locations.values()].sort((left, right) => {
        if ((left.blockKey === undefined) !== (right.blockKey === undefined)) {
          return left.blockKey === undefined ? -1 : 1;
        }
        if (left.position !== right.position) return left.position - right.position;
        const leftKey = `${left.blockKey ?? ""}\u0000${left.field}`;
        const rightKey = `${right.blockKey ?? ""}\u0000${right.field}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
      const states = (value: ReadonlySet<MediaUsageState>): readonly MediaUsageState[] =>
        Object.freeze((["draft", "published"] as const).filter((state) => value.has(state)));
      usage.push({
        entry: Object.freeze({
          entryId: entry.id,
          locations: Object.freeze(
            ordered.map((location): MediaUsageLocation =>
              location.blockKey === undefined
                ? Object.freeze({
                    field: location.field,
                    source: "field" as const,
                    states: states(location.states),
                  })
                : Object.freeze({
                    blockKey: location.blockKey,
                    blockType: location.blockType!,
                    field: location.field,
                    source: "block" as const,
                    states: states(location.states),
                  }),
            ),
          ),
          modelKey: entry.model.key,
          ...(entry.draft.slug === undefined ? {} : { slug: entry.draft.slug }),
          status: entryStatus(entry),
          title: entry.draft.title,
        }),
        // Mirrors the Node `content_entries.updated_at`, which publication also advances.
        updatedAt: Math.max(entry.draft.updatedAt, entry.published?.createdAt ?? 0),
      });
    }
    return usage
      .sort((left, right) =>
        left.updatedAt === right.updatedAt
          ? left.entry.entryId < right.entry.entryId
            ? 1
            : left.entry.entryId > right.entry.entryId
              ? -1
              : 0
          : right.updatedAt - left.updatedAt,
      )
      .map(({ entry }) => entry);
  }

  private actorSummary(id: ActorId): ActorSummary {
    return Object.freeze({ displayName: actorDisplayName(id, this.actorNames.get(id)), id });
  }

  private summarize(entry: ContentEntry, listFields: readonly string[]): ContentEntrySummary {
    return Object.freeze({
      draftRevision: entry.draft.revision,
      id: entry.id,
      listValues: listValues(entry, listFields),
      modelKey: entry.model.key,
      ...(entry.published === undefined
        ? {}
        : { publishedAt: entry.published.createdAt, publishedSnapshotId: entry.published.id }),
      ...(entry.draft.slug === undefined ? {} : { slug: entry.draft.slug }),
      status: entryStatus(entry),
      title: entry.draft.title,
      updatedAt: entry.draft.updatedAt,
      updatedBy: this.actorSummary(entry.draft.updatedBy.id),
    });
  }

  private page<Value>(
    items: readonly Value[],
    after: OpaqueCursor | undefined,
    limit: number,
    prefix: string,
  ): CursorPage<Value> {
    assertPositiveInteger(limit, "limit");
    const start = this.cursorOffset(after, prefix);
    const slice = items.slice(start, start + limit);
    const nextOffset = start + slice.length;
    return copyCursorPage({
      items: slice,
      ...(nextOffset < items.length ? { nextCursor: opaqueCursor(`${prefix}:${nextOffset}`) } : {}),
    });
  }

  private cursorOffset(cursor: OpaqueCursor | undefined, prefix: string): number {
    if (cursor === undefined) return 0;
    const cursorPrefix = `${prefix}:`;
    if (!cursor.startsWith(cursorPrefix)) {
      throw new DomainError("CONTENT_INVALID_STATE", "Cursor is invalid.");
    }
    const offsetText = cursor.slice(cursorPrefix.length);
    const offset = Number(offsetText);
    if (!Number.isSafeInteger(offset) || offset < 0 || String(offset) !== offsetText) {
      throw new DomainError("CONTENT_INVALID_STATE", "Cursor offset is invalid.");
    }
    return offset;
  }

  private publicationIdempotencyMapKey(input: PublishContentEntryCommand): string | undefined {
    if (input.idempotency === undefined) return undefined;
    if (input.idempotency.actorId !== input.publishedBy.id) {
      throw new DomainError(
        "CONTENT_INVALID_STATE",
        "Publication idempotency actor must match the publishing actor.",
      );
    }
    return `${input.entryId}:${input.idempotency.actorId}:${input.idempotency.key}`;
  }
}
export * from "./repository-contract.js";
export * from "./security-contract.js";
