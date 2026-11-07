import { field } from "@lacecms/content";
import type { FieldVisibility, JsonObject, ModelFieldDefinitions } from "@lacecms/content";

export interface VisibilityParityOccurrence {
  readonly path: readonly (string | number)[];
  readonly fields: ModelFieldDefinitions;
  readonly visibility: FieldVisibility;
  readonly visibleKeys: readonly string[];
}

export interface VisibilityParityCase {
  readonly name: string;
  readonly fields: ModelFieldDefinitions;
  readonly visibility: FieldVisibility;
  readonly values: JsonObject;
  /** Raw projection: defaults determine visibility but are never inserted. */
  readonly published: JsonObject;
  readonly occurrences: readonly VisibilityParityOccurrence[];
}

const selectFields = {
  kind: field.select({ options: ["image", "video"], required: true, defaultValue: "image" }),
  media: field.text({ required: true }),
  videoUrl: field.text({ required: true }),
};
const selectRules = {
  media: { field: "kind", values: ["image"] },
  videoUrl: { field: "kind", values: ["video"] },
} as const satisfies FieldVisibility;
const optionalFields = {
  layout: field.select({ options: ["grid", "stack"] }),
  columns: field.text({ required: true }),
};
const optionalRules: FieldVisibility = { columns: { field: "layout", values: ["grid"] } };
const booleanFields = {
  flag: field.boolean(),
  note: field.text({ required: true }),
};
const booleanRules: FieldVisibility = { note: { field: "flag", values: [false] } };
const selectOccurrence = (
  path: readonly (string | number)[],
  video = false,
): VisibilityParityOccurrence => ({
  path,
  fields: selectFields,
  visibility: selectRules,
  visibleKeys: ["kind", video ? "videoUrl" : "media"],
});
const selectGroup = field.group({ fields: selectFields, visibility: selectRules, required: true });
const nestedFields = { on: field.boolean(), details: selectGroup };
const nestedRules: FieldVisibility = { details: { field: "on", values: [true] } };
const listFields = { items: field.list({ item: selectGroup, required: true }) };

/** Shared inputs and independently declared expectations; safe to import under jsdom. */
export const visibilityParityCases: readonly VisibilityParityCase[] = [
  ...(
    [
      ["default select omitted", { media: "image", videoUrl: "video" }, { media: "image" }, false],
      [
        "default select present",
        { kind: "video", media: "image", videoUrl: "video" },
        { kind: "video", videoUrl: "video" },
        true,
      ],
      [
        "default select cleared",
        { kind: null, media: "image", videoUrl: "video" },
        { kind: null, media: "image" },
        false,
      ],
    ] as const
  ).map(([name, values, published, video]) => ({
    name,
    fields: selectFields,
    visibility: selectRules,
    values,
    published,
    occurrences: [selectOccurrence([], video)],
  })),
  ...(
    [
      ["optional select absent", { columns: "two" }, {}, ["layout"]],
      [
        "optional select present",
        { layout: "grid", columns: "two" },
        { layout: "grid", columns: "two" },
        ["layout", "columns"],
      ],
    ] as const
  ).map(([name, values, published, visibleKeys]) => ({
    name,
    fields: optionalFields,
    visibility: optionalRules,
    values,
    published,
    occurrences: [{ path: [], fields: optionalFields, visibility: optionalRules, visibleKeys }],
  })),
  ...(
    [
      [
        "boolean false matches",
        { flag: false, note: "off" },
        { flag: false, note: "off" },
        ["flag", "note"],
      ],
      ["boolean absent", { note: "off" }, {}, ["flag"]],
    ] as const
  ).map(([name, values, published, visibleKeys]) => ({
    name,
    fields: booleanFields,
    visibility: booleanRules,
    values,
    published,
    occurrences: [{ path: [], fields: booleanFields, visibility: booleanRules, visibleKeys }],
  })),
  {
    name: "visible group has its own default",
    fields: nestedFields,
    visibility: nestedRules,
    values: { on: true, details: { media: "image", videoUrl: "video" } },
    published: { on: true, details: { media: "image" } },
    occurrences: [
      { path: [], fields: nestedFields, visibility: nestedRules, visibleKeys: ["on", "details"] },
      selectOccurrence(["details"]),
    ],
  },
  {
    name: "list items evaluate independently",
    fields: listFields,
    visibility: {},
    values: {
      items: [
        { media: "first", videoUrl: "stale" },
        { kind: "video", media: "stale", videoUrl: "second" },
      ],
    },
    published: { items: [{ media: "first" }, { kind: "video", videoUrl: "second" }] },
    occurrences: [
      { path: [], fields: listFields, visibility: {}, visibleKeys: ["items"] },
      selectOccurrence(["items", 0]),
      selectOccurrence(["items", 1], true),
    ],
  },
  {
    name: "hidden group hides its subtree",
    fields: nestedFields,
    visibility: nestedRules,
    values: { on: false, details: { kind: "video", media: "stale", videoUrl: "video" } },
    published: { on: false },
    occurrences: [{ path: [], fields: nestedFields, visibility: nestedRules, visibleKeys: ["on"] }],
  },
];
