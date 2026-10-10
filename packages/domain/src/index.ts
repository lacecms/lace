import { MAX_SLUG_LENGTH } from "@lacecms/content";
import type { JsonObject, JsonValue } from "@lacecms/content";
import type { SiteBuildStatus } from "./build-status.js";

export const packageName = "@lacecms/domain";
export const BLOCK_POSITION_STEP = 1_000;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** A nominal marker for domain values that share a string representation. */
export type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type ActorId = Brand<string, "ActorId">;
export type BlockKey = Brand<string, "BlockKey">;
export type ContentEntryId = Brand<string, "ContentEntryId">;
export type ContentModelKey = Brand<string, "ContentModelKey">;
export type ContentSnapshotId = Brand<string, "ContentSnapshotId">;
export type MediaId = Brand<string, "MediaId">;
export type SiteBuildId = Brand<string, "SiteBuildId">;
export type UnixMilliseconds = Brand<number, "UnixMilliseconds">;

export type ContentModelKind = "collection" | "page";
export type Role = "admin" | "editor" | "viewer";
export type Permission =
  | "content:read"
  | "content:write"
  | "content:publish"
  | "media:write"
  | "users:manage"
  | "settings:manage";

export type DomainErrorCode =
  | "AUTHORIZATION_DENIED"
  | "CONTENT_INVALID_STATE"
  | "CONTENT_MODEL_CARDINALITY_CONFLICT"
  | "CONTENT_PUBLISHED_IMMUTABLE"
  | "CONTENT_REVISION_CONFLICT"
  | "CONTENT_ROUTE_CONFLICT"
  | "LAST_ADMIN_PROTECTED"
  | "MEDIA_IN_USE";

/** A portable error with a stable code suitable for later transport mapping. */
export class DomainError extends Error {
  public constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** A deliberately bounded ordering diagnostic safe to carry across transport boundaries. */
export class BlockOrderError extends DomainError {
  public constructor(index: number, key: string) {
    const safeKey = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/u.test(key) ? ` (key ${key})` : "";
    super(
      "CONTENT_INVALID_STATE",
      `Block at index ${Number.isSafeInteger(index) && index >= 0 ? index : 0}${safeKey} has an invalid position. Positions must be positive safe integers in strictly increasing order. Resubmit positions in the displayed block order.`,
    );
    this.name = "BlockOrderError";
  }
}

function fail(code: DomainErrorCode, message: string): never {
  throw new DomainError(code, message);
}

function nonEmptyString<Name extends string>(value: string, name: Name): Brand<string, Name> {
  if (typeof value !== "string" || value.length === 0) {
    fail("CONTENT_INVALID_STATE", `${name} must be a non-empty string.`);
  }
  return value as Brand<string, Name>;
}

export function actorId(value: string): ActorId {
  return nonEmptyString(value, "ActorId");
}

export function blockKey(value: string): BlockKey {
  return nonEmptyString(value, "BlockKey");
}

export function contentEntryId(value: string): ContentEntryId {
  return nonEmptyString(value, "ContentEntryId");
}

export function contentModelKey(value: string): ContentModelKey {
  return nonEmptyString(value, "ContentModelKey");
}

export function contentSnapshotId(value: string): ContentSnapshotId {
  return nonEmptyString(value, "ContentSnapshotId");
}

export function mediaId(value: string): MediaId {
  return nonEmptyString(value, "MediaId");
}

export function siteBuildId(value: string): SiteBuildId {
  return nonEmptyString(value, "SiteBuildId");
}

export function unixMilliseconds(value: number): UnixMilliseconds {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("CONTENT_INVALID_STATE", "UnixMilliseconds must be a non-negative safe integer.");
  }
  return value as UnixMilliseconds;
}

/** The authenticated principal passed from an authentication adapter. */
export interface Actor {
  readonly id: ActorId;
  readonly role: Role;
}

/** The installation-wide permission policy. */
export const defaultRolePermissions: Readonly<Record<Role, readonly Permission[]>> = deepFreeze({
  admin: [
    "content:read",
    "content:write",
    "content:publish",
    "media:write",
    "users:manage",
    "settings:manage",
  ],
  editor: ["content:read", "content:write", "media:write"],
  viewer: ["content:read"],
});

