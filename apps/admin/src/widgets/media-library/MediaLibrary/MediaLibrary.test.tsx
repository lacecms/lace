import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  mediaItem,
  renderRoute,
  stubClient as client,
  staticSessionSource,
} from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const editor = () => staticSessionSource({ id: "editor-1", role: "editor" });

test("a filtered library URL restores its controls, view, and API query", async () => {
  const listMedia = vi.fn(async () => ({ items: [mediaItem] }));
  const router = renderRoute(
    "/media?q=hero&type=image%2Fpng&sort=filename&view=list",
    editor(),
    client({ listMedia }),
  );
  expect(await screen.findByRole("table", { name: "Media library" })).toBeInTheDocument();
  expect(listMedia).toHaveBeenCalledWith(undefined, {
    q: "hero",
    sort: "filename",
    type: "image/png",
  });
  expect(screen.getByRole("searchbox", { name: "Search media" })).toHaveValue("hero");
  expect(screen.getByRole("button", { name: "PNG" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("combobox", { name: "Sort media" })).toHaveTextContent("Name A–Z");
  expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
  expect(router.state.location.search).toEqual({
    q: "hero",
    sort: "filename",
    type: "image/png",
    view: "list",
  });
});

test("unsupported parameters are ignored and filter changes restart pagination", async () => {
  const user = userEvent.setup();
  const listMedia = vi.fn(async (cursor?: string) =>
    cursor === undefined
      ? { items: [mediaItem], nextCursor: "next" }
      : { items: [{ ...mediaItem, filename: "two.png", id: "media-2" }] },
  );
  const router = renderRoute(
    "/media?type=image%2Fgif&sort=author&view=cards",
    editor(),
    client({ listMedia }),
  );
  expect(await screen.findByRole("list", { name: "Media library" })).toBeInTheDocument();
  expect(listMedia).toHaveBeenCalledWith(undefined, {});
  await user.click(screen.getByRole("button", { name: "Load more media" }));
  await waitFor(() => expect(listMedia).toHaveBeenCalledWith("next", {}));
  await user.click(screen.getByRole("button", { name: "JPEG" }));
  await waitFor(() =>
    expect(listMedia).toHaveBeenLastCalledWith(undefined, { type: "image/jpeg" }),
  );
  expect(router.state.location.search).toEqual({ type: "image/jpeg" });
  await user.click(screen.getByRole("button", { name: "List view" }));
  await waitFor(() =>
    expect(router.state.location.search).toEqual({ type: "image/jpeg", view: "list" }),
  );
  expect(await screen.findByRole("table", { name: "Media library" })).toBeInTheDocument();
});

test("a search without results offers to clear the filters", async () => {
  const user = userEvent.setup();
  const listMedia = vi.fn(async (_cursor?: string, query?: { q?: string }) =>
    query?.q === undefined ? { items: [mediaItem] } : { items: [] },
  );
  const router = renderRoute("/media?q=zzz&type=image%2Fpng", editor(), client({ listMedia }));
  expect(await screen.findByRole("heading", { name: "No matching media" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "No media yet" })).not.toBeInTheDocument();
  const empty = screen.getByRole("heading", { name: "No matching media" }).closest("section");
  await user.click(within(empty as HTMLElement).getByRole("button", { name: "Clear filters" }));
  await waitFor(() => expect(router.state.location.search).toEqual({}));
  expect(await screen.findByRole("button", { name: "cover.png" })).toBeInTheDocument();
});

test("several chosen files report their own local, server, and success results", async () => {
  const uploadMedia = vi.fn(async (file: File) => {
    if (file.name === "rejected.jpg")
      throw new AdminClientError({
        code: "VALIDATION_FAILED",
        message: "The image data is invalid.",
        status: 422,
      });
    return { ...mediaItem, filename: file.name, id: `id-${file.name}` };
  });
  let listed = [mediaItem];
  const listMedia = vi.fn(async () => ({ items: listed }));
  renderRoute("/media", editor(), client({ listMedia, uploadMedia }));
  await screen.findByRole("list", { name: "Media library" });
  expect(screen.getByRole("button", { name: "Upload images" })).toBeInTheDocument();
  listed = [{ ...mediaItem, filename: "new.png", id: "id-new.png" }, mediaItem];
  fireEvent.change(screen.getByLabelText("Upload images"), {
    target: {
      files: [
        new File(["png"], "new.png", { type: "image/png" }),
        new File(["pdf"], "notes.pdf", { type: "application/pdf" }),
        new File(["jpg"], "rejected.jpg", { type: "image/jpeg" }),
      ],
    },
  });
  const queue = await screen.findByRole("list", { name: "Upload queue" });
  await waitFor(() =>
    expect(
      within(queue)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringMatching(/new\.png.*Uploaded$/u),
      expect.stringMatching(/notes\.pdf.*not supported/u),
      expect.stringMatching(/rejected\.jpg.*The image data is invalid\./u),
    ]),
  );
  expect(uploadMedia.mock.calls.map(([file]) => file.name)).toEqual(["new.png", "rejected.jpg"]);
  expect(screen.getByRole("button", { name: "Retry upload of rejected.jpg" })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Retry upload of notes.pdf" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("1 of 3 uploaded, 2 failed")).toBeInTheDocument();
  const grid = screen.getByRole("list", { name: "Media library" });
  expect(await within(grid).findByRole("button", { name: "new.png" })).toBeInTheDocument();
});

test("dropping files onto the library shows the target and uploads them", async () => {
  const uploadMedia = vi.fn(async () => mediaItem);
  renderRoute("/media", editor(), client({ uploadMedia }));
  const region = await screen.findByRole("region", { name: "Media" });
  const file = new File(["png"], "dropped.png", { type: "image/png" });
  const dataTransfer = {
    files: [file],
    items: [{ getAsFile: () => file, kind: "file", type: file.type }],
    types: ["Files"],
  };
  fireEvent.dragEnter(region, { dataTransfer });
  expect(await screen.findByText("Drop images to upload")).toBeInTheDocument();
  await act(async () => {
    fireEvent.drop(region, { dataTransfer });
  });
  await waitFor(() => expect(uploadMedia).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("Drop images to upload")).not.toBeInTheDocument();
});

test("deleting from the details panel shows pending deletion and Escape returns focus", async () => {
  const user = userEvent.setup();
  const unused = { ...mediaItem, usageCount: 0 };
  const deleteMedia = vi.fn(async () => ({ ...unused, status: "deleting" as const }));
  renderRoute(
    "/media",
    editor(),
    client({
      deleteMedia,
      getMedia: async () => ({ ...unused, usage: [] }),
      listMedia: async () => ({ items: [unused] }),
    }),
  );
  const tile = await screen.findByRole("button", { name: "cover.png" });
  tile.focus();
  await user.keyboard("{Enter}");
  const panel = await screen.findByRole("dialog", { name: "cover.png" });
  await within(panel).findByText("Not used by any entry.");
  await user.click(within(panel).getByRole("button", { name: "Delete media" }));
  const confirm = await screen.findByRole("dialog", { name: "Delete cover.png?" });
  await user.click(within(confirm).getByRole("button", { name: "Delete media" }));
  await waitFor(() => expect(deleteMedia).toHaveBeenCalledWith("media-1"));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Delete cover.png?" })).not.toBeInTheDocument(),
  );
  const reopened = screen.getByRole("dialog", { name: "cover.png" });
  expect(within(reopened).getByText("Deletion pending")).toBeInTheDocument();
  expect(within(reopened).queryByRole("button", { name: "Delete media" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const grid = screen.getByRole("list", { name: "Media library" });
  expect(within(grid).getByRole("button", { name: /cover\.png/ })).toHaveTextContent(
    "Deletion pending",
  );
  expect(within(grid).getByRole("button", { name: /cover\.png/ })).toHaveFocus();
});

test("a refused deletion keeps the item and explains the refusal", async () => {
  const user = userEvent.setup();
  const unused = { ...mediaItem, usageCount: 0 };
  const deleteMedia = vi.fn(async () => {
    throw new AdminClientError({ code: "MEDIA_IN_USE", message: "In use.", status: 409 });
  });
  renderRoute(
    "/media",
    editor(),
    client({
      deleteMedia,
      getMedia: async () => ({ ...unused, usage: [] }),
      listMedia: async () => ({ items: [unused] }),
    }),
  );
  await user.click(await screen.findByRole("button", { name: "cover.png" }));
  const panel = await screen.findByRole("dialog", { name: "cover.png" });
  await user.click(await within(panel).findByRole("button", { name: "Delete media" }));
  const confirm = await screen.findByRole("dialog", { name: "Delete cover.png?" });
  await user.click(within(confirm).getByRole("button", { name: "Delete media" }));
  expect(await within(confirm).findByRole("alert")).toHaveTextContent(
    "content still uses this media",
  );
  expect(within(panel).getByText("Active")).toBeInTheDocument();
});
