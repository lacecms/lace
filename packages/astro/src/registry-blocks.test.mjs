import { builtInBlocks } from "@lacecms/content";
import { defineBlockMap } from "@lacecms/render";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test } from "vitest";
// The registry sources exactly as `lace add block` installs them.
import GalleryBlock from "../../../registry/astro/gallery/GalleryBlock.astro";
import HeroBlock from "../../../registry/astro/hero/HeroBlock.astro";
import ImageBlock from "../../../registry/astro/image/ImageBlock.astro";
import NavigationBlock from "../../../registry/astro/navigation/NavigationBlock.astro";
import Blocks from "../test-fixtures/Blocks.astro";

const blocks = defineBlockMap({
  gallery: { component: GalleryBlock, definition: builtInBlocks.gallery },
  hero: { component: HeroBlock, definition: builtInBlocks.hero },
  image: { component: ImageBlock, definition: builtInBlocks.image },
  navigation: { component: NavigationBlock, definition: builtInBlocks.navigation },
});

const media = {
  bare: {
    alt: null,
    caption: null,
    focalPoint: null,
    height: null,
    url: "https://media.example/bare.png",
    width: null,
  },
  studio: {
    alt: "Media alt",
    caption: "Media caption",
    focalPoint: { x: 0.25, y: 0.4 },
    height: 600,
    url: "https://media.example/studio.png",
    width: 800,
  },
};

function block(type, data, overrides = {}) {
  const schemaVersion = builtInBlocks[type]?.version ?? 1;
  return { data, key: `${type}-1`, position: 0, schemaVersion, type, ...overrides };
}

async function render(entryBlocks, { path = "/", ...entry } = {}) {
  const container = await AstroContainer.create();
  return container.renderToString(Blocks, {
    props: {
      blocks,
      entry: {
        blocks: entryBlocks,
        id: "entry-1",
        media: (id) => media[id],
        modelKey: "home",
        ...entry,
      },
    },
    request: new Request(`https://site.example${path}`),
  });
}

const navigation = {
  links: [
    { label: "Home", url: "/" },
    {
      children: [
        { label: "Guide", url: "/guide" },
        { label: "API", url: "https://api.example/" },
      ],
      label: "Docs",
      url: "/docs",
    },
    { children: [{ label: "About", url: "/about" }], label: "Company" },
  ],
  name: "Main",
};

test("gallery items follow the media alt and caption fallbacks", async () => {
  const html = await render([
    block("gallery", {
      images: [{ alt: "Override", media: "studio" }, { media: "bare" }],
      title: "Studio",
    }),
  ]);
  expect(html).toBe(
    [
      '<main><section class="gallery" data-lace-block="gallery" data-lace-block-key="gallery-1">',
      '<h2 data-lace-part="title">Studio</h2>',
      '<ul data-lace-part="items" role="list">',
      '<li data-lace-part="item"><figure><img alt="Override" data-lace-part="media" decoding="async" height="600" loading="lazy" src="https://media.example/studio.png" style="object-position:25% 40%" width="800"><figcaption data-lace-part="caption">Media caption</figcaption></figure></li>',
      // Astro writes an empty alt text as a bare attribute.
      '<li data-lace-part="item"><figure><img alt data-lace-part="media" decoding="async" loading="lazy" src="https://media.example/bare.png"></figure></li>',
      "</ul></section></main>",
    ].join(""),
  );
});

test("gallery items open their own lightboxes when the setting is on", async () => {
  const images = [{ media: "studio" }, { alt: "Second", media: "bare" }];
  const off = await render([block("gallery", { images }, { key: "shots" })]);
  expect(off).not.toContain("<button");
  expect(off).not.toContain("<dialog");
  const html = await render([
    block("gallery", { images }, { key: "shots", settings: { lightbox: true } }),
  ]);
  expect([...html.matchAll(/<dialog[^>]* id="([^"]+)"/gu)].map((match) => match[1])).toEqual([
    "lace-lightbox-entry-1-shots-0",
    "lace-lightbox-entry-1-shots-1",
  ]);
  expect(html).toContain('aria-label="Open full-size image: Media alt"');
  expect(html).toContain('aria-label="Open full-size image: Second"');
  expect(html).toContain(
    '<img alt="Media alt" data-lace-part="lightbox-media" decoding="async" height="600" loading="lazy" src="https://media.example/studio.png" width="800">',
  );
});

