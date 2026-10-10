import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { ContentModelDto, MediaMetadataDto } from "@lacecms/contracts";
import {
  addBlock,
  draftEntry,
  mediaItem,
  renderRoute,
  stubClient as client,
  staticSessionSource,
} from "../../../app/testing/index.js";
import { type AdminRole } from "../../../entities/session/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const fieldModel: ContentModelDto = {
  blocks: [],
  fields: { hero: { required: false, type: "media" } },
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
};

const blockModel: ContentModelDto = {
  blockDefinitions: [
    { fields: { image: { required: false, type: "media" } }, type: "hero", version: 1 },
  ],
  blocks: ["hero"],
  fields: {},
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
};

const later: MediaMetadataDto = { ...mediaItem, filename: "later.png", id: "media-2" };

function mount({
  hero,
  model = fieldModel,
  overrides = {},
  role = "editor",
}: {
  readonly hero?: string;
  readonly model?: ContentModelDto;
  readonly overrides?: Partial<AdminClient>;
  readonly role?: AdminRole;
} = {}) {
  const saveDraft = vi.fn(async () => ({}) as never);
  const router = renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: `${role}-1`, role }),
    client({
      getMedia: async (id) => {
        const found = [mediaItem, later].find((item) => item.id === id);
        if (found === undefined)
          throw new AdminClientError({ code: "NOT_FOUND", message: "Not found", status: 404 });
        return { ...found, usage: [] };
      },
      listModels: async () => ({ items: [model] }),
      loadEntry: async () => ({
        ...draftEntry,
        draft: { ...draftEntry.draft, fields: hero === undefined ? {} : { hero } },
      }),
      saveDraft,
      ...overrides,
    }),
  );
  return { router, saveDraft };
}

