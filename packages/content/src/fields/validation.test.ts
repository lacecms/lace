// @ts-nocheck
// TODO(rf2): Type recursive descriptor fixtures, malformed runtime inputs and table tuples.
import { test, expect } from "vitest";
import { field } from "./builders.js";
import { toFieldMetadata } from "./metadata.js";
import { compileFieldSchema, validateFieldValue, validateModelFields } from "./validation.js";
import { ContentValidationError } from "../shared/errors.js";
import { issueFrom } from "../test-support/content-test-helpers.js";

test("compiles every field descriptor and validates semantic field values", () => {
  const validValues = [
    [field.text({ minLength: 2 }), "ok"],
    [field.textarea({ maxLength: 3 }), "ok"],
    [field.number({ min: 1, max: 2 }), 1],
    [field.boolean(), false],
    [field.date(), "2026-02-28"],
    [field.datetime(), "2026-09-07T00:00:00Z"],
    [field.select({ options: ["news", "pages"] }), "news"],
    [field.url(), "/about"],
    [field.media(), "01K4M0D3LQYH8ND26GG2DDC8N2"],
    [
      field.richText(),
      { content: [{ content: [{ text: "Lace", type: "text" }], type: "paragraph" }], type: "doc" },
    ],
  ];

  for (const [definition, value] of validValues) {
    expect(compileFieldSchema(definition).type).toBe("custom");
    expect(validateFieldValue(definition, value)).toEqual(value);
  }

  expect(() => validateFieldValue(field.date(), "2026-02-29", ["date"])).toThrow(/\$\.date/u);
  expect(() =>
    validateFieldValue(field.datetime(), "2026-09-07T00:00:00+01:00", ["datetime"]),
  ).toThrow(/\$\.datetime/u);
  expect(() => validateFieldValue(field.media(), "", ["media"])).toThrow(/\$\.media/u);
  expect(() => validateFieldValue(field.number({ max: 1 }), 2, ["number"])).toThrow(
    ContentValidationError,
  );
});

test("validates model fields in draft and publish modes", () => {
  const definitions = {
    body: field.text({ required: true }),
    section: field.select({ defaultValue: "news", options: ["news", "pages"] }),
  };

  expect(validateModelFields(definitions, {}, "draft")).toEqual({ section: "news" });
  expect(() => validateModelFields(definitions, {}, "publish")).toThrow(/\$\.body/u);
  expect(validateModelFields(definitions, { body: "Ready" }, "publish")).toEqual({
    body: "Ready",
    section: "news",
  });
  expect(() => validateModelFields(definitions, { extra: true }, "draft")).toThrow(/\$\.extra/u);
  expect(() => validateModelFields(definitions, { body: 1 }, "draft")).toThrow(/\$\.body/u);
});

test("composite absence, explicit empties and publication minima", () => {
  const group = field.group({
    fields: {
      title: field.text({ required: true }),
      enabled: field.boolean({ defaultValue: false }),
    },
    defaultValue: { title: "default" },
  });
  const optional = field.group({
    fields: {
      title: field.text({ required: true }),
      enabled: field.boolean({ defaultValue: true }),
    },
  });
  expect(validateModelFields({ optional }, {}, "publish")).toEqual({});
  expect(validateModelFields({ group }, {}, "publish")).toEqual({
    group: { title: "default", enabled: false },
  });
  expect(validateModelFields({ group }, { group: {} }, "draft")).toEqual({
    group: { enabled: false },
  });
  expect(issueFrom(() => validateModelFields({ group }, { group: {} }, "publish")).path).toEqual([
    "group",
    "title",
  ]);
  const list = field.list({ item: field.text(), required: true });
  expect(validateModelFields({ list }, { list: [] }, "publish")).toEqual({ list: [] });
  expect(validateModelFields({ list }, {}, "draft")).toEqual({});
  expect(issueFrom(() => validateModelFields({ list }, {}, "publish")).code).toBe(
    "missing_required_field",
  );
  const minimum = field.list({ item: field.text(), minItems: 2, defaultValue: ["one"] });
  expect(validateModelFields({ minimum }, {}, "draft")).toEqual({ minimum: ["one"] });
  expect(issueFrom(() => validateModelFields({ minimum }, {}, "publish")).code).toBe(
    "list_too_short",
  );
  expect(validateModelFields({ group }, { group: {} }, "draft")).not.toHaveProperty("group.title");
});

