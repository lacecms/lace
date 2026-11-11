import type { JsonObject, JsonValue } from "../shared/json.js";
import { isRecord } from "../shared/objects.js";
import type { BlockMigrationInput, BlockMigrationOutput } from "./types.js";

/**
 * Gallery version 6 (from the rc2 shape, version 5): the removed
 * `featured-first` preset becomes `columns-2` with a `full` first item, and
 * video items that relied on the old `player` default keep it explicitly.
 */
export function migrateGalleryToV6({ data, settings }: BlockMigrationInput): BlockMigrationOutput {
  const featured = settings.layoutPreset === "featured-first";
  const images: JsonValue | undefined = data.images;
  const migrated = Array.isArray(images)
    ? images.map((item, index): JsonValue => {
        if (!isRecord(item)) return item;
        let next: JsonObject = item as JsonObject;
        if (featured && index === 0) next = { ...next, placement: "full" };
        if (next.kind === "video" && next.playback === undefined) {
          next = { ...next, playback: "player" };
        }
        return next;
      })
    : images;
  return {
    data: migrated === undefined ? data : { ...data, images: migrated },
    settings: featured ? { ...settings, layoutPreset: "columns-2" } : settings,
  };
}