test("an image block with the lightbox on wraps its image and keeps the caption last", async () => {
  const html = await render([
    block("image", { media: "studio" }, { key: "photo", settings: { lightbox: true } }),
  ]);
  expect(html).toBe(
    [
      '<main><figure data-lace-block="image" data-lace-block-key="photo">',
      '<button aria-haspopup="dialog" aria-label="Open full-size image: Media alt" command="show-modal" commandfor="lace-lightbox-entry-1-photo" data-lace-part="lightbox-trigger" type="button">',
      '<img alt="Media alt" data-lace-part="media" decoding="async" height="600" loading="lazy" src="https://media.example/studio.png" style="object-position:25% 40%" width="800">',
      "</button>",
      '<dialog aria-label="Media alt" closedby="any" data-lace-part="lightbox" id="lace-lightbox-entry-1-photo">',
      '<button command="close" commandfor="lace-lightbox-entry-1-photo" data-lace-part="lightbox-close" type="button">Close</button>',
      '<img alt="Media alt" data-lace-part="lightbox-media" decoding="async" height="600" loading="lazy" src="https://media.example/studio.png" width="800">',
      "</dialog>",
      '<figcaption data-lace-part="caption">Media caption</figcaption></figure></main>',
    ].join(""),
  );
});

test("an image block with the default setting renders no lightbox", async () => {
  const html = await render([block("image", { alt: "Block alt", media: "studio" })]);
  expect(html).toBe(
    '<main><figure data-lace-block="image" data-lace-block-key="image-1"><img alt="Block alt" data-lace-part="media" decoding="async" height="600" loading="lazy" src="https://media.example/studio.png" style="object-position:25% 40%" width="800"><figcaption data-lace-part="caption">Media caption</figcaption></figure></main>',
  );
});

test("a linked image opens its link instead of the lightbox", async () => {
  const html = await render([
    block(
      "image",
      { alt: "Kitchen", link: "/work/kitchen", media: "studio" },
      { key: "photo", settings: { lightbox: true } },
    ),
  ]);
  expect(html).toBe(
    [
      '<main><figure data-lace-block="image" data-lace-block-key="photo">',
      '<a data-lace-part="link" href="/work/kitchen">',
      '<img alt="Kitchen" data-lace-part="media" decoding="async" height="600" loading="lazy" src="https://media.example/studio.png" style="object-position:25% 40%" width="800">',
      "</a>",
      '<figcaption data-lace-part="caption">Media caption</figcaption></figure></main>',
    ].join(""),
  );
});

test("a gallery mixes lightbox items and linked items", async () => {
  const html = await render([
    block(
      "gallery",
      { images: [{ media: "studio" }, { link: "https://example.com/", media: "studio" }] },
      { key: "shots", settings: { lightbox: true } },
    ),
  ]);
  expect([...html.matchAll(/<dialog[^>]* id="([^"]+)"/gu)].map((match) => match[1])).toEqual([
    "lace-lightbox-entry-1-shots-0",
  ]);
  expect(html).toContain(
    '<a data-lace-part="link" href="https://example.com/"><img alt="Media alt" data-lace-part="media"',
  );
  expect(html.match(/data-lace-part="lightbox-trigger"/gu)).toHaveLength(1);
});

test("a linked image without alt text is named by its caption, then its URL", async () => {
  const html = await render([
    block("gallery", {
      images: [
        { caption: "Before", link: "/before", media: "bare" },
        { link: "/after", media: "bare" },
      ],
    }),
    block("image", { link: "/solo", media: "bare" }, { key: "solo" }),
  ]);
  expect(html).toContain('<a aria-label="Before" data-lace-part="link" href="/before">');
  expect(html).toContain('<a aria-label="/after" data-lace-part="link" href="/after">');
  expect(html).toContain('<a aria-label="/solo" data-lace-part="link" href="/solo">');
});

test("the hero image loads eagerly with high priority and no lightbox", async () => {
  const html = await render([block("hero", { heading: "Welcome", image: "studio" })]);
  expect(html).toContain(
    '<img alt="Media alt" data-lace-part="media" decoding="async" fetchpriority="high" height="600" loading="eager" src="https://media.example/studio.png" style="object-position:25% 40%" width="800">',
  );
  expect(html).not.toContain("<dialog");
});

