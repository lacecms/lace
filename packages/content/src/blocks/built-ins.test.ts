// @ts-nocheck
// TODO(rf2): Type recursive descriptor fixtures, malformed runtime inputs and table tuples.
import { test, expect } from "vitest";
import {
  validateBlockData,
  validateBlockSettings,
  defineBlock,
  toBlockMetadata,
  publishedBlockData,
} from "./definition.js";
import { migrateBlockData } from "./migration.js";
import { toBlockRegistryMetadata, defineBlockRegistry } from "./registry.js";
import { builtInBlocks } from "./built-ins.js";
import { ContentValidationError } from "../shared/errors.js";
import { issueFrom } from "../test-support/content-test-helpers.js";
import { field } from "../fields/builders.js";
import { canonicalizeJson, sha256CanonicalJson } from "../entries/canonical-json.js";
import { validateSnapshotListBudget } from "../fields/validation.js";

test("image version 4 keeps alt text optional", () => {
  expect(validateBlockData(builtInBlocks.image, { media: "media-1" }, "publish")).toEqual({
    media: "media-1",
  });
  expect(() => validateBlockData(builtInBlocks.image, { alt: "A lake" }, "publish")).toThrow(
    ContentValidationError,
  );
  expect(validateBlockSettings(builtInBlocks.image, {})).toEqual({ lightbox: false });
  const metadata = toBlockRegistryMetadata(defineBlockRegistry([builtInBlocks.image]))[0];
  expect(metadata).toMatchObject({ type: "image", version: 4 });
  expect(metadata.fields.alt.required).toBe(false);
});

test("image blocks and gallery items take an optional safe link", () => {
  const { gallery, image } = builtInBlocks;
  const link = {
    description: "Selecting the image opens this link instead of the full-screen view.",
    label: "Link",
    required: false,
    type: "url",
  };
  const [imageMetadata, galleryMetadata] = toBlockRegistryMetadata(
    defineBlockRegistry([image, gallery]),
  );
  expect(imageMetadata.fields.link).toMatchObject(link);
  expect(galleryMetadata.fields.images.item.fields.link).toMatchObject(link);
  for (const value of ["/work/kitchen", "#contact", "https://example.com/", "mailto:a@b.co"])
    expect(validateBlockData(image, { link: value, media: "m" }, "publish")).toEqual({
      link: value,
      media: "m",
    });
  const item = { link: "https://example.com/", media: "m" };
  const defaults = {
    aspectRatio: "16:9",
    kind: "image",
    placement: "auto",
    playback: "ambient",
    size: "fill",
  };
  expect(validateBlockData(gallery, { images: [item, { media: "n" }] }, "publish")).toEqual({
    images: [
      { ...defaults, ...item },
      { ...defaults, media: "n" },
    ],
  });
  expect(
    issueFrom(() => validateBlockData(image, { link: "javascript:alert(1)", media: "m" }, "draft"))
      .path,
  ).toEqual(["link"]);
  expect(
    issueFrom(() =>
      validateBlockData(
        gallery,
        { images: [{ media: "m" }, { link: "javascript:alert(1)", media: "n" }] },
        "publish",
      ),
    ).path,
  ).toEqual(["images", 1, "link"]);
});