/** Every permission the installation policy grants a role, in policy order. */
export function permissionsFor(role: Role): readonly Permission[] {
  return defaultRolePermissions[role];
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  return permissionsFor(actor.role).includes(permission);
}

/** Requires a permission without requiring callers to duplicate role policy. */
export function requirePermission(actor: Actor, permission: Permission): void {
  if (!hasPermission(actor, permission)) {
    fail("AUTHORIZATION_DENIED", `Actor is missing permission ${permission}.`);
  }
}

export type MediaStatus = "active" | "delete_failed" | "deleting";

/** Metadata for an object-store asset; binary data never belongs in this value. */
export interface MediaMetadata {
  readonly createdAt: UnixMilliseconds;
  readonly createdBy: ActorId;
  readonly filename: string;
  readonly height?: number;
  readonly id: MediaId;
  readonly mimeType: string;
  readonly size: number;
  readonly status: MediaStatus;
  readonly storageKey: string;
  readonly updatedAt: UnixMilliseconds;
  readonly width?: number;
}

/** Publication and build completion are deliberately represented separately. */
export interface SiteBuildState {
  readonly id: SiteBuildId;
  readonly publishedSnapshotId?: ContentSnapshotId;
  readonly requestedAt: UnixMilliseconds;
  readonly requestedBy: ActorId;
  readonly status: SiteBuildStatus;
  readonly targetVersion: number;
}

export interface PublishedState {
  readonly updatedAt: UnixMilliseconds;
  readonly version: number;
}

export interface PageContentModelRoute {
  readonly key: ContentModelKey;
  readonly kind: "page";
  readonly path: string;
}

export interface CollectionContentModelRoute {
  readonly key: ContentModelKey;
  readonly kind: "collection";
  readonly route: string;
}

export type ContentModelRoute = CollectionContentModelRoute | PageContentModelRoute;

/** One block in a flat, fully ordered content snapshot. */
export interface ContentBlock {
  readonly data: JsonObject;
  readonly key: BlockKey;
  readonly position: number;
  readonly schemaVersion: number;
  readonly type: string;
}

interface SnapshotBase {
  readonly blocks: readonly ContentBlock[];
  readonly createdAt: UnixMilliseconds;
  readonly entryId: ContentEntryId;
  readonly fields: JsonObject;
  readonly id: ContentSnapshotId;
  readonly revision: number;
  readonly slug?: string;
  readonly title: string;
  readonly updatedAt: UnixMilliseconds;
  readonly updatedBy: Actor;
}

export interface DraftSnapshot extends SnapshotBase {
  readonly state: "draft";
}

export interface PublishedSnapshot extends SnapshotBase {
  readonly state: "published";
}

export type ContentSnapshot = DraftSnapshot | PublishedSnapshot;

/** A committed entry always owns a draft and optionally its current publication. */
export interface ContentEntry {
  readonly draft: DraftSnapshot;
  readonly id: ContentEntryId;
  readonly model: ContentModelRoute;
  readonly published?: PublishedSnapshot;
}

export interface PublishedRoute {
  readonly entryId: ContentEntryId;
  readonly path: string;
  readonly snapshotId: ContentSnapshotId;
  readonly updatedAt: UnixMilliseconds;
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }
    Object.freeze(value);
  }
  return value;
}

function cloneJson(value: JsonValue): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(cloneJson);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, cloneJson(nestedValue)]),
  );
}

function cloneBlock(block: ContentBlock): ContentBlock {
  return {
    data: cloneJson(block.data) as JsonObject,
    key: block.key,
    position: block.position,
    schemaVersion: block.schemaVersion,
    type: block.type,
  };
}

function cloneSnapshot<Snapshot extends ContentSnapshot>(snapshot: Snapshot): Snapshot {
  return {
    blocks: snapshot.blocks.map(cloneBlock),
    createdAt: snapshot.createdAt,
    entryId: snapshot.entryId,
    fields: cloneJson(snapshot.fields) as JsonObject,
    id: snapshot.id,
    revision: snapshot.revision,
    ...(snapshot.slug === undefined ? {} : { slug: snapshot.slug }),
    state: snapshot.state,
    title: snapshot.title,
    updatedAt: snapshot.updatedAt,
    updatedBy: snapshot.updatedBy,
  } as unknown as Snapshot;
}

