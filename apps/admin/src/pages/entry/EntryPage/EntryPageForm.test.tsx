import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { ContentModelDto } from "@lacecms/contracts";
import {
  draftEntry,
  models,
  renderRoute,
  stubClient as client,
  staticSessionSource,
} from "../../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

test("rich-text controls refuse an unsafe link and an unsafe stored link blocks save", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn(async () => draftEntry);
  const editorModel: ContentModelDto = {
    blocks: [],
    fields: {
      body: { required: false, type: "richText" },
      stored: { required: false, type: "richText" },
    },
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
  };
  const unsafe = {
    content: [
      {
        content: [
          {
            marks: [{ attrs: { href: "javascript:alert(1)" }, type: "link" }],
            text: "x",
            type: "text",
          },
        ],
        type: "paragraph",
      },
    ],
    type: "doc",
  };
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listModels: async () =>
        ({
          listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
          items: [models.items[0]!, editorModel],
        }) as never,
      loadEntry: async () => ({
        ...draftEntry,
        draft: { ...draftEntry.draft, fields: { stored: unsafe } },
      }),
      saveDraft,
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  const body = screen.getByRole("toolbar", { name: "Body formatting" });
  await user.click(within(body).getByRole("button", { name: "Link" }));
  await user.type(await screen.findByLabelText("Link URL"), "javascript:alert(1){Enter}");
  expect(screen.getByRole("alert")).toHaveTextContent("Links must start with");
  await user.keyboard("{Escape}");
  expect(screen.getByRole("textbox", { name: "Body" })).not.toHaveAttribute("aria-invalid");

  await user.type(screen.getByLabelText("Title"), " changed");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  const stored = screen.getByRole("textbox", { name: "Stored" });
  await waitFor(() => expect(stored).toHaveAttribute("aria-invalid", "true"));
  expect(document.getElementById("field-fields-stored-error")).toHaveTextContent(
    "Links must start with https://, http://, mailto:, tel:, / or #.",
  );
  expect(saveDraft).not.toHaveBeenCalled();
});

test("page editors omit the collection slug controls", async () => {
  renderRoute(
    "/content/home/home-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      loadEntry: async () => ({
        ...draftEntry,
        id: "home-1",
        model: { key: "home", kind: "page", path: "/" },
      }),
    }),
  );
  await screen.findByRole("heading", { name: "Edit home" });
  expect(screen.queryByLabelText("Slug")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Suggest from title")).not.toBeInTheDocument();
});

const summaryModel: ContentModelDto = {
  blockDefinitions: [
    {
      fields: {
        body: { required: false, type: "richText" },
        heading: { minLength: 5, required: true, type: "text" },
      },
      label: "Hero",
      type: "hero",
      version: 1,
    },
  ],
  blocks: ["hero"],
  fields: {
    summary: { required: true, type: "text" },
    website: { required: false, type: "url" },
  },
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
};

const summaryBlocks = [
  { data: { heading: "First hero" }, key: "01ARZ3NDEKTSV4RRFFQ69G5FA1", position: 100 },
  { data: { heading: "Second hero" }, key: "01ARZ3NDEKTSV4RRFFQ69G5FA2", position: 200 },
].map((block) => ({ ...block, hidden: false, schemaVersion: 1, settings: {}, type: "hero" }));

function mountSummary(overrides: Partial<AdminClient> = {}, role: "admin" | "editor" = "editor") {
  const saveDraft = vi.fn(
    async (_entryId: string, input: Parameters<AdminClient["saveDraft"]>[1]) => ({
      ...draftEntry,
      draft: { ...draftEntry.draft, ...input, revision: 3 },
    }),
  );
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: `${role}-1`, role }),
    client({
      listModels: async () =>
        ({
          listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
          items: [models.items[0]!, summaryModel],
        }) as never,
      loadEntry: async () => ({
        ...draftEntry,
        draft: { ...draftEntry.draft, blocks: summaryBlocks, fields: { summary: "Kept" } },
      }),
      saveDraft: saveDraft as unknown as AdminClient["saveDraft"],
      ...overrides,
    }),
  );
  return saveDraft;
}

test("a blocked save focuses a summary whose links reach the invalid block field", async () => {
  const user = userEvent.setup();
  const saveDraft = mountSummary();
  await screen.findByRole("heading", { name: "Edit posts" });
  const secondHeading = screen.getAllByRole("textbox", { name: "Heading" })[1]!;
  await user.clear(secondHeading);
  await user.type(secondHeading, "Hi");
  await user.type(screen.getByLabelText("Website"), "javascript:alert(1)");
  await user.click(screen.getAllByRole("button", { name: "Collapse Hero block" })[1]!);
  await user.click(screen.getByRole("button", { name: "Save draft" }));

  const summary = await screen.findByRole("heading", { name: "There are 2 problems to fix" });
  await waitFor(() => expect(summary.closest("section")).toHaveFocus());
  const links = within(summary.closest("section")!).getAllByRole("link");
  expect(links.map((link) => link.textContent)).toEqual(["Heading in Hero block 2", "Website"]);
  expect(summary.closest("section")).toHaveTextContent(
    "Enter a URL that starts with https://, http://, mailto:, tel:, / or #.",
  );
  expect(saveDraft).not.toHaveBeenCalled();

  await user.click(links[0]!);
  expect(secondHeading).toBeVisible();
  expect(secondHeading).toHaveFocus();

  await user.type(secondHeading, " there");
  await user.clear(screen.getByLabelText("Website"));
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: /problems? to fix/u })).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
}, 15_000);