test("image and gallery items declare media first without changing identity", async () => {
  const { gallery, image } = builtInBlocks;
  const [imageMetadata, galleryMetadata] = toBlockRegistryMetadata(
    defineBlockRegistry([image, gallery]),
  );
  expect(Object.keys(imageMetadata.fields)).toEqual(["media", "alt", "caption", "link"]);
  expect(Object.keys(galleryMetadata.fields.images.item.fields)).toEqual([
    "kind",
    "media",
    "videoUrl",
    "alt",
    "videoTitle",
    "caption",
    "link",
    "size",
    "playback",
    "aspectRatio",
    "placement",
  ]);
  const sorted = (fields) =>
    Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)));
  const { images } = gallery.fields;
  const block = (definition, fields) =>
    defineBlock({
      description: definition.description,
      fields,
      label: definition.label,
      migrations: definition.migrations,
      settings: definition.settings,
      ...(definition.settingsLayout ? { settingsLayout: definition.settingsLayout } : {}),
      ...(definition.settingsVisibility
        ? { settingsVisibility: definition.settingsVisibility }
        : {}),
      type: definition.type,
      version: definition.version,
    });
  const alphabetical = [
    block(image, sorted(image.fields)),
    block(gallery, {
      ...gallery.fields,
      images: field.list({
        defaultValue: [],
        item: field.group({
          fields: sorted(images.item.fields),
          visibility: images.item.visibility,
        }),
        itemLabel: images.itemLabel,
        label: images.label,
        maxItems: images.maxItems,
        minItems: images.minItems,
      }),
    }),
  ];
  expect(Object.keys(alphabetical[0].fields)).toEqual(["alt", "caption", "link", "media"]);
  for (const [index, definition] of [image, gallery].entries()) {
    const reordered = toBlockMetadata(definition);
    const original = toBlockMetadata(alphabetical[index]);
    expect(canonicalizeJson(reordered)).toBe(canonicalizeJson(original));
    expect(await sha256CanonicalJson(reordered)).toBe(await sha256CanonicalJson(original));
  }
  expect([image.version, gallery.version]).toEqual([4, 6]);
});

test("the lightbox setting of image and gallery is a validated boolean", () => {
  for (const definition of [builtInBlocks.image, builtInBlocks.gallery]) {
    expect(validateBlockSettings(definition, { lightbox: true }).lightbox).toBe(true);
    expect(validateBlockSettings(definition, {}).lightbox).toBe(false);
    expect(() => validateBlockSettings(definition, { lightbox: "yes" })).toThrow(
      ContentValidationError,
    );
    expect(() => validateBlockSettings(definition, { zoom: true })).toThrow(ContentValidationError);
  }
});

test("gallery collects image items that become publishable with one image", () => {
  const { gallery } = builtInBlocks;
  expect(gallery.version).toBe(6);
  expect(validateBlockSettings(gallery, {})).toEqual({
    lightbox: false,
    layoutMode: "grid",
    layoutWrap: true,
    layoutPreset: "auto",
  });
  const defaults = {
    aspectRatio: "16:9",
    kind: "image",
    placement: "auto",
    playback: "ambient",
    size: "fill",
  };
  expect(validateBlockData(gallery, {}, "draft")).toEqual({ images: [] });
  expect(issueFrom(() => validateBlockData(gallery, {}, "publish"))).toMatchObject({
    code: "list_too_short",
    path: ["images"],
  });
  const item = { media: "media-1" };
  expect(validateBlockData(gallery, { images: [item], title: "Studio" }, "publish")).toEqual({
    images: [{ ...defaults, ...item }],
    title: "Studio",
  });
  expect(validateBlockData(gallery, { images: [{ caption: "Draft" }] }, "draft")).toEqual({
    images: [{ ...defaults, caption: "Draft" }],
  });
  expect(
    issueFrom(() => validateBlockData(gallery, { images: [{ caption: "Draft" }] }, "publish")),
  ).toMatchObject({ code: "missing_required_field", path: ["images", 0, "media"] });
  for (const mode of ["draft", "publish"])
    expect(
      issueFrom(() => validateBlockData(gallery, { images: Array(51).fill(item) }, mode)),
    ).toMatchObject({ code: "list_too_long", path: ["images"] });
  expect(
    issueFrom(() => validateBlockData(gallery, { images: [{ ...item, width: 3 }] }, "draft")),
  ).toMatchObject({ code: "unknown_field", path: ["images", 0, "width"] });
  const metadata = toBlockRegistryMetadata(defineBlockRegistry([gallery]))[0];
  expect(metadata.fields.images).toMatchObject({
    defaultValue: [],
    itemLabel: "caption",
    label: "Images and videos",
    maxItems: 50,
    minItems: 1,
    type: "list",
  });
});