test("composite exact leaf paths and malformed values", () => {
  const list = field.list({
    item: field.group({ fields: { image: field.media(), text: field.text() } }),
  });
  const base = ["blocks", 0, "data", "images"];
  expect(issueFrom(() => validateFieldValue(list, [{}, {}, { image: 42 }], base)).path).toEqual([
    ...base,
    2,
    "image",
  ]);
  expect(issueFrom(() => validateFieldValue(list, [{ extra: true }])).code).toBe("unknown_field");
  for (const value of [null, {}, [null], [undefined], Array(1)])
    expect(() => validateFieldValue(list, value, [], "draft")).toThrow(ContentValidationError);
  expect(() => validateFieldValue(field.group({ fields: {} }), null)).toThrow(
    ContentValidationError,
  );
  expect(() =>
    validateFieldValue(field.list({ item: field.text({ defaultValue: "fallback" }) }), [null]),
  ).toThrow(ContentValidationError);
  expect(
    validateFieldValue(
      field.list({
        item: field.group({ fields: { text: field.text({ defaultValue: "default" }) } }),
      }),
      [{}],
    ),
  ).toEqual([{ text: "default" }]);
});

test("shared counts retain ordinary UTF-16 and SEO trimmed code points", async () => {
  const { textLength, seoTextLength } = await import("./validation.js");
  for (const [text, raw, seo] of [
    ["", 0, 0],
    [" 😀 ", 4, 1],
    ["e\u0301", 2, 2],
  ]) {
    expect(textLength(text)).toBe(raw);
    expect(seoTextLength(text)).toBe(seo);
    expect(() =>
      validateFieldValue(field.text({ minLength: raw, maxLength: raw }), text),
    ).not.toThrow();
    if (raw > 0) expect(() => field.text({ maxLength: raw - 1, defaultValue: text })).toThrow();
  }
});

test("embed URL grammar is shared by definitions, metadata and compiled nested validation", async () => {
  const { parseVideoEmbed } = await import("./video-embeds.js");
  const { normalizeFieldDefinition } = await import("./normalization.js");
  const descriptor = field.url({ embedProviders: ["vimeo", "youtube"], required: true });
  expect(descriptor.embedProviders).toEqual(["youtube", "vimeo"]);
  const metadata = normalizeFieldDefinition(
    JSON.parse(JSON.stringify(toFieldMetadata(descriptor))),
  );
  const accepted = [
    "https://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch/?v=dQw4w9WgXcQ&autoplay=1",
    "https://m.youtube.com/shorts/dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ/",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    "https://youtube.com/embed/dQw4w9WgXcQ",
    "https://vimeo.com/76979871",
    "https://www.vimeo.com/76979871/abc123def",
    "https://player.vimeo.com/video/76979871?h=abc123def",
    "https://vimeo.com/76979871/abc123def?h=abc123def",
    "https://VIMEO.com:443/76979871?h=abc123def#t=5",
  ];
  const rejected = [
    "http://vimeo.com/123",
    "https://vimeo.com:444/123",
    "https://a@vimeo.com/123",
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/short",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&v=dQw4w9WgXcQ",
    "https://vimeo.com/123/a?h=b",
    "https://vimeo.com/123?h=a&h=a",
    "https://vimeo.com/0",
    "https://vimeo.com/event/123",
    "https://vimeo.com/123?h=",
    "https://youtube.com/playlist?list=abc",
    "https://example.com/video.mp4",
    '<iframe src="https://vimeo.com/123"></iframe>',
    "/watch",
    "javascript:alert(1)",
  ];
  for (const value of accepted) {
    expect(parseVideoEmbed(value), value).toBeDefined();
    for (const definition of [descriptor, metadata]) {
      expect(() => validateFieldValue(definition, value, [], "publish"), value).not.toThrow();
      expect(
        (await import("valibot")).safeParse(compileFieldSchema(definition), value).success,
      ).toBe(true);
    }
  }
  for (const value of rejected) {
    expect(parseVideoEmbed(value), value).toBeUndefined();
    for (const definition of [descriptor, metadata])
      expect(() => validateFieldValue(definition, value, [], "draft"), value).toThrow();
  }
  expect(parseVideoEmbed(accepted[1]).src).toBe(
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  );
  expect(parseVideoEmbed(accepted[7]).src).toBe(
    "https://player.vimeo.com/video/76979871?h=abc123def",
  );
  const nested = field.list({ item: field.group({ fields: { url: metadata } }) });
  expect(() =>
    validateFieldValue(nested, [{ url: "https://example.com/" }], ["clips"], "draft"),
  ).toThrow(ContentValidationError);
  try {
    validateFieldValue(nested, [{ url: "https://example.com/" }], ["clips"], "draft");
  } catch (error) {
    expect(error.issues[0].path).toEqual(["clips", 0, "url"]);
  }
  expect(() => validateModelFields({ url: descriptor }, {}, "draft")).not.toThrow();
  expect(() => validateModelFields({ url: descriptor }, {}, "publish")).toThrow();
  expect(() =>
    validateFieldValue(field.url({ embedProviders: ["vimeo"] }), accepted[0], [], "draft"),
  ).toThrow();
});
