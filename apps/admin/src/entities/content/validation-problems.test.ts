import type { ContentModelDto } from "@lacecms/contracts";
import { expect, test } from "vitest";
import { blockLevelProblems, validationProblems } from "./validation-problems.js";

const model = {
  blockDefinitions: [
    {
      fields: {
        body: { required: false, type: "richText" },
        heading: { required: true, type: "text" },
      },
      label: "Hero",
      type: "hero",
      version: 1,
    },
  ],
  blocks: ["hero"],
  fields: {
    summary: { label: "Short summary", required: false, type: "text" },
    websiteUrl: { required: false, type: "url" },
  },
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
} satisfies ContentModelDto;

const block = (key: string, type = "hero") => ({
  data: {},
  key,
  position: 1024,
  hidden: false,
  schemaVersion: 1,
  settings: {},
  type,
});

test("lists problems in reading order with labels and targets", () => {
  const problems = validationProblems({
    blocks: [block("A"), block("B"), block("C", "legacy")],
    errors: {
      blocks: {
        1: {
          data: { body: { message: "Body problem." }, heading: { message: "Heading problem." } },
        },
        2: { type: { message: "This block type is not allowed by the model." } },
        root: { message: "Too many blocks." },
      },
      fields: {
        summary: { message: "Summary problem." },
        websiteUrl: { message: "URL problem." },
      },
      slug: { message: "Slug problem." },
      title: { message: "Title problem." },
    } as never,
    model,
    unmapped: ["Something else was rejected."],
  });

  expect(problems.map(({ label, message, target }) => ({ label, message, target }))).toEqual([
    { label: "Title", message: "Title problem.", target: { id: "system-title", kind: "control" } },
    { label: "Blocks", message: "Too many blocks.", target: { kind: "blocks" } },
    {
      label: "Body in Hero block 2",
      message: "Body problem.",
      target: { id: "field-blocks-1-data-body", kind: "control" },
    },
    {
      label: "Heading in Hero block 2",
      message: "Heading problem.",
      target: { id: "field-blocks-1-data-heading", kind: "control" },
    },
    {
      label: "Legacy block 3",
      message: "This block type is not allowed by the model.",
      target: { key: "C", kind: "block" },
    },
    { label: "Slug", message: "Slug problem.", target: { id: "system-slug", kind: "control" } },
    {
      label: "Short summary",
      message: "Summary problem.",
      target: { id: "field-fields-summary", kind: "control" },
    },
    {
      label: "Website Url",
      message: "URL problem.",
      target: { id: "field-fields-websiteUrl", kind: "control" },
    },
    { label: "Draft", message: "Something else was rejected.", target: undefined },
  ]);
  expect(new Set(problems.map((problem) => problem.id)).size).toBe(problems.length);
});

test("an empty error state has no problems", () => {
  expect(validationProblems({ blocks: [block("A")], errors: {}, model })).toEqual([]);
});

test("block-level problems include undefined data fields but not defined fields", () => {
  expect(
    blockLevelProblems(
      {
        block: { message: "Whole block." },
        data: { extra: { message: "Undefined field." }, heading: { message: "Field." } },
        key: { message: "Key." },
        schemaVersion: { message: "Version." },
      },
      { heading: {} },
    ),
  ).toEqual(["Key.", "Version.", "Whole block.", "Undefined field."]);
  expect(blockLevelProblems(undefined, {})).toEqual([]);
  expect(
    blockLevelProblems(
      {
        anchor: { message: "Anchor." },
        settings: { align: { message: "Align." }, size: { message: "Undeclared setting." } },
      },
      {},
      { align: {} },
    ),
  ).toEqual(["Undeclared setting."]);
});