function assertCanonicalPath(value: string, name: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !value.startsWith("/") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("\\") ||
    /\s/u.test(value) ||
    value.includes("//") ||
    (value.length > 1 && value.endsWith("/"))
  ) {
    fail("CONTENT_INVALID_STATE", `${name} must be a canonical absolute path.`);
  }
  for (const segment of value.slice(1).split("/")) {
    if (segment === "." || segment === "..") {
      fail("CONTENT_INVALID_STATE", `${name} must not contain dot segments.`);
    }
  }
}

/** Validates a fixed page path at the domain boundary. */
export function normalizePagePublicPath(path: string): string {
  assertCanonicalPath(path, "path");
  if (path.includes(":")) {
    fail("CONTENT_INVALID_STATE", "path must not contain parameter segments.");
  }
  return path;
}

/** Validates a collection route with its one permitted placeholder. */
export function normalizeCollectionPublicRoute(route: string): string {
  assertCanonicalPath(route, "route");
  const segments = route === "/" ? [] : route.slice(1).split("/");
  const slugCount = segments.filter((segment) => segment === ":slug").length;
  if (slugCount !== 1 || segments.some((segment) => segment.includes(":") && segment !== ":slug")) {
    fail("CONTENT_INVALID_STATE", "route must contain exactly one :slug segment and no others.");
  }
  return route;
}

/** Resolves a canonical collection route without interpreting slug syntax as a path. */
export function resolveCollectionPublicPath(route: string, slug: string): string {
  const normalizedRoute = normalizeCollectionPublicRoute(route);
  if (
    typeof slug !== "string" ||
    slug.length === 0 ||
    slug.length > MAX_SLUG_LENGTH ||
    !SLUG_PATTERN.test(slug)
  ) {
    fail(
      "CONTENT_INVALID_STATE",
      "slug must use lowercase ASCII letters, digits, and single hyphens.",
    );
  }
  return normalizePagePublicPath(normalizedRoute.replace(":slug", slug));
}

/** Resolves the public path for one model and, for collections, its publication slug. */
export function resolveContentPublicPath(model: ContentModelRoute, slug?: string): string {
  return model.kind === "page"
    ? normalizePagePublicPath(model.path)
    : resolveCollectionPublicPath(model.route, slug ?? "");
}

/** Enforces page singleton cardinality before a specialized atomic store operation. */
export function assertEntryCreationAllowed(
  kind: ContentModelKind,
  existingEntryCount: number,
): void {
  if (!Number.isSafeInteger(existingEntryCount) || existingEntryCount < 0) {
    fail("CONTENT_INVALID_STATE", "existingEntryCount must be a non-negative safe integer.");
  }
  if (kind === "page" && existingEntryCount > 0) {
    fail("CONTENT_MODEL_CARDINALITY_CONFLICT", "A page model already has its singleton entry.");
  }
}

/** Rejects a route held by another entry while permitting an entry to retain its own path. */
export function assertPublicPathAvailable(
  candidatePath: string,
  candidateEntryId: ContentEntryId,
  existingRoute?: PublishedRoute,
): void {
  normalizePagePublicPath(candidatePath);
  if (existingRoute !== undefined && existingRoute.entryId !== candidateEntryId) {
    fail("CONTENT_ROUTE_CONFLICT", `Public path ${candidatePath} belongs to another entry.`);
  }
}

function assertBlockKeys(blocks: readonly ContentBlock[]): void {
  const keys = new Set<string>();
  for (const block of blocks) {
    if (typeof block.key !== "string" || block.key.length === 0) {
      fail("CONTENT_INVALID_STATE", "Every block must have a stable key.");
    }
    if (keys.has(block.key)) {
      fail("CONTENT_INVALID_STATE", `Duplicate block key ${block.key}.`);
    }
    keys.add(block.key);
  }
}

