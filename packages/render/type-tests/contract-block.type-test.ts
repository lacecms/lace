// Test-only: proves the public contract DTOs need no mapping before rendering.
// It lives outside `src`, so the render package itself never imports contracts.
import type { ContentBlockDto, PublicBlockDto } from "@lacecms/contracts";
import { builtInBlocks, defineBlock, field } from "@lacecms/content";
import type { SafeRichTextDocument } from "@lacecms/content";
import { defineBlockMap, parseBlock, prepareBlocks } from "../src/index.js";
import type { BlockProps, RenderableBlock, RenderableEntry } from "../src/index.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

declare const contractBlock: ContentBlockDto;
const renderable: RenderableBlock = contractBlock;
declare const publicBlock: PublicBlockDto;
const publicRenderable: RenderableBlock = publicBlock;

declare const contractEntry: { readonly blocks: ContentBlockDto[]; id: string; modelKey: string };
const entry: RenderableEntry = contractEntry;

type HeroData = BlockProps<typeof builtInBlocks.hero>["data"];
type HeroHeading = Expect<Equal<HeroData["heading"], string>>;
type HeroBody = Expect<Equal<HeroData["body"], SafeRichTextDocument | undefined>>;

const banner = defineBlock({
  fields: { count: field.number({ required: true }), title: field.text() },
  type: "banner",
  version: 2,
});
const bannerData = parseBlock(banner, renderable, {
  blockKey: "b",
  entryId: "e",
  modelKey: "m",
});
type BannerCount = Expect<Equal<typeof bannerData.count, number>>;

type HeroSettings = Expect<Equal<BlockProps<typeof builtInBlocks.hero>["settings"], Readonly<{}>>>;
type HeroAnchor = Expect<
  Equal<BlockProps<typeof builtInBlocks.hero>["anchor"], string | undefined>
>;

const styled = defineBlock({
  fields: { title: field.text() },
  settings: {
    columns: field.number({ defaultValue: 2 }),
    layout: field.select({ defaultValue: "wide", options: ["wide", "narrow"] }),
  },
  type: "styled",
  version: 1,
});
type StyledSettings = BlockProps<typeof styled>["settings"];
type StyledLayout = Expect<Equal<StyledSettings["layout"], "wide" | "narrow">>;
type StyledColumns = Expect<Equal<StyledSettings["columns"], number>>;
type StyledKeys = Expect<Equal<keyof StyledSettings, "columns" | "layout">>;

const blocks = defineBlockMap({
  banner: { component: "BannerComponent", definition: banner },
  hero: { component: "HeroComponent", definition: builtInBlocks.hero },
  styled: { component: "StyledComponent", definition: styled },
});
type MapComponent = Expect<Equal<(typeof blocks)["hero"]["component"], "HeroComponent">>;
const prepared = prepareBlocks(blocks, entry, (id) => id);

export type TypeTests = [
  HeroHeading,
  HeroBody,
  BannerCount,
  MapComponent,
  HeroSettings,
  HeroAnchor,
  StyledLayout,
  StyledColumns,
  StyledKeys,
  typeof prepared,
  typeof publicRenderable,
];

const nested = defineBlock({
  type: "nested",
  version: 1,
  fields: {
    rows: field.list({
      required: true,
      item: field.group({
        fields: { tone: field.select({ required: true, options: ["light", "dark"] }) },
      }),
    }),
  },
});
type NestedTone = Expect<
  Equal<BlockProps<typeof nested>["data"]["rows"][number]["tone"], "light" | "dark">
>;
export type CompositeTypeTests = [NestedTone];
