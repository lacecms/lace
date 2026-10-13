import { field } from "@lacecms/content";
import { defineCollection, definePage } from "./index.js";
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

// @ts-expect-error Layout fields belong to the model's own field map.
defineGlobal({
  key: "layout",
  version: 1,
  fields: { title: field.text() },
  layout: { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["missing"] }] },
});
