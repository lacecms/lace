import {
  builtInBlocks,
  defineBlock,
  field,
  listLayoutSettings,
  listLayoutSettingsVisibility,
} from "@lacecms/content";
import { defineBlockMap } from "@lacecms/render";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test } from "vitest";
// The registry sources exactly as `lace add block` installs them.
import LinkBlock from "../../../registry/astro/link/LinkBlock.astro";
import CtaBlock from "../../../registry/astro/cta/CtaBlock.astro";
import GalleryBlock from "../../../registry/astro/gallery/GalleryBlock.astro";
import HeroBlock from "../../../registry/astro/hero/HeroBlock.astro";
import ImageBlock from "../../../registry/astro/image/ImageBlock.astro";
import NavigationBlock from "../../../registry/astro/navigation/NavigationBlock.astro";
import VideoEmbedBlock from "../../../registry/astro/videoEmbed/VideoEmbedBlock.astro";
import CardList from "../test-fixtures/CardList.astro";
import Blocks from "../test-fixtures/Blocks.astro";

const blocks = defineBlockMap({
  link: { component: LinkBlock, definition: builtInBlocks.link },
  cta: { component: CtaBlock, definition: builtInBlocks.cta },
  videoEmbed: { component: VideoEmbedBlock, definition: builtInBlocks.videoEmbed },
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
      '<main><section class="gallery" data-lace-block="gallery" data-lace-block-key="gallery-1" data-lace-layout-container>',
      '<h2 data-lace-part="title">Studio</h2>',
      '<ul data-lace-part="items" data-lace-layout="grid" data-lace-wrap="true" data-lace-preset="auto" role="list">',
      '<li data-lace-part="item" data-lace-layout-item><figure><img alt="Override" data-lace-part="media" decoding="async" height="600" loading="lazy" src="https://media.example/studio.png" style="object-position:25% 40%" width="800"><figcaption data-lace-part="caption">Media caption</figcaption></figure></li>',
      // Astro writes an empty alt text as a bare attribute.
      '<li data-lace-part="item" data-lace-layout-item><figure><img alt data-lace-part="media" decoding="async" loading="lazy" src="https://media.example/bare.png"></figure></li>',
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
    '<section class="gallery wide" data-lace-block="gallery" data-lace-block-key="gallery-1" data-lace-layout-container id="photos">',
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

test("Gallery emits validated shared hooks for every mode and preset without inline layout styles", async () => {
  for (const layoutMode of ["grid", "flex-row", "flex-column"])
    for (const layoutPreset of [
      "auto",
      "columns-2",
      "columns-3",
      "columns-4",
      "narrow-wide",
      "wide-narrow",
      "featured-first",
    ]) {
      const html = await render([
        block(
          "gallery",
          { images: [{ media: "bare" }] },
          { settings: { layoutMode, layoutPreset, layoutWrap: false } },
        ),
      ]);
      expect(html).toContain(
        `data-lace-layout="${layoutMode}" data-lace-wrap="false" data-lace-preset="${layoutPreset}"`,
      );
      expect(html).toContain('data-lace-part="item" data-lace-layout-item');
      expect(html).not.toMatch(/style=|<style|<script/);
    }
});

test("an unrelated card list uses the same scalar settings and layout hooks", async () => {
  const definition = defineBlock({
    type: "cardList",
    version: 1,
    fields: { cards: field.list({ defaultValue: [], item: field.text() }) },
    settings: listLayoutSettings(),
    settingsVisibility: listLayoutSettingsVisibility(),
  });
  const container = await AstroContainer.create();
  const html = await container.renderToString(Blocks, {
    props: {
      blocks: defineBlockMap({ cardList: { component: CardList, definition } }),
      entry: {
        id: "custom",
        blocks: [
          {
            key: "cards",
            type: "cardList",
            schemaVersion: 1,
            position: 0,
            data: { cards: ["One", "Two"] },
            settings: { layoutMode: "flex-row", layoutWrap: false, layoutPreset: "featured-first" },
          },
        ],
        media: () => undefined,
        modelKey: "home",
      },
    },
  });
  expect(html).toContain(
    'data-lace-layout="flex-row" data-lace-wrap="false" data-lace-preset="featured-first"',
  );
  expect(html).toContain("<li data-lace-layout-item>One<ul><li>Nested list</li></ul></li>");
  expect(html).not.toContain("gallery");
});

test("video embeds render canonical iframes or inert optimized previews", async () => {
  const direct = await render([
    block(
      "videoEmbed",
      {
        url: "https://youtu.be/dQw4w9WgXcQ?autoplay=1",
        title: "<Studio & team>",
        caption: "<Caption>",
      },
      { anchor: "film", className: "wide" },
    ),
  ]);
  expect(direct).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
  expect(direct).toContain('loading="lazy"');
  expect(direct).toContain('title="<Studio &amp; team>"');
  expect(direct).toContain('id="film"');
  expect(direct).toContain('class="video-embed wide"');
  expect(direct).toContain('referrerpolicy="strict-origin-when-cross-origin"');
  expect(direct).toContain('allow="fullscreen; picture-in-picture; encrypted-media"');
  expect(direct).not.toContain("autoplay;");
  expect(direct).toContain("&lt;Caption&gt;");
  const preview = await render([
    block("videoEmbed", {
      url: "https://vimeo.com/123/abc",
      title: "Studio",
      poster: "studio",
    }),
  ]);
  expect(preview).toContain('aria-label="Load video: Studio"');
  expect(preview).toContain("<template data-lace-video-template>");
  expect(preview).toContain('src="https://player.vimeo.com/video/123?h=abc"');
  expect(preview).toContain("object-position:25% 40%");
  expect(preview).not.toContain("Media caption");
  expect(preview).toContain('data-lace-part="source"');
  const hidden = await render([block("videoEmbed", {}, { hidden: true })]);
  expect(hidden).not.toContain('data-lace-block="videoEmbed"');
});

const resolveLink = (value) =>
  value === undefined || value === null || value === ""
    ? { state: "empty" }
    : value === "entry:missing"
      ? { state: "unavailable", targetId: "missing" }
      : value === "entry:target"
        ? { state: "resolved", targetId: "target", href: "/new" }
        : { state: "resolved", href: value };

test.each(["button", "text"])(
  "Link %s preserves its envelope and newTab and degrades to a plain label",
  async (appearance) => {
    const data = { label: "Open page", url: "entry:target" };
    const settings = { appearance, newTab: true };
    const html = await render(
      [block("link", data, { anchor: "next", className: "accent", settings })],
      { link: resolveLink },
    );
    expect(html).toContain('class="link accent"');
    expect(html).toContain(`data-lace-appearance="${appearance}"`);
    expect(html).toContain('id="next"');
    expect(html).toContain(
      'data-lace-part="link" href="/new" target="_blank" rel="noopener noreferrer"',
    );
    expect(html).not.toContain("entry:");
    const unavailable = await render(
      [block("link", { ...data, url: "entry:missing" }, { settings })],
      { link: resolveLink },
    );
    expect(unavailable).toContain('<span data-lace-part="label">Open page</span>');
    expect(unavailable).not.toMatch(/<(?:a|button)\b|tabindex|role=|entry:/u);
  },
);

test("link-aware sources preserve actions, submenus and image lightboxes without raw token output", async () => {
  const authored = [
    block("hero", {
      heading: "Hello",
      primaryActionLabel: "Hero action",
      primaryActionUrl: "entry:missing",
    }),
    block("cta", { heading: "Next", actionLabel: "CTA action", actionUrl: "entry:missing" }),
    block("image", { media: "bare", link: "entry:target" }),
    block(
      "gallery",
      { images: [{ media: "studio", link: "entry:missing" }] },
      { settings: { lightbox: true } },
    ),
    block("navigation", {
      links: [
        {
          label: "Parent",
          url: "entry:missing",
          children: [
            { label: "Child", url: "entry:target" },
            { label: "Unavailable", url: "entry:missing" },
          ],
        },
      ],
    }),
  ];
  const html = await render(authored, { link: resolveLink, path: "/new" });
  expect(html).toContain('<span data-lace-part="label">Hero action</span>');
  expect(html).toContain('<span data-lace-part="label">CTA action</span>');
  expect(html).toContain('aria-label="/new"');
  expect(html).toContain('href="/new"');
  expect(html).toContain('data-lace-part="submenu"');
  expect(html).toContain('aria-current="page"');
  expect(html).toContain('<span data-lace-part="label">Unavailable</span>');
  expect(html).toContain('data-lace-part="lightbox"');
  expect(html).not.toContain("entry:");
  expect(authored[0].data.primaryActionUrl).toBe("entry:missing");
});
