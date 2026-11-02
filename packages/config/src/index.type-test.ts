import { field } from "@lacecms/content";
import { defineCollection, defineGlobal, definePage } from "./index.js";
import type { ModelFieldValues } from "./index.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

const page = definePage({
  fields: {
    heading: field.text({ required: true }),
    visible: field.boolean(),
  },
  key: "home",
  path: "/",
  version: 1,
});
const collection = defineCollection({
  fields: { category: field.select({ options: ["design", "engineering"] as const }) },
  key: "posts",
  route: "/blog/:slug",
  version: 1,
});

type _pageValues = Expect<
  Equal<ModelFieldValues<typeof page.fields>, Readonly<{ heading: string; visible?: boolean }>>
>;
type _collectionValues = Expect<
  Equal<
    ModelFieldValues<typeof collection.fields>,
    Readonly<{ category?: "design" | "engineering" }>
  >
>;

// @ts-expect-error A model version is mandatory.
definePage({ key: "missing-version", path: "/missing" });

// @ts-expect-error A page must use a fixed path.
definePage({ key: "missing-path", version: 1 });

const listed = defineCollection({
  fields: { author: field.text(), category: field.select({ options: ["news"] as const }) },
  key: "listed",
  listFields: ["category", "author"],
  route: "/listed/:slug",
  version: 1,
});

type _listFields = Expect<
  Equal<typeof listed.listFields, readonly ("author" | "category")[] | undefined>
>;

defineCollection({
  fields: { author: field.text() },
  key: "unknown-list-field",
  // @ts-expect-error List fields must name the collection's declared fields.
  listFields: ["missing"],
  route: "/unknown/:slug",
  version: 1,
});

void listed;
void page;
void collection;

const compositePage = definePage({
  key: "composite",
  path: "/composite",
  version: 1,
  fields: {
    cards: field.list({
      item: field.group({
        fields: {
          kind: field.select({ options: ["one", "two"] as const, required: true }),
          title: field.text(),
        },
      }),
      required: true,
    }),
  },
});
const nestedModelValues: ModelFieldValues<typeof compositePage.fields> = {
  cards: [{ kind: "one" }],
};
const invalidNestedModelValues: ModelFieldValues<typeof compositePage.fields> = {
  // @ts-expect-error nested model select remains narrow.
  cards: [{ kind: "three" }],
};
void [nestedModelValues, invalidNestedModelValues];

const nestedRenameModel = definePage({
  key: "nested-renames",
  path: "/nested-renames",
  version: 2,
  fields: {
    links: field.list({
      item: field.group({
        fields: {
          title: field.text({ renamedFrom: "headline", required: true }),
        },
      }),
    }),
  },
  removedFields: ["/links/*/legacy"],
});
void nestedRenameModel;

defineGlobal({
  key: "layout",
  version: 1,
  fields: { title: field.text() },
  // @ts-expect-error Layout fields belong to the model's own field map.
  layout: { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["missing"] }] },
});

const queryFields = {
  text: field.text(),
  area: field.textarea(),
  count: field.number(),
  flag: field.boolean(),
  category: field.select({ options: ["one"] }),
  date: field.date(),
  time: field.datetime(),
  link: field.url(),
  nested: field.group({ fields: { child: field.text() } }),
};
defineCollection({
  key: "queries",
  route: "/queries/:slug",
  version: 1,
  fields: queryFields,
  listOptions: {
    sortableFields: ["text", "area", "count", "flag", "category", "date", "time", "link"],
    searchableFields: ["text", "area"],
    filterableFields: ["flag"],
  },
});
defineCollection({
  key: "bad-query",
  route: "/bad/:slug",
  version: 1,
  fields: queryFields,
  listOptions: {
    // @ts-expect-error numbers are not searchable
    searchableFields: ["count"],
    // @ts-expect-error composite targets cannot sort
    sortableFields: ["nested"],
    // @ts-expect-error nested paths are not top-level keys
    filterableFields: ["nested.child"],
  },
});
definePage({
  key: "bad-page-query",
  path: "/bad",
  version: 1,
  // @ts-expect-error queries are collection-only
  listOptions: {},
});

