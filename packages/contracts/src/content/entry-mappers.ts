import type { ContentEntry, ContentSnapshot, UnixMilliseconds } from "@lacecms/domain";
import * as v from "valibot";
import { toIsoTimestamp } from "../shared/primitives.js";
import { toContentBlockDto } from "./blocks.js";
import { toContentModelRouteDto } from "./model-projection.js";
import { toSeoDto } from "./seo.js";
import type { SeoMappingOptions } from "./seo.js";
import { draftSnapshotSchema, publishedSnapshotSchema } from "./entries.js";
import type {
  ContentSnapshotDto,
  ContentEntryDto,
  AdminContentEntryDto,
  PublishContentEntryResultDto,
  UnpublishContentEntryResultDto,
  ContentEntrySummaryDto,
  ContentEntryStatusTotalsDto,
  ContentEntryListDto,
} from "./entries.js";

export function toContentSnapshotDto(
  snapshot: ContentSnapshot,
  options: SeoMappingOptions = {},
): ContentSnapshotDto {
  const base = {
    blocks: snapshot.blocks.map(toContentBlockDto),
    createdAt: toIsoTimestamp(snapshot.createdAt),
    entryId: snapshot.entryId,
    fields: snapshot.fields,
    id: snapshot.id,
    revision: snapshot.revision,
    ...(options.seo === true ? { seo: toSeoDto(snapshot.seo) } : {}),
    ...(snapshot.slug === undefined ? {} : { slug: snapshot.slug }),
    title: snapshot.title,
    updatedAt: toIsoTimestamp(snapshot.updatedAt),
    updatedBy: snapshot.updatedBy,
  };
  return snapshot.state === "draft" ? { ...base, state: "draft" } : { ...base, state: "published" };
}

export function toContentEntryDto(
  entry: ContentEntry,
  options: SeoMappingOptions = {},
): ContentEntryDto {
  return {
    draft: toContentSnapshotDto(entry.draft, options) as v.InferOutput<typeof draftSnapshotSchema>,
    id: entry.id,
    model: toContentModelRouteDto(entry.model),
    ...(entry.published === undefined
      ? {}
      : {
          published: toContentSnapshotDto(entry.published, options) as v.InferOutput<
            typeof publishedSnapshotSchema
          >,
        }),
  };
}

/** Maps an entry for admin responses, adding the draft's last editor display name. */
export function toAdminContentEntryDto(
  entry: ContentEntry,
  updatedBy: { readonly displayName: string; readonly id: string },
  options: SeoMappingOptions = {},
): AdminContentEntryDto {
  return {
    ...toContentEntryDto(entry, options),
    updatedBy: { displayName: updatedBy.displayName, id: updatedBy.id },
  };
}

/** Maps the portable publication command outcome without exposing application internals. */
export function toPublishContentEntryResultDto(input: {
  readonly build:
    | Readonly<{ readonly status: "queued"; readonly targetVersion: number }>
    | Readonly<{ readonly status: "not-dispatched" }>;
  readonly entry: ContentEntry;
  readonly publication: "published" | "replayed";
  readonly seo?: boolean;
  readonly updatedBy: { readonly displayName: string; readonly id: string };
}): PublishContentEntryResultDto {
  return {
    build:
      input.build.status === "queued"
        ? { status: "queued", targetVersion: input.build.targetVersion }
        : { status: input.build.status },
    entry: toAdminContentEntryDto(input.entry, input.updatedBy, { seo: input.seo === true }),
    publication: input.publication,
  };
}

/** Maps the portable unpublication outcome without exposing application internals. */
export function toUnpublishContentEntryResultDto(input: {
  readonly build:
    | Readonly<{ readonly status: "queued"; readonly targetVersion: number }>
    | Readonly<{ readonly status: "not-dispatched" }>;
  readonly entry: ContentEntry;
  readonly seo?: boolean;
  readonly unpublication: "replayed" | "unpublished";
  readonly updatedBy: { readonly displayName: string; readonly id: string };
}): UnpublishContentEntryResultDto {
  return {
    build:
      input.build.status === "queued"
        ? { status: "queued", targetVersion: input.build.targetVersion }
        : { status: input.build.status },
    entry: toAdminContentEntryDto(input.entry, input.updatedBy, { seo: input.seo === true }),
    unpublication: input.unpublication,
  };
}

export function toAdminEntryProjectionDto(input: {
  readonly entry: ContentEntry;
  readonly updatedBy: { readonly id: string; readonly displayName: string };
  readonly seo: boolean;
}): AdminContentEntryDto {
  return toAdminContentEntryDto(input.entry, input.updatedBy, { seo: input.seo });
}
export type ContentEntrySummarySource = Omit<
  ContentEntrySummaryDto,
  "updatedAt" | "publishedAt"
> & {
  readonly updatedAt: UnixMilliseconds;
  readonly publishedAt?: UnixMilliseconds;
};
export function toContentEntryListDto(input: {
  readonly items: readonly ContentEntrySummarySource[];
  readonly totals: ContentEntryStatusTotalsDto;
  readonly nextCursor?: string;
}): ContentEntryListDto {
  return {
    items: input.items.map((entry) => ({
      draftRevision: entry.draftRevision,
      id: entry.id,
      listValues: entry.listValues,
      modelKey: entry.modelKey,
      ...(entry.publishedAt === undefined
        ? {}
        : { publishedAt: toIsoTimestamp(entry.publishedAt) }),
      ...(entry.publishedSnapshotId === undefined
        ? {}
        : { publishedSnapshotId: entry.publishedSnapshotId }),
      ...(entry.slug === undefined ? {} : { slug: entry.slug }),
      status: entry.status,
      title: entry.title,
      updatedAt: toIsoTimestamp(entry.updatedAt),
      updatedBy: entry.updatedBy,
    })),
    totals: input.totals,
    ...(input.nextCursor === undefined ? {} : { nextCursor: input.nextCursor }),
  };
}
