import { test, expect } from "vitest";
import { builtInBlocks } from "./built-ins.js";
import { validateBlockData, validateBlockSettings } from "./definition.js";
import { migrateGalleryToV6 } from "./gallery-migration.js";
import { migrateBlockData } from "./migration.js";

const gallery = builtInBlocks.gallery;
const images = [{ media: "a" }, { media: "b" }, { kind: "image", media: "c" }];

test("gallery declares exactly one migration, to version 6", () => {
  expect(gallery.version).toBe(6);
  expect(Object.keys(gallery.migrations ?? {})).toEqual(["6"]);
  expect(gallery.migrations?.[6]).toBe(migrateGalleryToV6);
});

test("featured-first becomes columns-2 with a full first item", () => {
  const settings = { layoutMode: "grid", layoutPreset: "featured-first", lightbox: true };
  const migrated = migrateBlockData(gallery, { data: { images, title: "Work" }, settings }, 5);
  expect(migrated).toEqual({
    data: { images: [{ media: "a", placement: "full" }, images[1], images[2]], title: "Work" },
    settings: { layoutMode: "grid", layoutPreset: "columns-2", lightbox: true },
  });
  expect(validateBlockData(gallery, migrated.data, "publish").images[0]).toMatchObject({
    placement: "full",
  });
  expect(validateBlockSettings(gallery, migrated.settings).layoutPreset).toBe("columns-2");
});

test("featured-first without items and in flex mode is rewritten too", () => {
  expect(
    migrateBlockData(
      gallery,
      { data: { images: [] }, settings: { layoutPreset: "featured-first" } },
      5,
    ),
  ).toEqual({ data: { images: [] }, settings: { layoutPreset: "columns-2" } });
  expect(
    migrateBlockData(gallery, { data: {}, settings: { layoutPreset: "featured-first" } }, 5),
  ).toEqual({ data: {}, settings: { layoutPreset: "columns-2" } });
  const flex = { layoutMode: "flex-row", layoutPreset: "featured-first" };
  expect(migrateBlockData(gallery, { data: { images }, settings: flex }, 5)).toEqual({
    data: { images: [{ media: "a", placement: "full" }, images[1], images[2]] },
    settings: { layoutMode: "flex-row", layoutPreset: "columns-2" },
  });
});

test("video items without playback keep the player default", () => {
  const video = { kind: "video", videoTitle: "Tour", videoUrl: "https://vimeo.com/1" };
  const ambient = { ...video, playback: "ambient" };
  const migrated = migrateBlockData(
    gallery,
    { data: { images: [video, ambient, { media: "a" }] }, settings: {} },
    5,
  );
  expect(migrated.data).toEqual({
    images: [{ ...video, playback: "player" }, ambient, { media: "a" }],
  });
  expect(validateBlockData(gallery, migrated.data, "publish").images[0]?.playback).toBe("player");
  expect(validateBlockData(gallery, { images: [video] }, "publish").images[0]?.playback).toBe(
    "ambient",
  );
});

test("an ordinary gallery is unchanged", () => {
  const block = {
    data: { images, title: "Studio" },
    settings: { layoutMode: "grid", layoutPreset: "columns-3", layoutWrap: true, lightbox: false },
  };
  expect(migrateBlockData(gallery, block, 5)).toEqual(block);
});

test("a gallery older than rc2 has no migration step", () => {
  expect(() => migrateBlockData(gallery, { data: { images }, settings: {} }, 4)).toThrowError(
    expect.objectContaining({ code: "missing_step", fromVersion: 4, toVersion: 6 }),
  );
});