test("a gallery item caption overrides the media caption", async () => {
  const html = await render([
    block("gallery", { images: [{ caption: "Item caption", media: "studio" }] }),
  ]);
  expect(html).toContain('alt="Media alt"');
  expect(html).toContain('<figcaption data-lace-part="caption">Item caption</figcaption>');
  expect(html).not.toContain("Media caption");
});

test("a gallery without a title carries its anchor and class name", async () => {
  const html = await render([
    block("gallery", { images: [{ media: "bare" }] }, { anchor: "photos", className: "wide" }),
  ]);
  expect(html).toContain(
    '<section class="gallery wide" data-lace-block="gallery" data-lace-block-key="gallery-1" id="photos">',
  );
  expect(html).not.toContain('data-lace-part="title"');
});

test("navigation renders links and one-level submenu disclosures", async () => {
  const html = await render([block("navigation", navigation)]);
  expect(html).toBe(
    [
      '<main><nav aria-label="Main" class="navigation" data-lace-block="navigation" data-lace-block-key="navigation-1">',
      '<ul data-lace-part="list">',
      '<li data-lace-part="item"><a aria-current="page" data-lace-part="link" href="/">Home</a></li>',
      '<li data-lace-part="item"><details data-lace-part="submenu"><summary data-lace-part="toggle">Docs</summary><ul data-lace-part="children">',
      '<li data-lace-part="item"><a data-lace-part="link" href="/docs">Docs</a></li>',
      '<li data-lace-part="item"><a data-lace-part="link" href="/guide">Guide</a></li>',
      '<li data-lace-part="item"><a data-lace-part="link" href="https://api.example/">API</a></li>',
      "</ul></details></li>",
      '<li data-lace-part="item"><details data-lace-part="submenu"><summary data-lace-part="toggle">Company</summary><ul data-lace-part="children">',
      '<li data-lace-part="item"><a data-lace-part="link" href="/about">About</a></li>',
      "</ul></details></li>",
      "</ul></nav></main>",
    ].join(""),
  );
});

test("navigation marks only a root-relative link to the current page", async () => {
  const html = await render(
    [
      block("navigation", {
        links: [
          { label: "About", url: "/about" },
          { label: "Team", url: "/about#team" },
          { label: "Absolute", url: "https://site.example/about" },
          { label: "Query", url: "/about?tab=1" },
        ],
      }),
    ],
    { path: "/about/" },
  );
  expect(html.match(/aria-current="page"/gu)).toHaveLength(1);
  expect(html).toContain('<a aria-current="page" data-lace-part="link" href="/about">About</a>');
});

test("an unnamed navigation has no accessible name and a label-only link is text", async () => {
  const html = await render([
    block("navigation", { links: [{ label: "Sections" }, { children: [], label: "Empty" }] }),
  ]);
  expect(html).not.toContain("aria-label");
  expect(html).toContain('<span data-lace-part="label">Sections</span>');
  expect(html).toContain('<span data-lace-part="label">Empty</span>');
  expect(html).not.toContain("<details");
});

test("a layout renders a published global's visible blocks in order", async () => {
  const html = await render(
    [
      block(
        "navigation",
        { links: [{ label: "First", url: "/first" }] },
        { key: "a", position: 1 },
      ),
      block("navigation", { links: [{ label: "Hidden", url: "/x" }] }, { hidden: true, key: "b" }),
      block("navigation", { links: [{ label: "Second", url: "/second" }] }, { key: "c" }),
    ],
    { id: "navigation-entry", modelKey: "navigation", publishedAt: "2026-10-13T00:00:00.000Z" },
  );
  expect([...html.matchAll(/data-lace-block-key="([^"]+)"/gu)].map((match) => match[1])).toEqual([
    "a",
    "c",
  ]);
  expect(html).not.toContain("Hidden");
});

test("a global block without a renderer fails with the global's identity", async () => {
  await expect(
    render([block("carousel", {}, { key: "c" })], {
      id: "navigation-entry",
      modelKey: "navigation",
    }),
  ).rejects.toMatchObject({
    code: "unknown_block_type",
    context: { blockKey: "c", entryId: "navigation-entry", modelKey: "navigation" },
  });
});
