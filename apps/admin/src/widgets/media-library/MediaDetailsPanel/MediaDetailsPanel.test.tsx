import type { MediaDetailDto, MediaMetadataDto } from "@lacecms/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  mediaItem,
  renderInRouter,
  sessionFor,
  stubClient,
  type SessionSeed,
} from "../../../app/testing/index.js";
import { can } from "../../../entities/session/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";
import { MediaDetailsPanel } from "./index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const usedItem: MediaMetadataDto = { ...mediaItem, height: 600, usageCount: 1, width: 800 };

const usage: MediaDetailDto["usage"] = [
  {
    entryId: "entry-9",
    locations: [
      {
        blockKey: "block-1",
        blockType: "hero",
        field: "image",
        source: "block",
        states: ["draft"],
      },
    ],
    modelKey: "home",
    status: "changed",
    title: "Launch",
  },
];

function mount({
  client = {},
  item = usedItem,
  onChanged = vi.fn(),
  returnFocus = vi.fn(),
  session = { id: "editor-1", role: "editor" },
}: {
  readonly client?: Partial<AdminClient>;
  readonly item?: MediaMetadataDto;
  readonly onChanged?: (item: MediaMetadataDto) => void;
  readonly returnFocus?: () => void;
  readonly session?: SessionSeed;
} = {}) {
  const onClose = vi.fn();
  renderInRouter(
    <MediaDetailsPanel
      canWrite={can(sessionFor(session), "media:write")}
      item={item}
      onChanged={onChanged}
      onClose={onClose}
      returnFocus={returnFocus}
    />,
    {
      client: stubClient({ getMedia: async () => ({ ...item, usage }), ...client }),
      session,
    },
  );
  return { onClose, returnFocus };
}

test("shows facts and usage with entry links, and withholds deletion of used media", async () => {
  mount();
  const panel = await screen.findByRole("dialog", { name: "cover.png" });
  await waitFor(() => expect(panel).toHaveFocus());
  expect(within(panel).getByRole("img", { name: "Preview of cover.png" })).toHaveAttribute(
    "src",
    "/api/v1/admin/media/media-1/preview",
  );
  expect(panel).toHaveTextContent("Dimensions800 × 600 px");
  expect(panel).toHaveTextContent("Size12 B");
  expect(panel).toHaveTextContent("Uploaded byeditor@lace.test");
  expect(panel).not.toHaveTextContent("editor-1");
  const link = await within(panel).findByRole("link", { name: "Launch" });
  expect(link).toHaveAttribute("href", "/content/home/entry-9");
  expect(panel).toHaveTextContent("Hero block · Image field · Draft");
  expect(panel).not.toHaveTextContent("block-1");
  expect(within(panel).getByRole("button", { name: "Delete media" })).toBeDisabled();
  expect(panel).toHaveTextContent("Remove it from every listed entry and publish those entries");
});

test("reports truncated usage and usage failures without claiming the item is unused", async () => {
  mount({
    client: {
      getMedia: async () => ({ ...usedItem, usage, usageCount: 60 }),
    },
  });
  expect(
    await screen.findByText("Used by 60 entries; only the 1 most recently edited are shown."),
  ).toBeInTheDocument();
});

test("a usage failure is shown as an error", async () => {
  mount({
    client: {
      getMedia: async () => {
        throw new AdminClientError({ message: "Usage failed" });
      },
    },
  });
  expect(await screen.findByText("Usage could not be loaded")).toBeInTheDocument();
  expect(screen.getByText("Usage failed")).toBeInTheDocument();
  expect(screen.queryByText("Not used by any entry.")).not.toBeInTheDocument();
});

test("copies the public URL and reports clipboard failures", async () => {
  const user = userEvent.setup();
  const writeText = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("denied"));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  mount();
  await user.click(await screen.findByRole("button", { name: "Copy URL" }));
  expect(writeText).toHaveBeenCalledWith("https://lace.test/api/v1/public/media/media-1");
  expect(await screen.findByText("URL copied.")).toHaveAttribute("role", "status");
  await user.click(screen.getByRole("button", { name: "Copy URL" }));
  expect(await screen.findByText(/could not be copied/)).toBeInTheDocument();
  expect(screen.getByText(/only once published content uses it/)).toBeInTheDocument();
});

test("unused active media can be deleted after confirmation", async () => {
  const user = userEvent.setup();
  const onChanged = vi.fn();
  const unused = { ...mediaItem, usageCount: 0 };
  const deleteMedia = vi.fn(async () => ({ ...unused, status: "deleting" as const }));
  mount({
    client: { deleteMedia, getMedia: async () => ({ ...unused, usage: [] }) },
    item: unused,
    onChanged,
  });
  expect(await screen.findByText("Not used by any entry.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Delete media" }));
  const confirm = await screen.findByRole("dialog", { name: "Delete cover.png?" });
  await user.click(within(confirm).getByRole("button", { name: "Delete media" }));
  await waitFor(() =>
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: "deleting" })),
  );
});

test("failed deletions retry and pending deletions offer no action", async () => {
  const user = userEvent.setup();
  const onChanged = vi.fn();
  const failed = { ...mediaItem, status: "delete_failed" as const };
  const retryMediaDeletion = vi.fn(async () => ({ ...failed, status: "deleting" as const }));
  mount({ client: { retryMediaDeletion }, item: failed, onChanged });
  await user.click(await screen.findByRole("button", { name: "Retry deletion" }));
  await waitFor(() => expect(retryMediaDeletion).toHaveBeenCalledWith("media-1"));
  expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: "deleting" }));
});

test("viewers see no deletion controls and Escape requests closing", async () => {
  const user = userEvent.setup();
  const { onClose } = mount({ session: { id: "viewer-1", role: "viewer" } });
  await screen.findByRole("dialog", { name: "cover.png" });
  expect(screen.queryByRole("button", { name: "Delete media" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Deletion" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});
