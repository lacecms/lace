import {
  ContentValidationError,
  builtInBlocks,
  defineBlock,
  field,
  validateRichTextDocument,
} from "@lacecms/content";
import { expect, test } from "vitest";
import {
  LaceRenderError,
  defineBlockMap,
  describeRichText,
  parseBlock,
  prepareBlocks,
  resolveBlock,
} from "../dist/index.js";

const context = Object.freeze({ blockKey: "block-1", entryId: "entry-1", modelKey: "posts" });

function paragraph(...content) {
  return { content, type: "paragraph" };
}

function text(value, marks) {
  return marks === undefined ? { text: value, type: "text" } : { marks, text: value, type: "text" };
}

function doc(...content) {
  return { content, type: "doc" };
}

function block(type, data, overrides = {}) {
  return { data, key: "block-1", position: 0, schemaVersion: 1, type, ...overrides };
}

function captureError(run) {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected a failure.");
}

const body = doc(paragraph(text("Hello "), text("world", [{ type: "bold" }])));

test.each([
  [
    "hero",
    {
      body,
      eyebrow: "Lace",
      heading: "Welcome",
      image: "hero-media",
      primaryActionLabel: "Read",
      primaryActionUrl: "/blog/first",
    },
  ],
  ["richText", { content: body }],
  ["image", { alt: "A lake", caption: "Morning", media: "lake-media" }],
  ["quote", { attribution: "Ada", quote: "Make it simple." }],
  ["cta", { actionLabel: "Start", actionUrl: "https://lace.example/docs", body, heading: "Go" }],
])("parses the built-in %s block", (type, data) => {
  expect(parseBlock(builtInBlocks[type], block(type, data), context)).toEqual(data);
});

test("parses a user-defined block and applies defaults", () => {
  const banner = defineBlock({
    defaultValue: { tone: "info" },
    fields: {
      message: field.text({ required: true }),
      tone: field.select({ options: ["info", "warning"] }),
    },
    type: "banner",
    version: 2,
  });
  expect(
    parseBlock(banner, block("banner", { message: "Hi" }, { schemaVersion: 2 }), context),
  ).toEqual({ message: "Hi", tone: "info" });
});

test("missing required data names model, entry, block key, and field path", () => {
  const error = captureError(() =>
    parseBlock(builtInBlocks.hero, block("hero", { eyebrow: "No heading" }), context),
  );
  expect(error).toBeInstanceOf(LaceRenderError);
  expect(error.code).toBe("invalid_block_data");
  expect(error.context).toEqual(context);
  expect(error.fieldPath).toEqual(["heading"]);
  expect(error.cause).toBeInstanceOf(ContentValidationError);
  for (const part of ["block-1", "posts", "entry-1", "heading"]) {
    expect(error.message).toContain(part);
  }
});

test("invalid nested rich text in block data reports the nested field path", () => {
  const error = captureError(() =>
    parseBlock(
      builtInBlocks.richText,
      block("richText", { content: doc(paragraph(paragraph(text("x")))) }),
      context,
    ),
  );
  expect(error.code).toBe("invalid_block_data");
  expect(error.fieldPath[0]).toBe("content");
});

test("unsafe URLs in block data are rejected", () => {
  const error = captureError(() =>
    parseBlock(
      builtInBlocks.cta,
      block("cta", { actionLabel: "Go", actionUrl: "javascript:alert(1)", heading: "Go" }),
      context,
    ),
  );
  expect(error.code).toBe("invalid_block_data");
  expect(error.fieldPath).toEqual(["actionUrl"]);
});

test("a block of another type fails against a definition", () => {
  const error = captureError(() =>
    parseBlock(builtInBlocks.hero, block("quote", { quote: "x" }), context),
  );
  expect(error.code).toBe("unknown_block_type");
});

test("a schema-version mismatch fails without migrating", () => {
  const hero2 = defineBlock({ fields: builtInBlocks.hero.fields, type: "hero", version: 2 });
  const error = captureError(() =>
    parseBlock(hero2, block("hero", { heading: "Old" }, { schemaVersion: 1 }), context),
  );
  expect(error.code).toBe("block_version_mismatch");
  expect(error.message).toContain("version 1");
  expect(error.message).toContain("version 2");
});

test("block maps reject a key that differs from its definition type", () => {
  expect(() =>
    defineBlockMap({ banner: { component: "Hero", definition: builtInBlocks.hero } }),
  ).toThrow(/banner/u);
});

