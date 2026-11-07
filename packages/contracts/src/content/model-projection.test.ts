import { expect, test } from "vitest";
import { CONTENT_MODEL_DTO_KEYS } from "./model-projection.js";
import { contentModelSchema, toContentModelDto } from "../index.js";

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