test("server issues map to block fields, deep rich-text paths, and unplaced text", async () => {
  const user = userEvent.setup();
  mountSummary({
    saveDraft: async () => {
      throw new AdminClientError({
        code: "VALIDATION_FAILED",
        issues: [
          {
            code: "invalid_field_value",
            message: "does not conform to its field definition.",
            path: "/blocks/0/data/body/content/0",
          },
          { code: "unknown_key", message: "is not permitted.", path: "/kind" },
          { code: "missing_required_field", message: "is required.", path: "/fields/summary" },
        ],
        message: "The request did not satisfy the API contract.",
        status: 422,
      });
    },
  });
  await screen.findByRole("heading", { name: "Edit posts" });
  await user.type(screen.getByLabelText("Title"), " edited");
  await user.click(screen.getByRole("button", { name: "Save draft" }));

  const summary = (
    await screen.findByRole("heading", { name: "There are 3 problems to fix" })
  ).closest("section")!;
  expect(
    within(summary)
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual(["Body in Hero block 1", "Summary"]);
  expect(summary).toHaveTextContent("Is not permitted.");
  expect(screen.getAllByRole("textbox", { name: "Body" })[0]).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(document.getElementById("field-fields-summary-error")).toHaveTextContent(
    "This field is required to publish.",
  );
  expect(screen.getByLabelText("Title")).toHaveValue("First post edited");
  expect(screen.queryByText("The request did not satisfy the API contract.")).toBe(null);
});

test("viewers see the entry read-only with no save or publish action", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn(async () => draftEntry);
  const viewerModel: ContentModelDto = {
    blocks: [],
    fields: {
      enabled: { required: false, type: "boolean" },
      summary: { required: false, type: "text" },
    },
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
  };
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "viewer-1", role: "viewer" }),
    client({
      listModels: async () =>
        ({
          listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
          items: [models.items[0]!, viewerModel],
        }) as never,
      saveDraft,
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  expect(within(screen.getByRole("banner")).getByRole("status")).toHaveTextContent("View only");
  expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Title")).toBeDisabled();
  expect(screen.getByLabelText("Slug")).toBeDisabled();
  expect(screen.getByLabelText("Summary")).toBeDisabled();
  expect(screen.getByRole("switch", { name: "Enabled" })).toBeDisabled();
  await user.keyboard("{Control>}s{/Control}");
  expect(saveDraft).not.toHaveBeenCalled();
});

test("a writer clears a saved optional date and saves without it", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn(async () => draftEntry);
  const dateModel: ContentModelDto = {
    blocks: [],
    fields: { eventDate: { required: false, type: "date" } },
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
  };
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listModels: async () =>
        ({
          listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
          items: [models.items[0]!, dateModel],
        }) as never,
      loadEntry: async () => ({
        ...draftEntry,
        draft: { ...draftEntry.draft, fields: { eventDate: "2026-09-01" } },
      }),
      saveDraft,
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  expect(screen.getByRole("button", { name: "Event Date" })).toHaveTextContent("Sep 1, 2026");
  await user.click(screen.getByRole("button", { name: "Clear Event Date" }));
  expect(screen.getByRole("button", { name: "Event Date" })).toHaveTextContent("Pick a date");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  expect(saveDraft).toHaveBeenCalledWith("entry-1", expect.objectContaining({ fields: {} }));
});

test("ordering rejection preserves the local draft and offers JSON recovery and retry", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn(async (_text: string) => undefined);
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
  let fail = true;
  const saveDraft = vi.fn(
    async (_entryId: string, input: Parameters<AdminClient["saveDraft"]>[1]) => {
      if (fail)
        throw new AdminClientError({
          code: "CONTENT_INVALID_STATE",
          message: "Block at index 1 has an invalid position.",
          requestId: "order-request",
        });
      return { ...draftEntry, draft: { ...draftEntry.draft, ...input, revision: 3 } };
    },
  );
  mountSummary({ saveDraft: saveDraft as unknown as AdminClient["saveDraft"] });
  await screen.findByRole("heading", { name: "Edit posts" });
  await user.type(screen.getByLabelText("Title"), " unsaved");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Block at index 1");
  expect(screen.getByText(/Your unsaved changes are still here/u)).toBeInTheDocument();
  expect(screen.getByText("Request ID: order-request")).toBeInTheDocument();
  expect(screen.getByLabelText("Title")).toHaveValue(`${draftEntry.draft.title} unsaved`);
  await user.click(screen.getByRole("button", { name: "Copy my JSON" }));
  const json = JSON.parse(writeText.mock.calls[0]![0] as string);
  expect(json.blocks.map((block: { position: number }) => block.position)).toEqual([1000, 2000]);
  expect(json.title).toBe(`${draftEntry.draft.title} unsaved`);
  fail = false;
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("publish validation rejections use the same locations", async () => {
  const user = userEvent.setup();
  const publishEntry = vi.fn(async () => {
    throw new AdminClientError({
      code: "VALIDATION_FAILED",
      issues: [
        {
          code: "missing_required_field",
          message: "is required for publication.",
          path: "/fields/website",
        },
      ],
      message: "The request did not satisfy the API contract.",
      status: 422,
    });
  });
  mountSummary({ publishEntry: publishEntry as unknown as AdminClient["publishEntry"] }, "admin");
  await screen.findByRole("heading", { name: "Edit posts" });
  await user.click(screen.getByRole("button", { name: "Publish" }));
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm publication" }),
  );
  const summary = (
    await screen.findByRole("heading", { name: "There is 1 problem to fix" })
  ).closest("section")!;
  expect(within(summary).getByRole("link", { name: "Website" })).toBeInTheDocument();
  expect(document.getElementById("field-fields-website-error")).toHaveTextContent(
    "This field is required to publish.",
  );
});
