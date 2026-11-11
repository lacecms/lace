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
  PublicRecordContent,
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
  PublicRecordSource,
  BuildExportPageSource,
  BuildExportSource,
} from "@lacecms/contracts";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Mirrors } from "./test-support/mirrors.js";

// Fix a mismatch in the application/source pair, or document a deliberately private
// application key in Omitted. Do not broaden this check to hide missing keys.

// Distribute by source so a missing blockKey/blockType cannot hide in union keyof.
type UsageMirrors<App extends { source: string }> = App extends unknown
  ? Mirrors<App, Extract<MediaUsageLocationDtoSource, { source: App["source"] }>>
  : never;

const checks = {
  // Discovery exposes every application metadata property; no omissions.
  ContentModelSource: true satisfies Mirrors<
    DiscoveredContentModel,
    ContentModelSource,
    never,
    "seo" | "seoDefaults"
  >,
  // Configured list options cross discovery intact; no omissions.
  CollectionListOptionsSource: true satisfies Mirrors<
    CollectionListOptions,
    CollectionListOptionsSource
  >,
  // Entry summaries retain the same metadata, including publication identity.
  ContentEntrySummarySource: true satisfies Mirrors<ContentEntrySummary, ContentEntrySummarySource>,
  // Secret material is absent from both metadata types; no omissions.
  ImportTokenDtoSource: true satisfies Mirrors<ImportTokenMetadata, ImportTokenDtoSource>,
  // MediaView already removes storage identities; all remaining keys are public to admins.
  MediaMetadataDtoSource: true satisfies Mirrors<MediaView, MediaMetadataDtoSource>,
  // Detail adds bounded usage to the same admin metadata; no omissions.
  MediaDetailDtoSource: true satisfies Mirrors<
    MediaDetailView,
    MediaDetailDtoSource,
    never,
    "usage"
  >,
  // Every discriminant member retains its location and states; no omissions.
  MediaUsageLocationDtoSource: true satisfies UsageMirrors<MediaUsageLocation>,
  // Public entry projection receives all keys; narrower nested media checked below.
  PublicEntrySource: true satisfies Mirrors<PublicContentEntry, PublicEntrySource>,
  // Public media discloses descriptive/rendering metadata only; storage, lifecycle,
  // attribution, filenames, hash, size, tags and timestamps are intentionally private.
  PublicMediaSource: true satisfies Mirrors<
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
  PublicGlobalSource: true satisfies Mirrors<PublicGlobalContent, PublicGlobalSource>,
  // Route-less records have no path; all other application properties cross this boundary.
  PublicRecordSource: true satisfies Mirrors<PublicRecordContent, PublicRecordSource>,
  // Export pages carry all pagination and publication keys; no omissions.
  BuildExportPageSource: true satisfies Mirrors<BuildContentExportPage, BuildExportPageSource>,
  // A complete export is the first page without its continuation cursor.
  BuildExportSource: true satisfies Mirrors<
    BuildContentExportPage,
    BuildExportSource,
    "nextCursor"
  >,
} as const;

const contractsSource = join(import.meta.dirname, "../../contracts/src");

function sourceModules(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceModules(path);
    return entry.name.endsWith(".ts") && !/\.(?:type-)?test\.ts$/u.test(entry.name) ? [path] : [];
  });
}

/** `…Source` types declared by contracts modules and re-exported by the contracts entry. */
function exportedSourceTypes(): string[] {
  const entry = readFileSync(join(contractsSource, "index.ts"), "utf8");
  const starModules = new Set(
    [...entry.matchAll(/export \* from "\.\/([^"]+)\.js";/gu)].map((match) => `${match[1]}.ts`),
  );
  const listed = new Set(
    [...entry.matchAll(/export (?:type )?\{([^}]*)\}/gu)].flatMap((match) =>
      match[1]!.split(",").map((name) => name.trim().replace(/^type /u, "")),
    ),
  );
  return sourceModules(contractsSource)
    .flatMap((path) => {
      const module = relative(contractsSource, path).split("\\").join("/");
      return [...readFileSync(path, "utf8").matchAll(/export (?:interface|type) (\w+Source)\b/gu)]
        .map((match) => match[1]!)
        .filter((name) => starModules.has(module) || listed.has(name));
    })
    .sort();
}

test("every exported contracts projection input has a mirror check", () => {
  expect(exportedSourceTypes()).toEqual(Object.keys(checks).sort());
});

// Deliberately broken fixtures: each check must fail to typecheck.
interface Shape {
  readonly a: string;
  readonly b?: number;
  readonly nested: { readonly c: string };
  readonly items: readonly { readonly d: string }[];
}
const brokenChecks = {
  // @ts-expect-error an application key is neither projected nor omitted
  unprojected: true satisfies Mirrors<Shape & { readonly extra: string }, Shape>,
  // @ts-expect-error a source key does not exist on the application result
  sourceOnly: true satisfies Mirrors<Shape, Shape & { readonly extra?: string }>,
  // @ts-expect-error a key is optional on one side only
  optionality: true satisfies Mirrors<Omit<Shape, "b"> & { readonly b: number }, Shape>,
  // @ts-expect-error a nested object gained an unprojected key
  nested: true satisfies Mirrors<
    Omit<Shape, "nested"> & { readonly nested: { readonly c: string; readonly e: string } },
    Shape,
    never,
    "nested"
  >,
  // @ts-expect-error an array element gained an unprojected key
  element: true satisfies Mirrors<
    Omit<Shape, "items"> & {
      readonly items: readonly { readonly d: string; readonly e: string }[];
    },
    Shape,
    never,
    "items"
  >,
  mirrored: true satisfies Mirrors<Shape, Shape, never, "nested" | "items">,
} as const;

test("the mirror check rejects broken fixtures", () => {
  expect(Object.keys(brokenChecks)).toHaveLength(6);
});