test("gallery items hold an image or a video through conditional fields", () => {
  const { gallery, videoEmbed } = builtInBlocks;
  const { item } = gallery.fields.images;
  expect(item.visibility).toEqual({
    media: { field: "kind", values: ["image"] },
    alt: { field: "kind", values: ["image"] },
    link: { field: "kind", values: ["image"] },
    size: { field: "kind", values: ["image"] },
    videoUrl: { field: "kind", values: ["video"] },
    videoTitle: { field: "kind", values: ["video"] },
    playback: { field: "kind", values: ["video"] },
    aspectRatio: { field: "kind", values: ["video"] },
  });
  const metadata = toBlockMetadata(gallery).fields.images.item.fields;
  const embed = toBlockMetadata(videoEmbed);
  expect(metadata.playback).toEqual({ ...embed.settings.playback, defaultValue: "ambient" });
  expect(embed.settings.playback.defaultValue).toBe("player");
  expect(validateBlockSettings(videoEmbed, {}).playback).toBe("player");
  expect(metadata.placement).toMatchObject({
    defaultValue: "auto",
    label: "Placement",
    options: ["auto", "full", "start", "end"],
  });
  expect(metadata.size).toMatchObject({
    defaultValue: "fill",
    label: "Size",
    options: ["fill", "natural"],
    presentation: { control: "cards" },
    required: true,
  });
  expect(metadata.size.description).toMatch(/natural image keeps its own width/i);
  expect(metadata.aspectRatio).toEqual(embed.settings.aspectRatio);
  expect(metadata.kind).toMatchObject({
    defaultValue: "image",
    label: "Type",
    options: ["image", "video"],
    presentation: { control: "cards" },
    required: true,
  });
  expect(metadata.videoUrl).toMatchObject({ embedProviders: ["youtube", "vimeo"], required: true });
  expect(metadata.videoTitle).toMatchObject({ label: "Video title", minLength: 1, required: true });

  const video = {
    kind: "video",
    videoUrl: "https://vimeo.com/76979871",
    videoTitle: "Studio tour",
    playback: "ambient",
    aspectRatio: "1:1",
    caption: "Spring 2026",
  };
  const parsed = validateBlockData(gallery, { images: [video] }, "publish");
  const parsedVideo = { ...video, placement: "auto" };
  expect(parsed).toEqual({ images: [{ ...parsedVideo, size: "fill" }] });
  expect(publishedBlockData(gallery, parsed)).toEqual({ images: [parsedVideo] });
  const minimal = { kind: "video", videoUrl: video.videoUrl, videoTitle: "Tour" };
  expect(validateBlockData(gallery, { images: [minimal] }, "publish").images[0]).toMatchObject({
    aspectRatio: "16:9",
    placement: "auto",
    playback: "ambient",
  });

  const draft = { images: [{ kind: "video" }] };
  expect(validateBlockData(gallery, draft, "draft").images).toHaveLength(1);
  expect(issueFrom(() => validateBlockData(gallery, draft, "publish"))).toMatchObject({
    code: "missing_required_field",
    path: ["images", 0, "videoUrl"],
  });
  for (const mode of ["draft", "publish"])
    expect(
      issueFrom(() =>
        validateBlockData(gallery, { images: [{ ...minimal, videoTitle: "" }] }, mode),
      ).path,
    ).toEqual(["images", 0, "videoTitle"]);
  for (const mode of ["draft", "publish"])
    expect(
      issueFrom(() =>
        validateBlockData(
          gallery,
          { images: [{ ...minimal, videoUrl: "https://example.com/clip" }] },
          mode,
        ),
      ).path,
    ).toEqual(["images", 0, "videoUrl"]);

  const stale = { ...video, media: "m", alt: "Old", link: "/work" };
  const staleParsed = validateBlockData(gallery, { images: [stale] }, "publish");
  expect(staleParsed.images[0]).toMatchObject({ media: "m", alt: "Old", link: "/work" });
  expect(publishedBlockData(gallery, staleParsed)).toEqual({ images: [parsedVideo] });
  const image = { kind: "image", media: "m", videoUrl: video.videoUrl, caption: "Kept" };
  expect(
    publishedBlockData(gallery, validateBlockData(gallery, { images: [image] }, "publish")),
  ).toEqual({
    images: [{ kind: "image", media: "m", caption: "Kept", placement: "auto", size: "fill" }],
  });
});

