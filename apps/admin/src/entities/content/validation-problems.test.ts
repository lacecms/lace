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
  schemaVersion: 1,
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
