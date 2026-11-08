import { foldAscii } from "@lacecms/application";
import type {
  ContentEntryListValues,
  ContentEntrySort,
  ContentEntryStatus,
  ContentEntrySummary,
  ConfigurationSyncModel,
  CursorPage,
  MediaSort,
  StoredContentModelState,
} from "@lacecms/application";
import {
  DomainError,
  StaleSynchronizationError,
  cloneEntrySeo,
  contentSnapshotId,
  contentModelKey,
  createContentEntry,
  publishContentEntry,
} from "@lacecms/domain";
import type {
  ContentEntry,
  ContentModelRoute,
  DraftSnapshot,
  MediaMetadata,
  PublishedSnapshot,
} from "@lacecms/domain";
import type { NormalizedContentModel } from "@lacecms/config";
import type { JsonValue } from "@lacecms/content";
import { clone, utf8Length } from "../shared/assertions.js";

export function storedExportBytes(snapshot: PublishedSnapshot): number {
  let bytes = utf8Length(JSON.stringify(snapshot.fields));
  if (snapshot.seo !== undefined) bytes += utf8Length(JSON.stringify(cloneEntrySeo(snapshot.seo)));
  for (const block of snapshot.blocks) {
    if (block.hidden) continue;
    bytes +=
      utf8Length(JSON.stringify(block.data)) + utf8Length(JSON.stringify(block.settings ?? {}));
  }
  return bytes;
}

export const BUILD_EXPORT_CURSOR_PREFIX = "build-export:";

export function copyEntry(entry: ContentEntry): ContentEntry {
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

export function copyCursorPage<Value>(page: CursorPage<Value>): CursorPage<Value> {
  return Object.freeze({
    items: Object.freeze(page.items.map((item) => clone(item))),
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
  });
}

export function sameStoredModelStates(
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
      value.publicProjectionHash === candidate.publicProjectionHash &&
      value.publicProjectionSourceHash === candidate.publicProjectionSourceHash &&
      (value.structure === undefined) === (candidate.structure === undefined) &&
      value.snapshotFingerprint === candidate.snapshotFingerprint &&
      value.entryCount === candidate.entryCount &&
      value.draftSnapshotCount === candidate.draftSnapshotCount &&
      value.publishedSnapshotCount === candidate.publishedSnapshotCount
    );
  });
}

export function stateForModel(
  model: ConfigurationSyncModel,
  configuration: NormalizedContentModel,
): StoredContentModelState {
  return Object.freeze({
    draftSnapshotCount: 0,
    entryCount: 0,
    key: model.key,
    kind: model.kind,
    projectionHash: model.projectionHash,
    ...(configuration.publicProjectionHash === undefined
      ? {}
      : { publicProjectionHash: configuration.publicProjectionHash }),
    publicProjectionSourceHash: model.projectionHash,
    publishedSnapshotCount: 0,
    ...(configuration.structure === undefined ? {} : { structure: configuration.structure }),
    structureHash: model.structureHash,
    version: model.version,
  });
}

export function staleMigration(): DomainError {
  return new StaleSynchronizationError(
    "Block migration guard failed; the synchronization plan is stale.",
  );
}

export function entrySnapshots(
  entry: ContentEntry,
): readonly (DraftSnapshot | PublishedSnapshot)[] {
  return entry.published === undefined ? [entry.draft] : [entry.draft, entry.published];
}

export function withFieldDefault<Snapshot extends DraftSnapshot | PublishedSnapshot>(
  snapshot: Snapshot,
  fieldKey: string,
  value: JsonValue,
): Snapshot {
  if (Object.hasOwn(snapshot.fields, fieldKey)) return snapshot;
  return Object.freeze({
    ...snapshot,
    fields: Object.freeze({ ...snapshot.fields, [fieldKey]: value }),
  }) as unknown as Snapshot;
}

export function routeForModel(model: NormalizedContentModel): ContentModelRoute {
  const key = contentModelKey(model.key);
  switch (model.kind) {
    case "page":
      return Object.freeze({ key, kind: "page", path: model.path });
    case "collection":
      return Object.freeze({ key, kind: "collection", route: model.route });
    case "global":
      return Object.freeze({ key, kind: "global" });
    default:
      return model satisfies never;
  }
}

export interface StoredPublicationIdempotency {
  readonly entry: ContentEntry;
  readonly fingerprint: string;
}

export function entryStatus(entry: ContentEntry): ContentEntryStatus {
  if (entry.published === undefined) return "draft";
  return entry.published.revision === entry.draft.revision ? "published" : "changed";
}

export function listValues(
  entry: ContentEntry,
  listFields: readonly string[],
): ContentEntryListValues {
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

export function matchesSearch(entry: ContentEntry, q: string | undefined): boolean {
  if (q === undefined) return true;
  const term = foldAscii(q);
  return foldAscii(entry.draft.title).includes(term) || (entry.draft.slug ?? "").includes(term);
}

export function compareNoCase(left: string, right: string): number {
  const foldedLeft = foldAscii(left);
  const foldedRight = foldAscii(right);
  return foldedLeft < foldedRight ? -1 : foldedLeft > foldedRight ? 1 : 0;
}

export function compareMedia(left: MediaMetadata, right: MediaMetadata, sort: MediaSort): number {
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

export function compareSummaries(
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