test("the picker dialog reuses a later page and choosing returns focus to Replace", async () => {
  const user = userEvent.setup();
  const listMedia = vi.fn(async (cursor?: string) =>
    cursor === undefined ? { items: [mediaItem], nextCursor: "next" } : { items: [later] },
  );
  const { saveDraft } = mount({ overrides: { listMedia } });
  await screen.findByRole("heading", { name: "Edit posts" });
  expect(screen.getByText("No media selected")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Choose media for Hero" }));
  const dialog = screen.getByRole("dialog", { name: "Choose media for Hero" });
  const choices = await within(dialog).findByRole("list", { name: "Media choices for Hero" });
  expect(within(choices).getByRole("button", { name: "cover.png" })).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Load more media" }));
  await user.click(await within(dialog).findByRole("button", { name: "later.png" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByText("later.png")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Replace media for Hero" })).toHaveFocus();
  expect(screen.queryByText("media-2")).not.toBeInTheDocument();
  expect(saveDraft).not.toHaveBeenCalled();
});

test("picker search and type filter stay local and reset when reopened", async () => {
  const user = userEvent.setup();
  const listMedia = vi.fn(async () => ({ items: [mediaItem] }));
  const { router } = mount({ overrides: { listMedia } });
  await screen.findByRole("heading", { name: "Edit posts" });
  const opener = screen.getByRole("button", { name: "Choose media for Hero" });
  await user.click(opener);
  const dialog = screen.getByRole("dialog", { name: "Choose media for Hero" });
  await user.type(within(dialog).getByRole("searchbox", { name: "Search media" }), "hero");
  await user.click(within(dialog).getByRole("button", { name: "PNG" }));
  await waitFor(() =>
    expect(listMedia).toHaveBeenLastCalledWith(undefined, { q: "hero", type: "image/png" }),
  );
  expect(within(dialog).queryByRole("group", { name: "Layout" })).not.toBeInTheDocument();
  expect(router.state.location.searchStr).toBe("");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(opener).toHaveFocus();
  expect(screen.getByText("No media selected")).toBeInTheDocument();
  await user.click(opener);
  const reopened = screen.getByRole("dialog", { name: "Choose media for Hero" });
  expect(within(reopened).getByRole("searchbox", { name: "Search media" })).toHaveValue("");
  expect(within(reopened).getByRole("button", { name: "All" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(listMedia).toHaveBeenLastCalledWith(undefined, {});
});

test("the current choice is marked and items pending deletion are not offered", async () => {
  const user = userEvent.setup();
  mount({
    hero: "media-1",
    overrides: {
      listMedia: async () => ({
        items: [mediaItem, { ...later, filename: "leaving.png", status: "deleting" }],
      }),
    },
  });
  await user.click(await screen.findByRole("button", { name: "Replace media for Hero" }));
  const dialog = screen.getByRole("dialog", { name: "Choose media for Hero" });
  expect(await within(dialog).findByRole("button", { name: "cover.png" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  expect(within(dialog).queryByRole("button", { name: "leaving.png" })).not.toBeInTheDocument();
});

test("a missing selection is kept until it is replaced or removed", async () => {
  const user = userEvent.setup();
  mount({ hero: "missing-1", overrides: { listMedia: async () => ({ items: [mediaItem] }) } });
  expect(await screen.findByText("Selected media no longer exists.")).toBeInTheDocument();
  expect(screen.queryByText(/missing-1/u)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Remove media from Hero" }));
  expect(screen.getByText("No media selected")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Choose media for Hero" })).toHaveFocus();
});

test("a viewer sees the selected media without choosing, replacing, or removing it", async () => {
  mount({ hero: mediaItem.id, role: "viewer" });
  expect(await screen.findByText("cover.png")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Replace media for Hero" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Remove media from Hero" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  document.body.replaceChildren();
  mount({ role: "viewer" });
  expect(await screen.findByText("No media selected")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Choose media for Hero" })).not.toBeInTheDocument();
});

test("a block picker uploads several files, reports each, and uses an upload explicitly", async () => {
  const user = userEvent.setup();
  const fresh: MediaMetadataDto = { ...mediaItem, filename: "fresh.png", id: "media-3" };
  const uploadMedia = vi.fn(async (file: File) => {
    if (file.name === "broken.png")
      throw new AdminClientError({ message: "The image data is invalid.", status: 422 });
    return fresh;
  });
  const { saveDraft } = mount({
    model: blockModel,
    overrides: {
      getMedia: async () => ({ ...fresh, usage: [] }),
      listMedia: async () => {
        throw new AdminClientError({ message: "Media list failed" });
      },
      uploadMedia,
    },
  });
  await screen.findByRole("heading", { name: "Edit posts" });
  await addBlock(user, "Hero");
  await user.click(screen.getByRole("button", { name: "Choose media for Image" }));
  const dialog = screen.getByRole("dialog", { name: "Choose media for Image" });
  expect(await within(dialog).findByText("Media list failed")).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText("Upload images"), {
    target: {
      files: [
        new File(["png"], "fresh.png", { type: "image/png" }),
        new File(["png"], "broken.png", { type: "image/png" }),
        new File(["pdf"], "notes.pdf", { type: "application/pdf" }),
      ],
    },
  });
  const queue = await within(dialog).findByRole("list", { name: "Upload queue" });
  const row = (name: string) =>
    within(queue)
      .getAllByRole("listitem")
      .find((item) => item.textContent?.includes(name));
  await waitFor(() => expect(row("fresh.png")).toHaveTextContent("Uploaded"));
  await waitFor(() => expect(row("broken.png")).toHaveTextContent("The image data is invalid."));
  expect(row("notes.pdf")).toHaveTextContent("not supported");
  expect(uploadMedia).toHaveBeenCalledTimes(2);
  expect(
    within(dialog).getByRole("button", { name: "Retry upload of broken.png" }),
  ).toBeInTheDocument();
  expect(screen.getByText("No media selected")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Use fresh.png" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByText("fresh.png")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Replace media for Image" })).toHaveFocus();
  expect(saveDraft).not.toHaveBeenCalled();
});
