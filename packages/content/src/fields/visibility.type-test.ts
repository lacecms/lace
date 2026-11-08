import { defineBlock, field } from "../index.js";
import type { FieldValue } from "../index.js";
import type { Equal, Expect } from "../test-support/type-assertions.js";

const conditionalItem = field.group({
  fields: {
    kind: field.select({ options: ["image", "video"], required: true, defaultValue: "image" }),
    hasCaption: field.boolean(),
    media: field.media({ required: true }),
    videoUrl: field.url({ required: true }),
    caption: field.text(),
  },
  visibility: {
    media: { field: "kind", values: ["image"] },
    videoUrl: { field: "kind", values: ["video"] },
    caption: { field: "hasCaption", values: [true] },
  },
});
void conditionalItem.visibility;
field.group({
  fields: { kind: field.select({ options: ["image", "video"] }), media: field.media() },
  // @ts-expect-error Visibility values must be the controller's option literals.
  visibility: { media: { field: "kind", values: ["audio"] } },
});
field.group({
  fields: { title: field.text(), media: field.media() },
  // @ts-expect-error A text field cannot control visibility.
  visibility: { media: { field: "title", values: ["x"] } },
});
field.group({
  fields: { kind: field.select({ options: ["a"] }), media: field.media() },
  // @ts-expect-error Visibility targets must be immediate siblings.
  visibility: { missing: { field: "kind", values: ["a"] } },
});
field.group({
  fields: { on: field.boolean(), media: field.media() },
  // @ts-expect-error Boolean controllers take boolean values.
  visibility: { media: { field: "on", values: ["true"] } },
});
defineBlock({
  type: "conditional-cta",
  version: 1,
  fields: { hasCta: field.boolean(), ctaUrl: field.url() },
  visibility: { ctaUrl: { field: "hasCta", values: [true] } },
});
defineBlock({
  type: "conditional-bad",
  version: 1,
  fields: { url: field.url() },
  settings: { mode: field.select({ options: ["a"], required: true, defaultValue: "a" }) },
  // @ts-expect-error Data visibility cannot name block settings.
  visibility: { url: { field: "mode", values: ["a"] } },
});

type ConditionalItemValue = FieldValue<typeof conditionalItem>;
export type ConditionalItemKindRequired = Expect<
  Equal<ConditionalItemValue["kind"], "image" | "video">
>;
export type ConditionalTargetsOptional = Expect<
  Equal<
    Pick<ConditionalItemValue, "media" | "videoUrl" | "caption">,
    Readonly<{ media?: string; videoUrl?: string; caption?: string }>
  >
>;
const conditionalGallery = field.list({ item: conditionalItem });
export type ConditionalListItemsOptional = Expect<
  Equal<
    undefined extends FieldValue<typeof conditionalGallery>[number]["media"] ? true : false,
    true
  >
>;
const conditionalNested = field.group({ fields: { inner: conditionalItem } });
export type ConditionalNestedOptional = Expect<
  Equal<
    undefined extends NonNullable<FieldValue<typeof conditionalNested>["inner"]>["videoUrl"]
      ? true
      : false,
    true
  >
>;
