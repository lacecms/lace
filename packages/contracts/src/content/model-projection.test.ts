import { expect, test } from "vitest";
import * as v from "valibot";
import { CONTENT_MODEL_DTO_KEYS } from "./model-projection.js";
import { toContentModelDto } from "./model-projection.js";
import { contentModelSchema } from "./models.js";

const modelWithOptionalIcon = {
  blockDefinitions: [],
  blocks: [],
  fields: {},
  key: "settings",
  kind: "global",
  version: 1,
} as const;

test.each(["settings", "👩‍💻", "future-icon"])("model metadata accepts icon %s", (icon) => {
  expect(
    v.parse(contentModelSchema, toContentModelDto({ ...modelWithOptionalIcon, icon })).icon,
  ).toBe(icon);
});

test.each(["", "settings\n", " Settings", "🧭⚙️", "a".repeat(65), null, 5])(
  "model metadata rejects malformed icon %s",
  (icon) => {
    expect(v.safeParse(contentModelSchema, { ...modelWithOptionalIcon, icon }).success).toBe(false);
  },
);

test("content model projection covers exactly the DTO schema keys", () => {
  expect([...CONTENT_MODEL_DTO_KEYS].sort()).toEqual(
    Object.keys(contentModelSchema.pipe[0].entries).sort(),
  );
});

test("full model serialization preserves the pre-refactoring bytes", () => {
  const model = {
    blockDefinitions: [],
    blocks: [],
    description: "Full model",
    fields: {
      kind: {
        type: "boolean",
        required: false,
      },
      title: {
        type: "text",
        required: false,
      },
    },
    key: "posts",
    kind: "collection",
    label: "Posts",
    listFields: ["title"],
    listOptions: {
      sortableFields: ["title"],
    },
    layout: {
      mode: "sections",
      groups: [
        {
          key: "main",
          label: "Main",
          fields: ["kind", "title"],
        },
      ],
    },
    path: "/posts",
    route: "/posts/:slug",
    seo: {
      description: "title",
    },
    seoDefaults: {
      siteName: "title",
    },
    version: 1,
    visibility: {
      title: {
        field: "kind",
        values: [true],
      },
    },
  } as const;
  expect(JSON.stringify(toContentModelDto(model))).toBe(
    '{"blockDefinitions":[],"blocks":[],"description":"Full model","fields":{"kind":{"type":"boolean","required":false},"title":{"type":"text","required":false}},"key":"posts","kind":"collection","label":"Posts","listFields":["title"],"listOptions":{"sortableFields":["title"]},"layout":{"mode":"sections","groups":[{"key":"main","label":"Main","fields":["kind","title"]}]},"path":"/posts","route":"/posts/:slug","seo":{"description":"title","image":null},"seoDefaults":{"description":null,"image":null,"siteName":"title","titleTemplate":null},"version":1,"visibility":{"title":{"field":"kind","values":[true]}}}',
  );
});
