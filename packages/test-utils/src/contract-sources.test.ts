import { expect, test } from "vitest";
import type {
  DiscoveredContentModel,
  ContentEntrySummary,
  ImportTokenMetadata,
  MediaView,
  MediaDetailView,
  MediaUsageLocation,
  PublicContentEntry,
  PublicGlobalContent,
  BuildContentExportPage,
} from "@lacecms/application";
import type { CollectionListOptions } from "@lacecms/config";
import type { MediaMetadata } from "@lacecms/domain";
import type {
  ContentModelSource,
  CollectionListOptionsSource,
  ContentEntrySummarySource,
  ImportTokenDtoSource,
  MediaMetadataDtoSource,
  MediaDetailDtoSource,
  MediaUsageLocationDtoSource,
  PublicEntrySource,
  PublicMediaSource,
  PublicGlobalSource,
  BuildExportPageSource,
} from "@lacecms/contracts";

// Fix a mismatch in the application/source pair, or document a deliberately private
// application key in Omitted. Do not broaden this check to hide missing keys.
type Mirrors<App, Source, Omitted extends keyof App = never> = [App] extends [Source]
  ? [Exclude<keyof App, keyof Source | Omitted>] extends [never]
    ? [Exclude<keyof Source, keyof App>] extends [never]
      ? true
      : { sourceOnly: Exclude<keyof Source, keyof App> }
    : { unprojected: Exclude<keyof App, keyof Source | Omitted> }
  : { notAssignable: [App, Source] };

// Distribute by source so a missing blockKey/blockType cannot hide in union keyof.
type UsageMirrors<App extends { source: string }> = App extends unknown
  ? Mirrors<App, Extract<MediaUsageLocationDtoSource, { source: App["source"] }>>
  : never;

const checks = {
  // Discovery exposes every application metadata property; no omissions.
  contentModel: true satisfies Mirrors<DiscoveredContentModel, ContentModelSource>,
  // Configured list options cross discovery intact; no omissions.
  listOptions: true satisfies Mirrors<CollectionListOptions, CollectionListOptionsSource>,
  // Entry summaries retain the same metadata, including publication identity.
  entrySummary: true satisfies Mirrors<ContentEntrySummary, ContentEntrySummarySource>,
  // Secret material is absent from both metadata types; no omissions.
  importToken: true satisfies Mirrors<ImportTokenMetadata, ImportTokenDtoSource>,
  // MediaView already removes storage identities; all remaining keys are public to admins.
  mediaMetadata: true satisfies Mirrors<MediaView, MediaMetadataDtoSource>,
  // Detail adds bounded usage to the same admin metadata; no omissions.
  mediaDetail: true satisfies Mirrors<MediaDetailView, MediaDetailDtoSource>,
  // Every discriminant member retains its location and states; no omissions.
  mediaUsage: true satisfies UsageMirrors<MediaUsageLocation>,
  // Public entry projection receives all keys; narrower nested media checked below.
  publicEntry: true satisfies Mirrors<PublicContentEntry, PublicEntrySource>,
  // Public media discloses descriptive/rendering metadata only; storage, lifecycle,
  // attribution, filenames, hash, size, tags and timestamps are intentionally private.
  publicMedia: true satisfies Mirrors<
    MediaMetadata,
    PublicMediaSource,
    | "createdAt"
    | "createdBy"
    | "filename"
    | "sha256"
    | "size"
    | "status"
    | "storageKey"
    | "tags"
    | "updatedAt"
  >,
  // Globals have no path; all other application properties cross this boundary.
  publicGlobal: true satisfies Mirrors<PublicGlobalContent, PublicGlobalSource>,
  // Export pages carry all pagination and publication keys; no omissions.
  buildExportPage: true satisfies Mirrors<BuildContentExportPage, BuildExportPageSource>,
} as const;

test("contract sources mirror eleven application results", () => {
  expect(Object.keys(checks)).toHaveLength(11);
});