/** Validates the strict sparse ordering stored with a complete block aggregate. */
export function assertOrderedBlockPositions(blocks: readonly ContentBlock[]): void {
  assertBlockKeys(blocks);
  let previousPosition = 0;
  for (const [index, block] of blocks.entries()) {
    if (!Number.isSafeInteger(block.position) || block.position <= 0) {
      throw new BlockOrderError(index, block.key);
    }
    if (block.position <= previousPosition) {
      throw new BlockOrderError(index, block.key);
    }
    previousPosition = block.position;
  }
}

export type BlockPositionPlan =
  | Readonly<{ readonly kind: "position"; readonly position: number }>
  | Readonly<{ readonly kind: "normalize" }>;

/** Calculates an insertion position or declares that the whole list must be normalized. */
export function planBlockPosition(
  previousPosition: number | undefined,
  nextPosition: number | undefined,
): BlockPositionPlan {
  if (
    previousPosition !== undefined &&
    (!Number.isSafeInteger(previousPosition) || previousPosition <= 0)
  ) {
    fail("CONTENT_INVALID_STATE", "previousPosition must be a positive safe integer.");
  }
  if (nextPosition !== undefined && (!Number.isSafeInteger(nextPosition) || nextPosition <= 0)) {
    fail("CONTENT_INVALID_STATE", "nextPosition must be a positive safe integer.");
  }
  if (previousPosition !== undefined && nextPosition !== undefined) {
    if (previousPosition >= nextPosition) {
      fail("CONTENT_INVALID_STATE", "previousPosition must be less than nextPosition.");
    }
    const position = Math.floor((previousPosition + nextPosition) / 2);
    return position === previousPosition
      ? deepFreeze({ kind: "normalize" })
      : deepFreeze({ kind: "position", position });
  }
  if (previousPosition === undefined && nextPosition === undefined) {
    return deepFreeze({ kind: "position", position: BLOCK_POSITION_STEP });
  }
  if (previousPosition === undefined) {
    const position = Math.floor(nextPosition! / 2);
    return position === 0
      ? deepFreeze({ kind: "normalize" })
      : deepFreeze({ kind: "position", position });
  }
  if (previousPosition > Number.MAX_SAFE_INTEGER - BLOCK_POSITION_STEP) {
    return deepFreeze({ kind: "normalize" });
  }
  return deepFreeze({ kind: "position", position: previousPosition + BLOCK_POSITION_STEP });
}

/** Renumbers a flat block list without changing its supplied order. */
export function normalizeBlockPositions(blocks: readonly ContentBlock[]): readonly ContentBlock[] {
  assertBlockKeys(blocks);
  return deepFreeze(
    blocks.map((block, index) => ({
      ...cloneBlock(block),
      position: (index + 1) * BLOCK_POSITION_STEP,
    })),
  );
}

function assertDraft(snapshot: ContentSnapshot): asserts snapshot is DraftSnapshot {
  if (snapshot.state === "published") {
    fail("CONTENT_PUBLISHED_IMMUTABLE", "Published snapshots cannot be mutated.");
  }
}

function assertSnapshot(snapshot: ContentSnapshot, entryId: ContentEntryId): void {
  if (snapshot.entryId !== entryId) {
    fail("CONTENT_INVALID_STATE", "A snapshot must belong to its content entry.");
  }
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1) {
    fail("CONTENT_INVALID_STATE", "Snapshot revision must be a positive safe integer.");
  }
  if (typeof snapshot.title !== "string" || snapshot.title.length === 0) {
    fail("CONTENT_INVALID_STATE", "A snapshot must have a title.");
  }
  assertOrderedBlockPositions(snapshot.blocks);
}

/** Creates a detached committed entry with one valid draft and no publication. */
export function createContentEntry(input: {
  readonly draft: DraftSnapshot;
  readonly id: ContentEntryId;
  readonly model: ContentModelRoute;
}): ContentEntry {
  if (input.draft.state !== "draft") {
    fail("CONTENT_INVALID_STATE", "A committed entry requires a draft snapshot.");
  }
  assertSnapshot(input.draft, input.id);
  return deepFreeze({ draft: cloneSnapshot(input.draft), id: input.id, model: { ...input.model } });
}

/** A validated relational media-reference projection for one mutable draft. */
export interface DraftMediaReference {
  readonly fieldPath: string;
  readonly mediaId: MediaId;
  readonly sourceKey: "$fields" | BlockKey;
}

