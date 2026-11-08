import { defineBlock, field, listLayoutSettings } from "../index.js";
import type {
  BlockDataValues,
  BlockMigration,
  BlockMigrationInput,
  BlockSettingsValues,
  FieldDefinition,
} from "../index.js";
import type { Equal, Expect } from "../test-support/type-assertions.js";

const hero = defineBlock({
  fields: {
    eyebrow: field.text(),
    heading: field.text({ required: true }),
  },
  type: "hero",
  version: 1,
});

const versionedHero = defineBlock({
  fields: { heading: field.text({ required: true }) },
  migrations: {
    2: ({ data: { title, ...rest }, settings }) => ({
      data: { ...rest, heading: title ?? "" },
      settings,
    }),
  },
  type: "hero",
  version: 2,
});
type _migration = Expect<
  Equal<NonNullable<typeof versionedHero.migrations>[number], BlockMigration>
>;
type _migrationInput = Expect<Equal<Parameters<BlockMigration>[0], BlockMigrationInput>>;

defineBlock({
  fields: {},
  // @ts-expect-error migrations must return JSON object data synchronously.
  migrations: { 2: async () => ({ data: {} }) },
  type: "async",
  version: 2,
});
// @ts-expect-error migrations return `{data, settings?}`, not bare data.
defineBlock({ fields: {}, migrations: { 2: () => 1 }, type: "bare", version: 2 });

const panel = defineBlock({
  fields: {},
  settings: {
    align: field.select({ defaultValue: "left", options: ["left", "center"] as const }),
    boxed: field.boolean({ defaultValue: false }),
  },
  type: "panel",
  version: 1,
});
type _settings = Expect<
  Equal<
    BlockSettingsValues<NonNullable<typeof panel.settings>>,
    Readonly<{ align: "center" | "left"; boxed: boolean }>
  >
>;
type _noSettings = Expect<
  Equal<typeof hero.settings, undefined | Readonly<Record<never, FieldDefinition>>>
>;
type _blockValues = Expect<
  Equal<BlockDataValues<typeof hero.fields>, Readonly<{ eyebrow?: string; heading: string }>>
>;

// @ts-expect-error A block version is mandatory.
defineBlock({ fields: {}, type: "missing-version" });

defineBlock({
  type: "layoutTypeTest",
  version: 1,
  fields: { title: field.text() },
  // @ts-expect-error Block data layout references immediate data keys.
  layout: { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["missing"] }] },
});

const cardList = defineBlock({
  type: "cardList",
  version: 1,
  fields: {},
  settings: listLayoutSettings(),
});
export type ListMode = Expect<
  Equal<
    BlockSettingsValues<NonNullable<typeof cardList.settings>>["layoutMode"],
    "grid" | "flex-row" | "flex-column"
  >
>;

const conditionalBlock = defineBlock({
  type: "conditional",
  version: 1,
  fields: {},
  settings: {
    mode: field.select({ options: ["a", "b"], required: true, defaultValue: "a" }),
    wrap: field.boolean({ defaultValue: true }),
  },
  settingsVisibility: { wrap: { setting: "mode", values: ["a"] } },
});
export type ConditionalMode = Expect<
  Equal<BlockSettingsValues<NonNullable<typeof conditionalBlock.settings>>["mode"], "a" | "b">
>;
defineBlock({
  type: "bad",
  version: 1,
  fields: {},
  settings: { mode: field.select({ options: ["a"], required: true, defaultValue: "a" }) },
  // @ts-expect-error Visibility targets must name declared settings.
  settingsVisibility: { missing: { setting: "mode", values: ["a"] } },
});
const conditionalMediaBlock = defineBlock({
  type: "conditional-media",
  version: 1,
  fields: {
    kind: field.select({ options: ["image", "video"], required: true, defaultValue: "image" }),
    media: field.media({ required: true }),
    videoUrl: field.url({ required: true }),
    title: field.text({ required: true }),
  },
  visibility: {
    media: { field: "kind", values: ["image"] },
    videoUrl: { field: "kind", values: ["video"] },
  },
});
type ConditionalBlockData = ReturnType<typeof conditionalMediaBlock.validate>;
export type ConditionalBlockData_ = Expect<
  Equal<
    ConditionalBlockData,
    BlockDataValues<
      typeof conditionalMediaBlock.fields,
      { readonly media: unknown; readonly videoUrl: unknown }
    >
  >
>;
export type ConditionalBlockRequired = Expect<
  Equal<
    Pick<ConditionalBlockData, "kind" | "title">,
    Readonly<{ kind: "image" | "video"; title: string }>
  >
>;
export type ConditionalBlockTargetsOptional = Expect<
  Equal<
    Pick<ConditionalBlockData, "media" | "videoUrl">,
    Readonly<{ media?: string; videoUrl?: string }>
  >
>;
const unconditionalMediaBlock = defineBlock({
  type: "plain-media",
  version: 1,
  fields: { media: field.media({ required: true }), caption: field.text() },
});
export type UnconditionalMediaBlockUnchanged = Expect<
  Equal<
    ReturnType<typeof unconditionalMediaBlock.validate>,
    BlockDataValues<typeof unconditionalMediaBlock.fields>
  >
>;
export type UnconditionalMediaBlockRequired = Expect<
  Equal<ReturnType<typeof unconditionalMediaBlock.validate>["media"], string>
>;
// Typed definitions remain usable where any block definition is accepted.
const anyBlocks: readonly import("../index.js").BlockDefinition[] = [
  conditionalMediaBlock,
  unconditionalMediaBlock,
];
void anyBlocks;
