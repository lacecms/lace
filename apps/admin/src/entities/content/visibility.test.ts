import { expect, test } from "vitest";
import { field, isFieldVisible, validateFieldValue, type FieldDefinition } from "@lacecms/content";
import { cleanValue } from "./composite-values.js";
import {
  applicableErrors,
  effectiveFormValues,
  hiddenFieldNote,
  renderedFieldKeys,
  shownFieldKeys,
} from "./visibility.js";

const item = field.group({
  fields: {
    kind: field.select({
      defaultValue: "image",
      label: "Kind",
      options: ["image", "video"],
      presentation: {
        control: "cards",
        choices: [
          { value: "image", label: "Image" },
          { value: "video", label: "Video" },
        ],
      },
      required: true,
    }),
    media: field.media({ required: true }),
    videoUrl: field.url({ label: "Video URL", required: true }),
    caption: field.text(),
  },
  visibility: {
    media: { field: "kind", values: ["image"] },
    videoUrl: { field: "kind", values: ["video"] },
  },
});
const { fields, visibility } = item as Extract<typeof item, { type: "group" }>;

const optional = field.group({
  fields: {
    layout: field.select({ options: ["grid", "stack"] }),
    columns: field.number(),
    hasCta: field.boolean(),
    ctaUrl: field.url(),
  },
  visibility: {
    columns: { field: "layout", values: ["grid"] },
    ctaUrl: { field: "hasCta", values: [true] },
  },
});
const optionalGroup = optional as Extract<typeof optional, { type: "group" }>;

test("effective values use the form value, else the controller default", () => {
  expect(effectiveFormValues(fields, visibility, { kind: "video" })).toEqual({ kind: "video" });
  expect(effectiveFormValues(fields, visibility, {})).toEqual({ kind: "image" });
  expect(effectiveFormValues(fields, visibility, { kind: null })).toEqual({ kind: "image" });
  expect(effectiveFormValues(optionalGroup.fields, optionalGroup.visibility, {})).toEqual({});
  expect(effectiveFormValues(fields, undefined, { kind: "video" })).toEqual({});
});

test("shown keys follow each controller", () => {
  expect([...shownFieldKeys(fields, visibility, { kind: "video" })]).toEqual([
    "kind",
    "videoUrl",
    "caption",
  ]);
  expect([...shownFieldKeys(fields, visibility, {})]).toEqual(["kind", "media", "caption"]);
  const keys = (values: unknown) => [
    ...shownFieldKeys(optionalGroup.fields, optionalGroup.visibility, values),
  ];
  expect(keys({})).toEqual(["layout", "hasCta"]);
  expect(keys({ layout: "grid", hasCta: true })).toEqual(["layout", "columns", "hasCta", "ctaUrl"]);
  expect(keys({ layout: null, hasCta: false })).toEqual(["layout", "hasCta"]);
  expect([...shownFieldKeys(fields, undefined, {})]).toEqual(Object.keys(fields));
});

test("admin visibility matches draft normalization on the server", () => {
  const cases: readonly [FieldDefinition, Record<string, unknown>][] = [
    [item, {}],
    [item, { kind: null, caption: "a" }],
    [item, { kind: "video", media: "m", videoUrl: "https://vimeo.com/1" }],
    [item, { kind: "image", videoUrl: "https://vimeo.com/1" }],
    [optional, {}],
    [optional, { layout: "grid" }],
    [optional, { layout: null, hasCta: true }],
    [optional, { layout: "stack", hasCta: false, ctaUrl: "/a" }],
  ];
  for (const [definition, value] of cases) {
    const group = definition as Extract<FieldDefinition, { type: "group" }>;
    const normalized = validateFieldValue(definition, cleanValue(value, definition), [], "draft");
    const server = Object.keys(group.fields).filter((key) =>
      isFieldVisible(group.visibility, key, normalized as Record<string, unknown>),
    );
    expect([...shownFieldKeys(group.fields, group.visibility, value)]).toEqual(server);
  }
});

const publication = (message: string) => ({ message, type: "publication" });
const draft = (message: string) => ({ message, type: "validate" });

test("publication problems under hidden targets are dropped, draft problems kept", () => {
  const errors = {
    videoUrl: publication("Required."),
    caption: draft("Too long."),
  };
  expect(applicableErrors(fields, visibility, { kind: "image" }, errors)).toEqual({
    caption: draft("Too long."),
  });
  expect(applicableErrors(fields, visibility, { kind: "video" }, errors)).toEqual(errors);
  const invalid = { videoUrl: draft("Enter a URL.") };
  expect(applicableErrors(fields, visibility, { kind: "image" }, invalid)).toEqual(invalid);
  expect(errors.videoUrl).toEqual(publication("Required."));
});

test("list items and nested groups use their own controllers", () => {
  const owner = {
    items: field.list({ item }),
    details: field.group({
      fields: {
        kind: field.select({ options: ["a", "b"] }),
        extra: field.group({ fields: { x: field.text({ required: true }) } }),
      },
      visibility: { extra: { field: "kind", values: ["b"] } },
    }),
  };
  const values = {
    items: [{ kind: "image" }, { kind: "video" }],
    details: { kind: "a", extra: {} },
  };
  const errors = {
    items: {
      0: { videoUrl: publication("Required."), media: publication("Required.") },
      1: { videoUrl: publication("Required."), media: publication("Required.") },
    },
    details: { extra: { x: publication("Required."), message: "Group", type: "publication" } },
  };
  expect(applicableErrors(owner, undefined, values, errors)).toEqual({
    items: {
      0: { media: publication("Required.") },
      1: { videoUrl: publication("Required.") },
    },
    details: {},
  });
});

test("rendered keys add hidden keys that still hold a problem", () => {
  expect(renderedFieldKeys(fields, undefined, {}, {})).toBeUndefined();
  expect([...renderedFieldKeys(fields, visibility, { kind: "image" }, {})!]).toEqual([
    "kind",
    "media",
    "caption",
  ]);
  expect([
    ...renderedFieldKeys(
      fields,
      visibility,
      { kind: "image" },
      {
        videoUrl: draft("Enter a URL."),
      },
    )!,
  ]).toEqual(["kind", "media", "caption", "videoUrl"]);
});

test("the note names the controller and its values", () => {
  expect(hiddenFieldNote(fields, visibility, "videoUrl")).toBe(
    "Shown to fix a problem in a stored value. Applies when Kind is Video.",
  );
  expect(hiddenFieldNote(optionalGroup.fields, optionalGroup.visibility, "ctaUrl")).toBe(
    "Shown to fix a problem in a stored value. Applies when Has Cta is on.",
  );
  expect(hiddenFieldNote(fields, visibility, "caption")).toBeUndefined();
});
