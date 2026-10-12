import { describe, expect, test } from "vitest";
import type { ContentModelDto } from "@lacecms/contracts";
import type { FieldMetadata } from "@lacecms/content";
import {
  fieldProblem,
  initialModelFieldValues,
  isUlid,
  issueLocation,
  locationField,
  serverIssueMessage,
  suggestSlug,
  validateDraftValues,
  withoutClearedValues,
} from "./editor-form.js";

const model = {
  blocks: [],
  fields: {
    enabled: { defaultValue: false, required: false, type: "boolean" },
    score: { max: 5, min: 1, required: true, type: "number" },
    status: { options: ["draft", "live"], required: false, type: "select" },
    url: { required: false, type: "url" },
  },
  key: "posts",
  kind: "collection" as const,
  route: "/posts/:slug",
  version: 1,
} satisfies ContentModelDto;

describe("metadata-driven draft validation", () => {
  test("uses portable field rules and preserves draft-required optionality", async () => {
    expect(
      validateDraftValues(model, {
        blocks: [],
        fields: { score: 6, status: "other", url: "javascript:alert(1)" },
        title: "",
      }),
    ).toMatchObject({
      fields: {
        score: { message: "Enter a number from 1 to 5." },
        status: { message: "Choose one of the listed options." },
        url: {
          message: "Enter a URL that starts with https://, http://, mailto:, tel:, / or #.",
        },
      },
      title: { message: "Title is required." },
    });
    expect(validateDraftValues(model, { blocks: [], fields: {}, title: "Draft" })).toEqual({});
  });

  test("accepts draft values for every portable descriptor variant", () => {
    const allFieldsModel = {
      blocks: [],
      fields: {
        active: { required: false, type: "boolean" },
        amount: { required: false, type: "number" },
        body: { required: false, type: "textarea" },
        date: { required: false, type: "date" },
        datetime: { required: false, type: "datetime" },
        hero: { required: false, type: "media" },
        link: { required: false, type: "url" },
        richBody: { required: false, type: "richText" },
        section: { options: ["news"], required: false, type: "select" },
        title: { required: false, type: "text" },
      },
      key: "posts",
      kind: "collection" as const,
      route: "/posts/:slug",
      version: 1,
    } satisfies ContentModelDto;

    expect(
      validateDraftValues(allFieldsModel, {
        blocks: [],
        fields: {
          active: false,
          amount: 3,
          body: "A paragraph",
          date: "2026-02-28",
          datetime: "2026-09-20T12:00:00.000Z",
          hero: "01K4M0D3LQYH8ND26GG2DDC8N2",
          link: "/about",
          richBody: {
            content: [{ content: [{ text: "Lace", type: "text" }], type: "paragraph" }],
            type: "doc",
          },
          section: "news",
          title: "Hello",
        },
        title: "Draft",
      }),
    ).toEqual({});
  });

  test("applies field defaults and maps only known server error paths", () => {
    expect(initialModelFieldValues(model, {})).toMatchObject({ enabled: false });
    expect(issueLocation("/title", model, [])).toBe("title");
    expect(issueLocation("/slug", model, [])).toBe("slug");
    expect(issueLocation("/fields/status", model, [])).toBe("fields.status");
    expect(issueLocation("/fields/status/nested/0", model, [])).toBe("fields.status");
    expect(issueLocation("/fields/unknown", model, [])).toBeUndefined();
    expect(issueLocation("/blocks", model, [])).toBe("blocks.root");
    expect(issueLocation("/blocks/0/data/title", model, [])).toBeUndefined();
    expect(issueLocation("", model, [])).toBeUndefined();
    expect(issueLocation("/kind", model, [])).toBeUndefined();
    expect(issueLocation("/title/extra", model, [])).toBeUndefined();
  });

  test("validates local block metadata and maps only its current block paths", () => {
    const blockModel = {
      blockDefinitions: [
        {
          fields: { actionUrl: { required: false, type: "url" } },
          type: "cta",
          version: 1,
        },
      ],
      blocks: ["cta"],
      fields: {},
      key: "posts",
      kind: "collection" as const,
      route: "/posts/:slug",
      version: 1,
    } satisfies ContentModelDto;
    const block = {
      data: { actionUrl: "javascript:alert(1)" },
      key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      position: 1_000,
      hidden: false,
      schemaVersion: 1,
      settings: {},
      type: "cta",
    };
    expect(isUlid(block.key)).toBe(true);
    expect(
      validateDraftValues(blockModel, { blocks: [block], fields: {}, title: "Post" }),
    ).toMatchObject({
      blocks: { 0: { data: { actionUrl: {} } } },
    });
    expect(issueLocation("/blocks/0/data/actionUrl", blockModel, [block])).toBe(
      "blocks.0.data.actionUrl",
    );
    expect(issueLocation("/blocks/0/data/actionUrl/content/0", blockModel, [block])).toBe(
      "blocks.0.data.actionUrl",
    );
    expect(issueLocation("/blocks/0/data/unknown", blockModel, [block])).toBe(
      "blocks.0.data.unknown",
    );
    expect(issueLocation("/blocks/0/type", blockModel, [block])).toBe("blocks.0.type");
    expect(issueLocation("/blocks/0/key", blockModel, [block])).toBe("blocks.0.key");
    expect(issueLocation("/blocks/0/schemaVersion", blockModel, [block])).toBe(
      "blocks.0.schemaVersion",
    );
    expect(issueLocation("/blocks/0", blockModel, [block])).toBe("blocks.0.block");
    // Envelope issues have no control until the Settings tab exists; they stay on the block.
    for (const pointer of [
      "/blocks/0/anchor",
      "/blocks/0/className",
      "/blocks/0/hidden",
      "/blocks/0/settings",
      "/blocks/0/settings/align",
    ]) {
      expect(issueLocation(pointer, blockModel, [block])).toBe("blocks.0.block");
    }
    expect(issueLocation("/blocks/0/data", blockModel, [block])).toBe("blocks.0.block");
    expect(issueLocation("/blocks/1/data/actionUrl", blockModel, [block])).toBeUndefined();
    expect(issueLocation("/blocks/01/type", blockModel, [block])).toBeUndefined();
    expect(locationField("blocks.0.data.actionUrl", blockModel, [block])).toEqual({
      required: false,
      type: "url",
    });
    expect(locationField("blocks.0.type", blockModel, [block])).toBeUndefined();
    expect(
      validateDraftValues(blockModel, {
        blocks: [{ ...block, data: { actionUrl: "/safe", extra: 1 } }],
        fields: {},
        title: "Post",
      }),
    ).toMatchObject({
      blocks: {
        0: { data: { extra: { message: "This block has data for the undefined field “extra”." } } },
      },
    });
    expect(
      validateDraftValues(blockModel, {
        blocks: [{ ...block, data: { actionUrl: "/safe" }, key: "invalid" }, { ...block }],
        fields: {},
        title: "Post",
      }),
    ).toMatchObject({ blocks: { 0: { key: { message: "This block's key is not valid." } } } });
  });

  test("describes descriptor violations as sentences without the value", () => {
    const text = { maxLength: 5, minLength: 2, required: false, type: "text" } as FieldMetadata;
    expect(fieldProblem(text, "ok")).toBeUndefined();
    expect(fieldProblem(text, "x")).toBe("Enter between 2 and 5 characters.");
    expect(fieldProblem({ minLength: 3, required: false, type: "textarea" }, "x")).toBe(
      "Enter at least 3 characters.",
    );
    expect(fieldProblem({ maxLength: 3, required: false, type: "text" }, "long")).toBe(
      "Enter no more than 3 characters.",
    );
    expect(fieldProblem({ min: 2, required: false, type: "number" }, 1)).toBe(
      "Enter a number of at least 2.",
    );
    expect(fieldProblem({ required: false, type: "number" }, Number.NaN)).toBe("Enter a number.");
    expect(fieldProblem({ required: false, type: "date" }, "2026-02-30")).toBe(
      "Choose a valid date.",
    );
    expect(fieldProblem({ required: false, type: "datetime" }, "soon")).toBe(
      "Choose a valid date and time.",
    );
    expect(fieldProblem({ required: false, type: "media" }, "")).toBe("Choose a media item.");
    expect(fieldProblem({ required: false, type: "boolean" }, "yes")).toBe("Choose on or off.");
    const richText = { required: false, type: "richText" } as FieldMetadata;
    const link = (href: string) => ({
      content: [
        {
          content: [{ marks: [{ attrs: { href }, type: "link" }], text: "x", type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
    expect(fieldProblem(richText, link("https://lace.test"))).toBeUndefined();
    expect(fieldProblem(richText, link("javascript:alert(1)"))).toBe(
      "Links must start with https://, http://, mailto:, tel:, / or #.",
    );
    expect(fieldProblem(richText, { content: [{ type: "image" }], type: "doc" })).toBe(
      "Remove formatting that is not supported here.",
    );
    expect(fieldProblem(richText, { type: "invalid" })).toBe(
      "This text could not be read. Undo the last change or clear the field.",
    );
  });

  test("maps server issue codes to the same sentences", () => {
    const url = { required: false, type: "url" } as FieldMetadata;
    expect(
      serverIssueMessage(
        { code: "invalid_field_value", message: "does not conform to its field definition." },
        { definition: url, value: "javascript:x" },
      ),
    ).toBe("Enter a URL that starts with https://, http://, mailto:, tel:, / or #.");
    expect(serverIssueMessage({ code: "invalid_field_value", message: "x" })).toBe(
      "This value is not valid for this field.",
    );
    expect(serverIssueMessage({ code: "missing_required_field", message: "x" })).toBe(
      "This field is required to publish.",
    );
    expect(serverIssueMessage({ code: "disallowed_block_type", message: "x" })).toBe(
      "This block type is not allowed by the model.",
    );
    expect(serverIssueMessage({ code: "too_many_blocks", message: "must not contain more." })).toBe(
      "Must not contain more.",
    );
    expect(serverIssueMessage({ code: "invalid_value", message: "Summary is unavailable." })).toBe(
      "Summary is unavailable.",
    );
  });

  test("suggests a stable collection slug", () => {
    expect(suggestSlug("  Crème brûlée — Launch! ")).toBe("creme-brulee-launch");
  });
});

test("cleared values are removed from fields and block data before saving", () => {
  expect(
    withoutClearedValues({
      blocks: [
        {
          data: { alt: null, media: "media-1" },
          key: "k",
          position: 0,
          hidden: false,
          schemaVersion: 1,
          settings: {},
          type: "image",
        },
      ],
      fields: { date: null, title: "Kept", zero: 0 },
      title: "T",
    } as never),
  ).toEqual({
    blocks: [
      {
        data: { media: "media-1" },
        hidden: false,
        key: "k",
        position: 0,
        schemaVersion: 1,
        settings: {},
        type: "image",
      },
    ],
    fields: { title: "Kept", zero: 0 },
    title: "T",
  });
});

describe("SEO validation and issue mapping", () => {
  const seo = { canonical: "/a", description: "", image: null, noindex: false, title: "" };

  test("the resolver reports SEO problems at their values", () => {
    expect(
      validateDraftValues(model, { blocks: [], fields: { score: 2 }, seo, title: "T" }),
    ).toEqual({
      seo: {
        canonical: {
          message:
            "Enter an absolute URL that starts with https:// or http://, without credentials or a # fragment.",
          type: "validate",
        },
      },
    });
  });

  test("maps SEO pointers to their controls and leaves the group unmapped", () => {
    expect(issueLocation("/seo/title", model, [])).toBe("seo.title");
    expect(issueLocation("/seo/image", model, [])).toBe("seo.image");
    expect(issueLocation("/seo", model, [])).toBeUndefined();
    expect(issueLocation("/seo/other", model, [])).toBeUndefined();
    expect(issueLocation("/seo/title/0", model, [])).toBeUndefined();
  });

  test("words SEO server issues as sentences", () => {
    expect(
      serverIssueMessage({
        code: "seo_text_too_long",
        message: "must not exceed 500 characters.",
        path: "/seo/description",
      }),
    ).toBe("Enter no more than 500 characters.");
    expect(
      serverIssueMessage({ code: "seo_text_too_long", message: "x", path: "/seo/title" }),
    ).toBe("Enter no more than 200 characters.");
    expect(serverIssueMessage({ code: "invalid_seo_image", message: "x" })).toBe(
      "Choose a media item.",
    );
    expect(serverIssueMessage({ code: "seo_not_allowed", message: "is not enabled." })).toBe(
      "SEO is no longer enabled for this model. Reload the entry to continue.",
    );
  });
});