test("block maps are frozen", () => {
  const map = defineBlockMap({ hero: { component: "Hero", definition: builtInBlocks.hero } });
  expect(Object.isFrozen(map)).toBe(true);
  expect(Object.isFrozen(map.hero)).toBe(true);
});

test.each(["gallery", "constructor", "toString", "__proto__"])(
  "resolving the unmapped type %s fails with block identifiers",
  (type) => {
    const map = defineBlockMap({ hero: { component: "Hero", definition: builtInBlocks.hero } });
    const error = captureError(() => resolveBlock(map, block(type, {}), context));
    expect(error.code).toBe("unknown_block_type");
    for (const part of [type, "posts", "entry-1", "block-1"]) {
      expect(error.message).toContain(part);
    }
  },
);

test("prepareBlocks returns components and props in block order", () => {
  const map = defineBlockMap({
    cta: { component: "Cta", definition: builtInBlocks.cta },
    hero: { component: "Hero", definition: builtInBlocks.hero },
    quote: { component: "Quote", definition: builtInBlocks.quote },
  });
  const mediaUrl = (id) => `https://media.example/${id}`;
  const blocks = [
    block("hero", { heading: "Top" }, { key: "a", position: 0 }),
    block("quote", { quote: "Middle" }, { key: "b", position: 1 }),
    block(
      "cta",
      { actionLabel: "Go", actionUrl: "/go", heading: "End" },
      { key: "c", position: 2 },
    ),
  ];
  const prepared = prepareBlocks(map, { blocks, id: "entry-1", modelKey: "home" }, mediaUrl);
  expect(prepared.map((item) => item.component)).toEqual(["Hero", "Quote", "Cta"]);
  expect(prepared[1].props).toEqual({
    block: blocks[1],
    context: { blockKey: "b", entryId: "entry-1", modelKey: "home" },
    data: { quote: "Middle" },
    mediaUrl,
  });
  expect(Object.isFrozen(prepared)).toBe(true);
});

test("prepareBlocks fails on a block the site cannot render", () => {
  const map = defineBlockMap({ hero: { component: "Hero", definition: builtInBlocks.hero } });
  const error = captureError(() =>
    prepareBlocks(
      map,
      { blocks: [block("gallery", {}, { key: "g" })], id: "entry-9", modelKey: "home" },
      () => "",
    ),
  );
  expect(error.code).toBe("unknown_block_type");
  expect(error.context).toEqual({ blockKey: "g", entryId: "entry-9", modelKey: "home" });
});

test("describes every allowlisted node and mark", () => {
  const description = describeRichText(
    doc(
      { attrs: { level: 2 }, content: [text("Title")], type: "heading" },
      paragraph(
        text("bold link", [{ type: "bold" }, { attrs: { href: "/docs" }, type: "link" }]),
        { type: "hardBreak" },
        text("rest", [{ type: "italic" }, { type: "strike" }, { type: "code" }]),
      ),
      { content: [{ content: [paragraph(text("one"))], type: "listItem" }], type: "bulletList" },
      { content: [{ content: [paragraph(text("two"))], type: "listItem" }], type: "orderedList" },
      { content: [paragraph(text("quoted"))], type: "blockquote" },
    ),
  );
  const t = (value) => ({ kind: "text", text: value });
  const el = (tag, source, children, attributes = {}) => ({
    attributes,
    children,
    kind: "element",
    source,
    tag,
  });
  expect(description).toEqual([
    el("h2", "heading", [t("Title")]),
    el("p", "paragraph", [
      el("strong", "bold", [el("a", "link", [t("bold link")], { href: "/docs" })]),
      el("br", "hardBreak", []),
      el("em", "italic", [el("s", "strike", [el("code", "code", [t("rest")])])]),
    ]),
    el("ul", "bulletList", [el("li", "listItem", [el("p", "paragraph", [t("one")])])]),
    el("ol", "orderedList", [el("li", "listItem", [el("p", "paragraph", [t("two")])])]),
    el("blockquote", "blockquote", [el("p", "paragraph", [t("quoted")])]),
  ]);
  expect(Object.isFrozen(description)).toBe(true);
  expect(Object.isFrozen(description[0])).toBe(true);
});

test("text is carried verbatim for adapters to escape", () => {
  expect(describeRichText(doc(paragraph(text("<script>alert(1)</script>"))))).toEqual([
    {
      attributes: {},
      children: [{ kind: "text", text: "<script>alert(1)</script>" }],
      kind: "element",
      source: "paragraph",
      tag: "p",
    },
  ]);
});

