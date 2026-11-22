import { field, NODE_LIST_QUERY_LIMITS } from "@lacecms/content";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  draftEntry,
  renderRoute,
  staticSessionSource,
  stubClient,
} from "../../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";

const model = {
  key: "posts",
  kind: "collection" as const,
  label: "Posts",
  version: 1,
  blocks: [],
  fields: {
    reviews: field.list({ label: "Reviews", item: field.reference({ models: ["posts"] }) }),
  },
};
const entry = {
  ...draftEntry,
  model: { key: "posts", kind: "collection" as const },
  draft: { ...draftEntry.draft, fields: { reviews: ["gone", "first"] } },
};
const first = {
  id: "first",
  title: "First review",
  modelKey: "posts",
  modelKind: "collection",
  state: "published",
} as const;
const current = { ...first, id: entry.id, title: "Current review", state: "unpublished" } as const;
const admin = staticSessionSource({ id: "admin-1", role: "admin" });

async function moveSecondReview(user: ReturnType<typeof userEvent.setup>) {
  screen.getByRole("button", { name: "Actions for Reviews item 2" }).focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("menuitem", { name: "Move up Reviews item 2" }));
}

test("unrelated edits and reordering keep a missing ID until its exact occurrence is replaced", async () => {
  const user = userEvent.setup();
  const replacement = { ...first, id: "replacement", title: "Replacement review" };
  const saveDraft = vi.fn<AdminClient["saveDraft"]>(async (_id, input) => ({
    ...entry,
    draft: {
      ...entry.draft,
      fields: input.fields as typeof entry.draft.fields,
      title: input.title,
      revision: input.expectedRevision + 1,
    },
  }));
  renderRoute(
    "/content/posts/entry-1",
    admin,
    stubClient({
      loadEntry: async () => entry,
      listModels: async () => ({ items: [model], listQueryLimits: NODE_LIST_QUERY_LIMITS }),
      listReferenceTargets: async () => ({ items: [replacement] }),
      resolveReferenceTargets: async () => ({
        first,
        gone: { id: "gone", state: "missing" },
        replacement,
      }),
      saveDraft,
    }),
  );
  await screen.findByText("Missing entry (gone)");
  await user.type(screen.getByRole("textbox", { name: "Title" }), " revised");
  await moveSecondReview(user);
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  expect(saveDraft.mock.calls[0]?.[1].fields.reviews).toEqual(["first", "gone"]);
  expect(saveDraft.mock.calls[0]?.[1].title).toMatch(/ revised$/);
  await waitFor(() => expect(screen.getByRole("button", { name: "Reviews item 2" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Reviews item 2" }));
  await user.click(await screen.findByRole("button", { name: /^Replacement review/ }));
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(2));
  expect(saveDraft.mock.calls[1]?.[1].fields.reviews).toEqual(["first", "replacement"]);
  expect(screen.queryByText("Missing entry (gone)")).toBeNull();
});

test("a blocked reversal focuses the initiating selection and links to the verified prerequisite", async () => {
  const user = userEvent.setup();
  const publishEntry = vi.fn<AdminClient["publishEntry"]>(async () => {
    throw new AdminClientError({
      code: "VALIDATION_FAILED",
      message: "Validation failed.",
      status: 422,
      issues: [
        {
          code: "reference_cycle",
          path: "/fields/reviews/0",
          message: "would create a cycle between entries.",
          details: {
            witness: [entry.id, first.id, entry.id],
            truncated: false,
            publishFirst: { entryId: first.id, title: first.title },
          },
        },
      ],
    });
  });
  renderRoute(
    "/content/posts/entry-1",
    admin,
    stubClient({
      loadEntry: async () => ({
        ...entry,
        draft: { ...entry.draft, fields: { reviews: [first.id] } },
      }),
      listModels: async () => ({ items: [model], listQueryLimits: NODE_LIST_QUERY_LIMITS }),
      resolveReferenceTargets: async () => ({ first, [entry.id]: current }),
      publishEntry,
    }),
  );
  await user.click(await screen.findByRole("button", { name: "Publish" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm publication" }),
  );
  const issue = await screen.findByRole("link", { name: "Item 1 in Reviews" });
  await user.click(issue);
  const control = screen.getByRole("button", { name: "Reviews item 1" });
  expect(control).toHaveFocus();
  expect(control).toHaveAccessibleDescription(/Would create a cycle between entries/);
  expect(control).toHaveTextContent(first.title);
  const prerequisite = await screen.findByRole("link", { name: first.title });
  expect(prerequisite).toHaveAttribute("href", "/admin/content/posts/first");
  expect(screen.getByText(/Further corrections may be needed/)).toBeVisible();
  expect(screen.getByText(/Current review → First review → Current review/)).toBeVisible();
  expect(publishEntry).toHaveBeenCalledTimes(1);
});

const fieldLocation = {
  sourceKey: "$fields",
  area: "fields" as const,
  pointer: "/panel/reviews/1",
  delivered: false,
};
const referringModel = {
  ...model,
  fields: {
    showPanel: field.boolean({ label: "Show panel" }),
    panel: field.group({ label: "Review panel", fields: { reviews: model.fields.reviews } }),
  },
  layout: {
    mode: "tabs" as const,
    groups: [
      { key: "general", label: "General", fields: ["showPanel"] },
      { key: "references", label: "References", fields: ["panel"] },
    ],
  },
  visibility: { panel: { field: "showPanel", values: [true] } },
};
const referenceSource = {
  entryId: "source",
  modelKey: "posts",
  title: "Referring entry",
  snapshotId: "source-draft",
  phase: "draft" as const,
  locations: [fieldLocation],
};
const sourceEntry = {
  ...entry,
  id: referenceSource.entryId,
  draft: {
    ...entry.draft,
    entryId: referenceSource.entryId,
    id: referenceSource.snapshotId,
    title: referenceSource.title,
    fields: { showPanel: false, panel: { reviews: [first.id, entry.id] } },
  },
};
const target = { ...entry, draft: { ...entry.draft, fields: { showPanel: false } } };

test("a direct use opens the exact hidden list item after the unsaved-change prompt", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn();
  const resolveReferenceTargets = vi.fn(async () => ({ [entry.id]: current, first }));
  const router = renderRoute(
    "/content/posts/entry-1",
    admin,
    stubClient({
      listModels: async () => ({
        items: [referringModel],
        listQueryLimits: NODE_LIST_QUERY_LIMITS,
      }),
      loadEntry: async (id) => (id === "source" ? sourceEntry : target),
      referenceImpact: async () => ({
        mode: "sources",
        hasDraftUsages: true,
        hasPublishedBlockers: false,
        sources: [referenceSource],
      }),
      resolveReferenceTargets,
      saveDraft,
    }),
  );
  await user.type(await screen.findByRole("textbox", { name: "Title" }), " unsaved");

  async function followUse() {
    await user.click(screen.getByRole("button", { name: "Where used" }));
    await user.click(await screen.findByRole("link", { name: "Field /panel/reviews/1" }));
    return screen.findByRole("alertdialog", { name: "Discard unsaved changes?" });
  }
  await user.click(within(await followUse()).getByRole("button", { name: "Stay" }));
  expect(router.state.location.pathname).toBe("/content/posts/entry-1");
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
    `${entry.draft.title} unsaved`,
  );
  await user.click(within(await followUse()).getByRole("button", { name: "Leave without saving" }));
  const exact = await screen.findByRole("button", { name: "Reviews item 2" });
  await waitFor(() => expect(exact).toHaveFocus());
  expect(exact).toHaveTextContent("Current review");
  expect(screen.getByRole("tab", { name: "References" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText(/reference is hidden in the current draft/)).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "General" }));
  expect(screen.getByRole("switch", { name: "Show panel" })).not.toBeChecked();
  expect(saveDraft).not.toHaveBeenCalled();
});

test.each([false, true])(
  "an old use with pending publication %s never focuses an unrelated list position",
  async (pendingPublication) => {
    const user = userEvent.setup();
    const published = {
      ...sourceEntry.draft,
      id: "source-published",
      state: "published" as const,
      fields: { showPanel: true, panel: { reviews: [first.id, entry.id] } },
    };
    const updatedSource = {
      ...sourceEntry,
      published,
      draft: {
        ...sourceEntry.draft,
        fields: {
          showPanel: true,
          panel: { reviews: pendingPublication ? [first.id, first.id] : [entry.id, first.id] },
        },
      },
    };
    renderRoute(
      "/content/posts/entry-1",
      admin,
      stubClient({
        listModels: async () => ({
          items: [referringModel],
          listQueryLimits: NODE_LIST_QUERY_LIMITS,
        }),
        loadEntry: async (id) => (id === "source" ? updatedSource : target),
        publishEntry: async () => ({
          build: { status: "queued", targetVersion: 1 },
          publication: "published",
          entry: {
            ...updatedSource,
            published: { ...updatedSource.draft, id: "new-publication", state: "published" },
          },
        }),
        referenceImpact: async () => ({
          mode: "sources",
          hasDraftUsages: !pendingPublication,
          hasPublishedBlockers: true,
          sources: [
            {
              ...referenceSource,
              phase: "published",
              snapshotId: published.id,
              locations: [{ ...fieldLocation, delivered: true }],
            },
          ],
        }),
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Where used" }));
    await user.click(await screen.findByRole("link", { name: "Field /panel/reviews/1" }));
    await screen.findByText(
      pendingPublication ? /blocker stays in place/ : /This location has changed/,
    );
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: "Reviews item 2" })).toBeNull();
    if (pendingPublication) {
      await user.click(screen.getByRole("button", { name: "Review publication" }));
      await user.click(screen.getByRole("button", { name: "Confirm publication" }));
      await waitFor(() => expect(screen.queryByText(/blocker stays in place/)).toBeNull());
    }
  },
);