test("gallery items carry a placement and image items a size", () => {
  const { gallery } = builtInBlocks;
  const image = { kind: "image", media: "m", placement: "end", size: "natural" };
  const video = {
    kind: "video",
    placement: "full",
    videoTitle: "Tour",
    videoUrl: "https://vimeo.com/1",
  };
  const parsed = validateBlockData(gallery, { images: [image, video] }, "publish");
  expect(publishedBlockData(gallery, parsed)).toEqual({
    images: [image, { ...video, aspectRatio: "16:9", playback: "ambient" }],
  });
  expect(
    issueFrom(() =>
      validateBlockData(
        gallery,
        { images: [{ media: "m" }, { media: "n", size: "cover" }] },
        "draft",
      ),
    ).path,
  ).toEqual(["images", 1, "size"]);
  expect(
    issueFrom(() => validateBlockData(gallery, { images: [{ placement: "center" }] }, "draft"))
      .path,
  ).toEqual(["images", 0, "placement"]);
});

test("a gallery item without a kind is an image", () => {
  const { gallery } = builtInBlocks;
  const stored = {
    images: [{ alt: "Kitchen", caption: "Before", link: "/work/kitchen", media: "m" }],
  };
  const parsed = validateBlockData(gallery, stored, "publish");
  expect(publishedBlockData(gallery, parsed)).toEqual({
    images: [{ kind: "image", ...stored.images[0], placement: "auto", size: "fill" }],
  });
});

test("only gallery declares a migration; older stored versions have no migration step", () => {
  for (const definition of Object.values(builtInBlocks))
    if (definition.type !== "gallery")
      expect(definition, definition.type).not.toHaveProperty("migrations");
  expect(Object.keys(builtInBlocks.gallery.migrations)).toEqual(["6"]);
  for (const [definition, from] of [
    [builtInBlocks.gallery, 4],
    [builtInBlocks.image, 3],
    [builtInBlocks.videoEmbed, 1],
  ])
    expect(() => migrateBlockData(definition, { data: {}, settings: {} }, from)).toThrowError(
      expect.objectContaining({ code: "missing_step" }),
    );
  const custom = defineBlock({
    fields: { title: field.text() },
    migrations: { 2: (block) => block },
    type: "custom",
    version: 2,
  });
  expect(migrateBlockData(custom, { data: { title: "Kept" }, settings: {} }, 1)).toEqual({
    data: { title: "Kept" },
    settings: {},
  });
});

test("navigation allows one submenu level with safe URLs within the list budget", () => {
  const { navigation } = builtInBlocks;
  expect(navigation.version).toBe(1);
  expect(navigation.settings).toBeUndefined();
  expect(validateBlockData(navigation, {}, "draft")).toEqual({ links: [] });
  expect(issueFrom(() => validateBlockData(navigation, {}, "publish")).code).toBe("list_too_short");
  const docs = { children: [{ label: "Guide", url: "/guide" }], label: "Docs" };
  expect(validateBlockData(navigation, { links: [docs], name: "Main" }, "publish")).toEqual({
    links: [docs],
    name: "Main",
  });
  expect(
    issueFrom(() =>
      validateBlockData(
        navigation,
        { links: [{ children: [{ label: "Guide" }], label: "Docs" }] },
        "publish",
      ),
    ),
  ).toMatchObject({ code: "missing_required_field", path: ["links", 0, "children", 0, "url"] });
  expect(
    issueFrom(() =>
      validateBlockData(
        navigation,
        { links: [{ children: [{ label: "Bad", url: "javascript:alert(1)" }], label: "Docs" }] },
        "draft",
      ),
    ).path,
  ).toEqual(["links", 0, "children", 0, "url"]);
  const children = Array.from({ length: 20 }, (_, index) => ({
    label: `Child ${index}`,
    url: `/child-${index}`,
  }));
  const links = Array.from({ length: 20 }, (_, index) => ({ children, label: `Link ${index}` }));
  expect(validateBlockData(navigation, { links }, "publish").links).toHaveLength(20);
  const blocks = [{ data: { links }, fields: navigation.fields, path: ["blocks", 0, "data"] }];
  expect(() => validateSnapshotListBudget({}, {}, blocks)).not.toThrow();
  const crowded = links.map((link, index) =>
    index === 3 ? { ...link, children: [...children, { label: "Extra", url: "/extra" }] } : link,
  );
  expect(issueFrom(() => validateBlockData(navigation, { links: crowded }, "draft"))).toMatchObject(
    {
      code: "list_too_long",
      path: ["links", 3, "children"],
    },
  );
});

