import { defineBlock, field, toBlockMetadata } from "@lacecms/content";
import type { ContentModelDto } from "@lacecms/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  draftEntry,
  renderRoute,
  stubClient,
  staticSessionSource,
} from "../../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";

const model: ContentModelDto = {
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
  blocks: [],
  fields: {
    intro: field.text({ label: "Intro" }),
    hasVideo: field.boolean({ label: "Has video" }),
    videoUrl: field.url({ label: "Video URL", required: true }),
    videoTitle: field.text({ label: "Video title" }),
  },
  layout: {
    mode: "tabs",
    groups: [
      { key: "main", label: "Main tab", fields: ["intro", "hasVideo"] },
      { key: "video", label: "Video tab", fields: ["videoUrl", "videoTitle"] },
    ],
  },
  visibility: {
    videoUrl: { field: "hasVideo", values: [true] },
    videoTitle: { field: "hasVideo", values: [true] },
  },
};
const fields = { intro: "Intro", hasVideo: false, videoUrl: "https://vimeo.com/1" };
const initial = { ...draftEntry, draft: { ...draftEntry.draft, slug: "stable", fields } };

function open(saveDraft?: AdminClient["saveDraft"], role: "editor" | "viewer" = "editor") {
  return renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: `${role}-1`, role }),
    stubClient({
      listModels: async () => ({
        listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
        items: [model],
      }),
      loadEntry: async () => initial,
      ...(saveDraft === undefined ? {} : { saveDraft }),
    }),
  );
}

test("a model controller hides a whole tab and saving keeps the hidden value", async () => {
  const user = userEvent.setup();
  const save = vi.fn<AdminClient["saveDraft"]>(async (_id, input) => ({
    ...initial,
    draft: { ...initial.draft, fields: input.fields as never, revision: 3 },
  }));
  open(save);
  await screen.findByRole("tab", { name: "Main tab" });
  expect(screen.queryByRole("tab", { name: "Video tab" })).toBeNull();
  const toggle = screen.getByRole("switch", { name: "Has video" });
  await user.click(toggle);
  await user.click(screen.getByRole("tab", { name: "Video tab" }));
  expect(screen.getByRole("textbox", { name: "Video URL" })).toHaveValue("https://vimeo.com/1");
  await user.click(screen.getByRole("tab", { name: "Main tab" }));
  await user.click(toggle);
  expect(screen.queryByRole("tab", { name: "Video tab" })).toBeNull();
  // Switching back leaves only the unchanged hidden value; the draft is not dirty.
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await user.type(screen.getByRole("textbox", { name: "Intro" }), " more");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Saved revision 3");
  expect(save.mock.calls[0]![1].fields).toEqual({
    intro: "Intro more",
    hasVideo: false,
    videoUrl: "https://vimeo.com/1",
  });
});

test("viewers see only applicable model fields", async () => {
  open(undefined, "viewer");
  await screen.findByRole("tab", { name: "Main tab" });
  expect(screen.queryByRole("tab", { name: "Video tab" })).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Video URL" })).toBeNull();
});

const showcase = defineBlock({
  fields: {
    items: field.list({
      item: field.group({
        fields: {
          kind: field.select({
            defaultValue: "image",
            label: "Kind",
            options: ["image", "video"],
            required: true,
          }),
          note: field.text({ label: "Image note" }),
          videoUrl: field.url({ label: "Video URL", required: true }),
        },
        visibility: {
          note: { field: "kind", values: ["image"] },
          videoUrl: { field: "kind", values: ["video"] },
        },
      }),
      label: "Items",
    }),
  },
  label: "Showcase",
  type: "showcase",
  version: 1,
});

test("the summary reveals a conditional field inside a collapsed item of a collapsed block", async () => {
  const user = userEvent.setup();
  const blockModel: ContentModelDto = {
    ...model,
    blockDefinitions: [toBlockMetadata(showcase)],
    blocks: ["showcase"],
    fields: {},
    layout: undefined,
    visibility: undefined,
  };
  const entry = {
    ...initial,
    draft: {
      ...initial.draft,
      blocks: [
        {
          data: {
            items: [
              { kind: "image" },
              { kind: "image" },
              { kind: "video", videoUrl: "https://vimeo.com/1" },
            ],
          },
          hidden: false,
          key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          position: 1024,
          schemaVersion: 1,
          settings: {},
          type: "showcase",
        },
      ],
      fields: {},
    },
  };
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    stubClient({
      listModels: async () => ({
        listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
        items: [blockModel],
      }),
      loadEntry: async () => entry as never,
      saveDraft: async () => {
        throw new AdminClientError({
          code: "VALIDATION_FAILED",
          issues: [
            {
              code: "invalid_field_value",
              message: "does not conform to its field definition.",
              path: "/blocks/0/data/items/2/videoUrl",
            },
          ],
          message: "The request did not satisfy the API contract.",
          status: 422,
        });
      },
    }),
  );
  await user.click(await screen.findByRole("button", { name: "Collapse Showcase block" }));
  await user.type(screen.getByLabelText("Title"), " edited");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  const summary = (
    await screen.findByRole("heading", { name: "There is 1 problem to fix" })
  ).closest("section")!;
  await user.click(
    within(summary).getByRole("link", { name: "Video URL in Item 3 in Items in Showcase block 1" }),
  );
  const url = screen.getByRole("textbox", { name: "Video URL" });
  await waitFor(() => expect(url).toHaveFocus());
  expect(url).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "Image note" })).toBeNull();
});
