// Test-only: proves the public contract DTOs need no mapping before rendering.
// It lives outside `src`, so the render package itself never imports contracts.
import type { ContentBlockDto } from "@lacecms/contracts";
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

const blocks = defineBlockMap({
  banner: { component: "BannerComponent", definition: banner },
  hero: { component: "HeroComponent", definition: builtInBlocks.hero },
});
type MapComponent = Expect<Equal<(typeof blocks)["hero"]["component"], "HeroComponent">>;
const prepared = prepareBlocks(blocks, entry, (id) => id);

export type TypeTests = [HeroHeading, HeroBody, BannerCount, MapComponent, typeof prepared];