test("videoEmbed is a public DSL block with draft and publication semantics", async () => {
  const definition = builtInBlocks.videoEmbed;
  expect(definition.version).toBe(2);
  // Pinned before the gallery adopted the shared aspect ratio and playback descriptors.
  expect(await sha256CanonicalJson(toBlockMetadata(definition))).toBe(
    "50d325160598a2beedd32ce00e752643731897d349ff188109d2028a7506fec8",
  );
  expect(validateBlockSettings(definition, {})).toEqual({
    aspectRatio: "16:9",
    playback: "player",
  });
  for (const aspectRatio of ["16:9", "4:3", "1:1", "4:5", "9:16"]) {
    expect(validateBlockSettings(definition, { aspectRatio, playback: "ambient" })).toEqual({
      aspectRatio,
      playback: "ambient",
    });
  }
  for (const settings of [{ aspectRatio: "21:9" }, { playback: "autoplay" }])
    expect(() => validateBlockSettings(definition, settings)).toThrow();
  const metadata = toBlockMetadata(definition);
  expect(metadata.settings.aspectRatio.presentation.choices).toHaveLength(5);
  expect(metadata.settings.playback.presentation.choices).toHaveLength(2);
  for (const setting of Object.values(metadata.settings)) {
    expect(setting.required).toBe(true);
    expect(setting.presentation.control).toBe("cards");
    for (const choice of setting.presentation.choices) {
      expect(choice.label.length).toBeGreaterThan(0);
      expect(choice.description.length).toBeGreaterThan(0);
    }
  }
  expect(validateBlockData(definition, {}, "draft")).toEqual({});
  expect(() => validateBlockData(definition, {}, "publish")).toThrow();
  const data = { url: "https://vimeo.com/123", title: "Studio" };
  expect(validateBlockData(definition, data, "publish")).toEqual(data);
  expect(() => validateBlockData(definition, { ...data, title: "" }, "publish")).toThrow();
  expect(() =>
    validateBlockData(definition, { ...data, url: "https://example.com" }, "draft"),
  ).toThrow();
});

test("Link uses ordinary URLs and scalar presentation settings", () => {
  const definition = builtInBlocks.link;
  expect(toBlockMetadata(definition)).toMatchObject({ type: "link", version: 1, label: "Link" });
  expect(Object.keys(definition.fields)).toEqual(["label", "url"]);
  expect(definition).not.toHaveProperty("migrations");
  expect(validateBlockSettings(definition, {})).toEqual({ appearance: "button", newTab: false });
  expect(validateBlockSettings(definition, { appearance: "text", newTab: true })).toEqual({
    appearance: "text",
    newTab: true,
  });
  for (const url of ["entry:target", "/page", "https://example.com"])
    expect(validateBlockData(definition, { label: "Read more", url }, "publish")).toEqual({
      label: "Read more",
      url,
    });
  expect(validateBlockData(definition, {}, "draft")).toEqual({});
  expect(issueFrom(() => validateBlockData(definition, {}, "publish"))).toMatchObject({
    code: "missing_required_field",
    path: ["label"],
  });
  expect(
    issueFrom(() => validateBlockData(definition, { label: "Read" }, "publish")),
  ).toMatchObject({ path: ["url"] });
  for (const label of ["", "x".repeat(201)])
    expect(() => validateBlockData(definition, { label, url: "/" }, "draft")).toThrow();
  expect(() => validateBlockSettings(definition, { appearance: "other" })).toThrow();
  expect(() => validateBlockSettings(definition, { newTab: "yes" })).toThrow();
});
