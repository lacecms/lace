import { field } from "@lacecms/content";
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
    details: field.group({
      label: "Details",
      fields: {
        note: field.text({ label: "Note" }),
        url: field.url({ label: "Address" }),
      },
      layout: {
        mode: "tabs",
        groups: [
          { key: "note", label: "Note tab", fields: ["note"] },
          { key: "url", label: "Address tab", fields: ["url"] },
        ],
      },
    }),
    absent: field.group({ label: "Absent", fields: { child: field.text() } }),
  },
  layout: {
    mode: "tabs",
    groups: [
      { key: "intro", label: "Intro tab", fields: ["intro"] },
      { key: "details", label: "Details tab", fields: ["details", "absent"] },
    ],
  },
};
const initial = {
  ...draftEntry,
  draft: {
    ...draftEntry.draft,
    slug: "stable",
    fields: { intro: "Intro", details: { note: "Note", url: "/valid" } },
  },
};

function open(
  saveDraft?: AdminClient["saveDraft"],
  role: "editor" | "viewer" | "admin" = "editor",
  extra: Partial<AdminClient> = {},
) {
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
      ...extra,
    }),
  );
}

test("CE9B nested layout navigation is clean, preserves absence and reveals validation", async () => {
  const user = userEvent.setup();
  const save = vi.fn<AdminClient["saveDraft"]>(async (_id, input) => ({
    ...initial,
    draft: {
      ...initial.draft,
      title: input.title,
      slug: input.slug ?? "",
      blocks: [...input.blocks],
      fields: input.fields as never,
      revision: 3,
    },
  }));
  open(save);
  await screen.findByRole("tab", { name: "Intro tab" });
  await user.click(screen.getByRole("tab", { name: "Details tab" }));
  await user.click(screen.getByRole("tab", { name: "Address tab" }));
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  const address = screen.getByRole("textbox", { name: "Address" });
  await user.clear(address);
  await user.type(address, "javascript:bad");
  await user.click(screen.getByRole("button", { name: "Collapse Details" }));
  await user.click(screen.getByRole("tab", { name: "Intro tab" }));
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await user.click(await screen.findByRole("link", { name: "Address in Details" }));
  expect(address).toHaveFocus();
  expect(address).toBeVisible();
  expect(screen.getByRole("tab", { name: /Details tab Has problems/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await user.clear(address);
  await user.type(address, "/changed");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Saved revision 3");
  expect(save.mock.calls[0]![1].fields).toEqual({
    intro: "Intro",
    details: { note: "Note", url: "/changed" },
  });
  expect(save.mock.calls[0]![1].slug).toBe("stable");
  expect(JSON.stringify(save.mock.calls[0]![1])).not.toContain('"layout"');
});

test.each([false, true])(
  "CE9B layout values survive save failure (conflict %s)",
  async (conflict) => {
    const user = userEvent.setup();
    const save = vi.fn<AdminClient["saveDraft"]>(async () => {
      throw new AdminClientError({
        code: conflict ? "CONTENT_REVISION_CONFLICT" : "UNAVAILABLE",
        message: "Rejected",
        status: conflict ? 409 : 503,
      });
    });
    open(save);
    await user.click(await screen.findByRole("tab", { name: "Details tab" }));
    await user.type(screen.getByRole("textbox", { name: "Note" }), " local");
    await user.click(screen.getByRole("tab", { name: "Intro tab" }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("tab", { name: "Details tab" }));
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Note local");
    expect(screen.getByLabelText("Slug")).toHaveValue("stable");
    if (conflict) {
      await user.click(screen.getByRole("button", { name: "Reload server draft" }));
      await waitFor(() =>
        expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Note"),
      );
    }
  },
);

test("CE9B viewers navigate layouts and disclosures without mutation controls", async () => {
  const user = userEvent.setup();
  open(undefined, "viewer");
  await user.click(await screen.findByRole("tab", { name: "Details tab" }));
  await user.click(screen.getByRole("tab", { name: "Address tab" }));
  expect(screen.getByRole("textbox", { name: "Address" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Create Absent" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Collapse Details" }));
  await user.click(screen.getByRole("button", { name: "Expand Details" }));
  expect(screen.getByRole("textbox", { name: "Address" })).toBeVisible();
});

test("CE9B unsaved navigation retains hidden values on Stay and discards on Leave", async () => {
  const user = userEvent.setup();
  const router = open();
  await user.click(await screen.findByRole("tab", { name: "Details tab" }));
  await user.type(screen.getByRole("textbox", { name: "Note" }), " local");
  await user.click(screen.getByRole("tab", { name: "Intro tab" }));
  const content = within(screen.getByRole("complementary", { name: "Admin navigation" })).getByRole(
    "link",
    { name: "Content" },
  );
  await user.click(content);
  await user.click(await screen.findByRole("button", { name: "Stay" }));
  await user.click(screen.getByRole("tab", { name: "Details tab" }));
  expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Note local");
  await user.click(content);
  await user.click(await screen.findByRole("button", { name: "Leave without saving" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/content"));
});

test("CE9B revert replaces fields in inactive panels with the published values", async () => {
  const user = userEvent.setup();
  const published = {
    ...initial.draft,
    id: "published",
    revision: 1,
    state: "published" as const,
    fields: { intro: "Published intro", details: { note: "Published note", url: "/published" } },
  };
  const revertEntry = vi.fn<AdminClient["revertEntry"]>(async () => ({
    ...initial,
    published,
    draft: { ...initial.draft, fields: published.fields, revision: 3 },
  }));
  open(undefined, "admin", { loadEntry: async () => ({ ...initial, published }), revertEntry });
  const menu = await screen.findByRole("button", { name: "Entry actions" });
  menu.focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("menuitem", { name: "Revert to published" }));
  await user.click(
    within(await screen.findByRole("dialog", { name: "Revert to published?" })).getByRole(
      "button",
      { name: "Revert to published" },
    ),
  );
  await waitFor(() => expect(revertEntry).toHaveBeenCalledWith("entry-1", 2));
  await user.click(screen.getByRole("tab", { name: "Details tab" }));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Published note"),
  );
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
}, 15000);

test("CE9B pending saves lock leaf mutations while tabs remain navigable", async () => {
  const user = userEvent.setup();
  let release!: (entry: typeof initial) => void;
  const pending = new Promise<typeof initial>((resolve) => {
    release = resolve;
  });
  const save = vi.fn<AdminClient["saveDraft"]>(async () => pending);
  open(save);
  await user.click(await screen.findByRole("tab", { name: "Details tab" }));
  await user.type(screen.getByRole("textbox", { name: "Note" }), " local");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  await user.click(screen.getByRole("tab", { name: "Address tab" }));
  expect(screen.getByRole("textbox", { name: "Address" })).toBeDisabled();
  await user.click(screen.getByRole("tab", { name: "Note tab" }));
  expect(screen.getByRole("textbox", { name: "Note" })).toBeDisabled();
  release(initial);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Note" })).toBeEnabled());
});