export interface CompleteDraftMutation {
  readonly blocks: readonly ContentBlock[];
  readonly expectedRevision: number;
  readonly fields: JsonObject;
  readonly mediaReferences: readonly DraftMediaReference[];
  readonly slug?: string;
  readonly title: string;
  readonly updatedAt: UnixMilliseconds;
  readonly updatedBy: Actor;
}

/** Replaces the whole mutable draft and advances its revision once. */
export function saveCompleteDraft(
  entry: ContentEntry,
  mutation: CompleteDraftMutation,
): ContentEntry {
  assertDraft(entry.draft);
  assertSnapshot(entry.draft, entry.id);
  if (mutation.expectedRevision !== entry.draft.revision) {
    fail(
      "CONTENT_REVISION_CONFLICT",
      "The draft revision no longer matches the expected revision.",
    );
  }
  const draft: DraftSnapshot = {
    blocks: mutation.blocks.map(cloneBlock),
    createdAt: entry.draft.createdAt,
    entryId: entry.id,
    fields: cloneJson(mutation.fields) as JsonObject,
    id: entry.draft.id,
    revision: entry.draft.revision + 1,
    ...(mutation.slug === undefined ? {} : { slug: mutation.slug }),
    state: "draft",
    title: mutation.title,
    updatedAt: mutation.updatedAt,
    updatedBy: mutation.updatedBy,
  };
  assertSnapshot(draft, entry.id);
  return deepFreeze({
    draft: cloneSnapshot(draft),
    id: entry.id,
    model: { ...entry.model },
    ...(entry.published === undefined ? {} : { published: cloneSnapshot(entry.published) }),
  });
}

export interface PublishContentEntryInput {
  readonly expectedRevision: number;
  readonly publishedAt: UnixMilliseconds;
  readonly publishedBy: Actor;
  readonly publishedSnapshotId: ContentSnapshotId;
}

/** Copies the current draft into a detached immutable current publication. */
export function publishContentEntry(
  entry: ContentEntry,
  input: PublishContentEntryInput,
): ContentEntry {
  assertDraft(entry.draft);
  assertSnapshot(entry.draft, entry.id);
  if (input.expectedRevision !== entry.draft.revision) {
    fail(
      "CONTENT_REVISION_CONFLICT",
      "The draft revision no longer matches the expected revision.",
    );
  }
  if (input.publishedSnapshotId === entry.draft.id) {
    fail("CONTENT_INVALID_STATE", "Published and draft snapshots must have different identities.");
  }
  const published: PublishedSnapshot = {
    ...cloneSnapshot(entry.draft),
    createdAt: input.publishedAt,
    id: input.publishedSnapshotId,
    state: "published",
    updatedAt: input.publishedAt,
    updatedBy: input.publishedBy,
  };
  return deepFreeze({
    draft: cloneSnapshot(entry.draft),
    id: entry.id,
    model: { ...entry.model },
    published: cloneSnapshot(published),
  });
}

/** Explicitly rejects attempts to use a published snapshot as a mutation target. */
export function requireMutableDraft(snapshot: ContentSnapshot): DraftSnapshot {
  assertDraft(snapshot);
  return snapshot;
}

export {
  siteBuildFailureReasons,
  sourceFailureReasons,
  BUILD_SOURCE_PATH_PATTERN,
  safeBuildSourcePath,
  normalizeBuildFailure,
} from "./build-diagnostics.js";
export type { SiteBuildFailureReason } from "./build-diagnostics.js";
export {
  siteBuildStatuses,
  terminalSiteBuildStatuses,
  retryableSiteBuildStatuses,
  trackedSiteBuildOutcomes,
  isSiteBuildStatus,
  isTerminalSiteBuildStatus,
  isRetryableSiteBuildStatus,
  trackedOutcomeReasons,
  normalizeTrackedOutcomeReason,
  siteBuildProviderStages,
  isSiteBuildProviderStage,
  siteBuildTrackingPolicy,
} from "./build-status.js";
export type {
  SiteBuildProviderStage,
  SiteBuildStatus,
  TrackedSiteBuildOutcome,
} from "./build-status.js";