const conditionalPage = definePage({
  key: "conditional-home",
  path: "/conditional",
  version: 1,
  fields: {
    heroKind: field.select({ options: ["image", "video"], required: true }),
    heroVideo: field.url({ required: true }),
    title: field.text({ required: true }),
  },
  visibility: { heroVideo: { field: "heroKind", values: ["video"] } },
});
type ConditionalPageValues = ModelFieldValues<
  typeof conditionalPage.fields,
  typeof conditionalPage.visibility
>;
export type ConditionalPageValues_ = Expect<
  Equal<
    Pick<ConditionalPageValues, "heroKind" | "title">,
    Readonly<{ heroKind: "image" | "video"; title: string }>
  >
>;
export type ConditionalPageTargetOptional = Expect<
  Equal<Pick<ConditionalPageValues, "heroVideo">, Readonly<{ heroVideo?: string }>>
>;
const conditionalCollection = defineCollection({
  key: "conditional-items",
  route: "/items/:slug",
  version: 1,
  fields: { hasCta: field.boolean(), ctaUrl: field.url({ required: true }) },
  visibility: { ctaUrl: { field: "hasCta", values: [true] } },
});
export type ConditionalCollectionTargetOptional = Expect<
  Equal<
    undefined extends ModelFieldValues<
      typeof conditionalCollection.fields,
      typeof conditionalCollection.visibility
    >["ctaUrl"]
      ? true
      : false,
    true
  >
>;
const conditionalGlobal = defineGlobal({
  key: "conditional-settings",
  version: 1,
  fields: {
    mode: field.select({ options: ["a", "b"], required: true }),
    extra: field.text({ required: true }),
  },
  visibility: { extra: { field: "mode", values: ["b"] } },
});
export type ConditionalGlobalVisibility = Expect<
  Equal<(typeof conditionalGlobal.visibility)["extra"]["values"][number], "b">
>;
export type UnconditionalPageUnchanged = Expect<
  Equal<ModelFieldValues<typeof page.fields, undefined>, ModelFieldValues<typeof page.fields>>
>;
// A page without rules names no targets, even through its optional `visibility`.
export type UnconditionalPageNoTargets = Expect<
  Equal<
    ModelFieldValues<typeof page.fields, typeof page.visibility>,
    ModelFieldValues<typeof page.fields>
  >
>;
definePage({
  key: "conditional-bad-value",
  path: "/conditional-bad-value",
  version: 1,
  fields: { heroKind: field.select({ options: ["image"] }), heroVideo: field.url() },
  // @ts-expect-error Visibility values must be the controller's option literals.
  visibility: { heroVideo: { field: "heroKind", values: ["video"] } },
});
definePage({
  key: "conditional-bad-target",
  path: "/conditional-bad-target",
  version: 1,
  fields: { heroKind: field.select({ options: ["image"] }) },
  // @ts-expect-error Visibility targets must be model fields.
  visibility: { missing: { field: "heroKind", values: ["image"] } },
});

const seoFields = { title: field.text(), description: field.textarea(), count: field.number() };
const seoKeys: import("./index.js").ModelSeoInput<typeof seoFields> = {
  description: "description",
};
const seoDefaults: import("./index.js").SeoDefaultsInput<typeof seoFields> = {
  siteName: "title",
  titleTemplate: "description",
};
// @ts-expect-error SEO text sources derive their permitted kinds from content capabilities.
const invalidSeo: import("./index.js").ModelSeoInput<typeof seoFields> = { description: "count" };
// @ts-expect-error Numeric fields cannot provide the site name.
const invalidSeoDefaults: import("./index.js").SeoDefaultsInput<typeof seoFields> = {
  siteName: "count",
};
void [seoKeys, seoDefaults, invalidSeo, invalidSeoDefaults];