test("invalid rich text carries block context and the full field path", () => {
  const error = captureError(() =>
    describeRichText(
      doc(paragraph(text("x", [{ attrs: { href: "https:example.com" }, type: "link" }]))),
      {
        block: context,
        fieldPath: ["body"],
      },
    ),
  );
  expect(error).toBeInstanceOf(LaceRenderError);
  expect(error.code).toBe("invalid_rich_text");
  expect(error.context).toEqual(context);
  expect(error.fieldPath).toEqual([
    "body",
    "content",
    0,
    "content",
    0,
    "marks",
    0,
    "attrs",
    "href",
  ]);
  expect(error.cause).toBeInstanceOf(ContentValidationError);
});

const link = (href) => doc(paragraph(text("link", [{ attrs: { href }, type: "link" }])));

const parityCorpus = [
  ["empty document", doc()],
  ["empty paragraph", doc({ type: "paragraph" })],
  ["formatted paragraph", body],
  [
    "heading levels",
    doc({ attrs: { level: 1 }, type: "heading" }, { attrs: { level: 3 }, type: "heading" }),
  ],
  [
    "nested list",
    doc({
      content: [
        {
          content: [
            paragraph(text("a")),
            {
              content: [{ content: [paragraph(text("b"))], type: "listItem" }],
              type: "orderedList",
            },
          ],
          type: "listItem",
        },
      ],
      type: "bulletList",
    }),
  ],
  ["root-relative link", link("/about")],
  ["fragment link", link("#top")],
  ["https link", link("https://example.com/path?q=1#x")],
  ["http link", link("http://example.com")],
  ["mailto link", link("mailto:ada@example.com")],
  ["tel link", link("tel:+15550100000")],
  ["tel link with spaces", link("tel:+1 555 010 0000")],
  ["drift: https without slashes", link("https:example.com")],
  ["drift: mailto without @", link("mailto:ada")],
  ["drift: paragraph in paragraph", doc(paragraph(paragraph(text("x"))))],
  ["protocol-relative link", link("//evil.example")],
  ["javascript link", link("javascript:alert(1)")],
  ["data link", link("data:text/html,<b>x</b>")],
  ["link with whitespace", link("https://exa mple.com")],
  [
    "link with target attribute",
    doc(paragraph(text("x", [{ attrs: { href: "/", target: "_blank" }, type: "link" }]))),
  ],
  ["unknown mark", doc(paragraph(text("x", [{ type: "underline" }])))],
  ["unknown node", doc({ content: [text("x")], type: "codeBlock" })],
  ["html node", doc({ html: "<b>x</b>", type: "html" })],
  ["heading level 4", doc({ attrs: { level: 4 }, type: "heading" })],
  ["text at root", doc(text("x"))],
  ["list without items", doc({ content: [paragraph(text("x"))], type: "bulletList" })],
  ["style attribute", doc({ attrs: { style: "color:red" }, type: "paragraph" })],
  ["event handler attribute", doc(paragraph({ onclick: "x", text: "x", type: "text" }))],
  ["not a document", { content: [], type: "paragraph" }],
  ["null", null],
  ["string", "<p>x</p>"],
];

test.each(parityCorpus)("render core and content validation agree: %s", (_name, value) => {
  let contentAccepts = true;
  try {
    validateRichTextDocument(value);
  } catch (error) {
    if (!(error instanceof ContentValidationError)) throw error;
    contentAccepts = false;
  }
  let renderAccepts = true;
  try {
    describeRichText(value);
  } catch (error) {
    if (!(error instanceof LaceRenderError)) throw error;
    expect(error.code).toBe("invalid_rich_text");
    renderAccepts = false;
  }
  expect(renderAccepts).toBe(contentAccepts);
});

test.each(["https:example.com", "mailto:ada"])("drift case %s is rejected", (href) => {
  expect(() => describeRichText(link(href))).toThrow(LaceRenderError);
});

test("paragraph nested in a paragraph is rejected", () => {
  expect(() => describeRichText(doc(paragraph(paragraph(text("x")))))).toThrow(LaceRenderError);
});

test("the parity corpus covers both accepted and rejected documents", () => {
  const accepted = parityCorpus.filter(([, value]) => {
    try {
      validateRichTextDocument(value);
      return true;
    } catch {
      return false;
    }
  });
  expect(accepted.length).toBe(11);
  expect(parityCorpus.length - accepted.length).toBe(20);
});