test("lists SEO problems after model fields in card order", () => {
  const problems = validationProblems({
    blocks: [],
    errors: {
      fields: { summary: { message: "Enter text.", type: "validate" } },
      seo: {
        canonical: { message: "Bad URL.", type: "server" },
        title: { message: "Too long.", type: "validate" },
      },
    } as never,
    model,
    unmapped: ["Not placed."],
  });
  expect(problems.map((problem) => [problem.label, problem.target])).toEqual([
    ["Short summary", { id: "field-fields-summary", kind: "control" }],
    ["SEO title", { id: "seo-title", kind: "control" }],
    ["Canonical URL", { id: "seo-canonical", kind: "control" }],
    ["Draft", undefined],
  ]);
});

test("settings problems follow content fields and hidden-block publication problems do not block", () => {
  const settingsModel = {
    ...model,
    blockDefinitions: [
      {
        ...model.blockDefinitions[0],
        settings: {
          align: { defaultValue: "left", options: ["left"], required: false, type: "select" },
        },
      },
    ],
  } as unknown as ContentModelDto;
  const hidden = { ...block("B"), hidden: true };
  const problems = validationProblems({
    blocks: [block("A"), hidden],
    errors: {
      blocks: {
        0: {
          anchor: { message: "Anchor problem." },
          className: { message: "Class problem." },
          data: { heading: { message: "Heading problem." } },
          settings: { align: { message: "Align problem." } },
        },
        1: {
          data: {
            body: { message: "Too long.", type: "validate" },
            heading: { message: "Required to publish.", type: "publication" },
          },
        },
      },
      title: { message: "Title problem." },
    } as never,
    model: settingsModel,
  });
  expect(problems.map(({ blocking, label, target }) => ({ blocking, label, target }))).toEqual([
    { blocking: true, label: "Title", target: { id: "system-title", kind: "control" } },
    {
      blocking: true,
      label: "Heading in Hero block 1",
      target: { id: "field-blocks-0-data-heading", kind: "control" },
    },
    {
      blocking: true,
      label: "Anchor in Hero block 1",
      target: { id: "field-blocks-0-anchor", kind: "control" },
    },
    {
      blocking: true,
      label: "Align in Hero block 1",
      target: { id: "field-blocks-0-settings-align", kind: "control" },
    },
    {
      blocking: true,
      label: "CSS classes in Hero block 1",
      target: { id: "field-blocks-0-className", kind: "control" },
    },
    {
      blocking: true,
      label: "Body in Hero block 2 (hidden)",
      target: { id: "field-blocks-1-data-body", kind: "control" },
    },
    {
      blocking: false,
      label: "Heading in Hero block 2 (hidden)",
      target: { id: "field-blocks-1-data-heading", kind: "control" },
    },
  ]);
  // The same publication problem in a visible block blocks.
  expect(
    validationProblems({
      blocks: [block("A")],
      errors: {
        blocks: { 0: { data: { heading: { message: "Required.", type: "publication" } } } },
      } as never,
      model: settingsModel,
    })[0]?.blocking,
  ).toBe(true);
});

test("nested parent and child problems keep readable reading order and hidden minimum exemptions", () => {
  const list = {
    type: "list",
    required: false,
    item: {
      type: "group",
      required: false,
      fields: { url: { type: "url", label: "Address", required: false } },
    },
  } as const;
  const nested = {
    ...model,
    fields: { links: list },
    blockDefinitions: [{ ...model.blockDefinitions[0]!, fields: { links: list } }],
  };
  const problems = validationProblems({
    model: nested,
    blocks: [{ ...block("A"), hidden: true }],
    errors: {
      blocks: {
        0: {
          data: {
            links: {
              message: "Minimum",
              type: "publication",
              0: { url: { message: "Invalid URL", type: "validate" } },
            },
          },
        },
      },
      fields: { links: [{ url: { message: "Rejected", type: "server" } }] },
    } as never,
  });
  expect(problems.map((problem) => problem.message)).toEqual([
    "Invalid URL",
    "Rejected",
    "Minimum",
  ]);
  expect(problems[0]!.target).toEqual({ kind: "control", id: "field-blocks-0-data-links-0-url" });
  expect(problems[1]!.label).toBe("Address in Item 1 in Links");
  expect(problems[2]!.blocking).toBe(false);
});
