import { builtInBlocks, defineBlockRegistry, toBlockRegistryMetadata } from "@lacecms/content";
import { BoxIcon, ImageIcon, PanelTopIcon } from "lucide-react";
import { expect, test } from "vitest";
import {
  blockIcon,
  blockLabel,
  blockSummary,
  defaultSettings,
  matchesBlockFilter,
  type BlockDefinitionDto,
} from "./block-presentation.js";

const hero: BlockDefinitionDto = {
  description: "Large heading with optional text, image, and action.",
  fields: {
    body: { required: false, type: "richText" },
    eyebrow: { required: false, type: "text" },
    heading: { required: true, type: "text" },
    image: { required: false, type: "media" },
    primaryActionUrl: { required: false, type: "url" },
  },
  label: "Hero",
  type: "hero",
  version: 1,
};

const paragraph = (text: string) => ({
  content: [{ content: [{ text, type: "text" }], type: "paragraph" }],
  type: "doc",
});

test("maps built-in block types to icons and falls back for other types", () => {
  expect(blockIcon("hero")).toBe(PanelTopIcon);
  expect(blockIcon("image")).toBe(ImageIcon);
  expect(blockIcon("pricingTable")).toBe(BoxIcon);
});

test("uses the configured label or derives one from the type", () => {
  expect(blockLabel(hero)).toBe("Hero");
  expect(blockLabel({ type: "pricingTable" })).toBe("Pricing Table");
});

test("summarizes preferred text before other text, rich text, URLs, and media", () => {
  expect(blockSummary(hero, { eyebrow: "News", heading: "  Welcome\n home " })).toBe(
    "Welcome home",
  );
  expect(blockSummary(hero, { eyebrow: "News" })).toBe("News");
  expect(
    blockSummary(hero, {
      body: {
        content: [
          { content: [{ text: "First", type: "text" }], type: "heading" },
          { content: [{ text: "second line", type: "text" }], type: "paragraph" },
        ],
        type: "doc",
      },
    }),
  ).toBe("First second line");
  expect(blockSummary(hero, { primaryActionUrl: "https://lace.test" })).toBe("https://lace.test");
  expect(blockSummary(hero, { image: "01ARZ3NDEKTSV4RRFFQ69G5FAV" })).toBe("Media selected");
  expect(blockSummary(hero, { body: paragraph("   "), heading: "" })).toBe("Empty block");
  expect(blockSummary(hero, undefined)).toBe("Empty block");
});

test("caps long summaries with an ellipsis", () => {
  const summary = blockSummary(hero, { heading: "word ".repeat(60) });
  expect(summary.length).toBeLessThanOrEqual(120);
  expect(summary.endsWith("…")).toBe(true);
});

const [gallery, navigation] = toBlockRegistryMetadata(
  defineBlockRegistry([builtInBlocks.gallery, builtInBlocks.navigation]),
) as unknown as BlockDefinitionDto[];
const mediaId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

test("summarizes a block's first non-empty list by its label, count, and items", () => {
  expect(
    blockSummary(navigation!, {
      links: [
        { label: "Blog", url: "/blog" },
        { children: [{ label: "Team", url: "/team" }], label: "About" },
      ],
    }),
  ).toBe("Links (2): Blog, About");
  const images = blockSummary(gallery!, {
    images: [{ media: mediaId }, { media: mediaId }, { media: mediaId }],
  });
  expect(images).toBe("Images (3)");
  expect(images).not.toContain(mediaId);
  expect(
    blockSummary(gallery!, {
      images: [{ caption: "Office", media: mediaId }, { media: mediaId }, { caption: "Team" }],
    }),
  ).toBe("Images (3): Office, Team");
});

test("keeps top-level text ahead of lists and skips empty lists", () => {
  expect(blockSummary(gallery!, { images: [{ media: mediaId }], title: "Team" })).toBe("Team");
  expect(blockSummary(navigation!, { links: [{ label: "Blog" }], name: "Main" })).toBe("Main");
  expect(blockSummary(gallery!, { images: [] })).toBe("Empty block");
  expect(blockSummary(gallery!, { title: "  " })).toBe("Empty block");
});

test("caps long list summaries with an ellipsis", () => {
  const links = Array.from({ length: 40 }, (_, index) => ({ label: `Link ${index + 1}` }));
  const summary = blockSummary(navigation!, { links });
  expect(summary.startsWith("Links (40): Link 1, Link 2")).toBe(true);
  expect(summary.length).toBeLessThanOrEqual(120);
  expect(summary.endsWith("…")).toBe(true);
});

test("summarizes groups and follows the block layout between composites", () => {
  const card: BlockDefinitionDto = {
    fields: {
      author: {
        fields: {
          name: { required: false, type: "text" },
          photo: { required: false, type: "media" },
        },
        required: false,
        type: "group",
      },
      sources: {
        item: { required: false, type: "url" },
        label: "Sources",
        required: false,
        type: "list",
      },
      tags: { item: { required: false, type: "text" }, required: false, type: "list" },
    },
    label: "Card",
    type: "card",
    version: 1,
  };
  expect(blockSummary(card, { author: { name: "Ada", photo: mediaId } })).toBe("Ada");
  expect(blockSummary(card, { author: { photo: mediaId } })).toBe("Media selected");
  const data = { sources: ["https://lace.test"], tags: ["news"] };
  expect(blockSummary(card, data)).toBe("Sources (1): https://lace.test");
  expect(
    blockSummary(
      {
        ...card,
        layout: {
          groups: [{ fields: ["tags", "sources", "author"], key: "main", label: "Main" }],
          mode: "sections",
        },
      },
      data,
    ),
  ).toBe("Tags (1): news");
});

test("filters blocks by label, type, and description without case", () => {
  expect(matchesBlockFilter(hero, "")).toBe(true);
  expect(matchesBlockFilter(hero, "HER")).toBe(true);
  expect(matchesBlockFilter(hero, "optional TEXT")).toBe(true);
  expect(matchesBlockFilter({ fields: {}, type: "banner", version: 1 }, "ban")).toBe(true);
  expect(matchesBlockFilter(hero, "gallery")).toBe(false);
});

test("new blocks take the default of every declared setting", () => {
  expect(defaultSettings({})).toEqual({});
  const settings = {
    align: { defaultValue: "left", options: ["left", "center"], required: false, type: "select" },
    boxed: { defaultValue: false, required: false, type: "boolean" },
  } as const;
  expect(defaultSettings({ settings } as never)).toEqual({ align: "left", boxed: false });
});
