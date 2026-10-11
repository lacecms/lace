import type { MediaMetadataDto } from "@lacecms/contracts";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { mediaItem, renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";
import { MediaMetadataForm } from "./index.js";

const described: MediaMetadataDto = {
  ...mediaItem,
  alt: "Red bicycle",
  caption: "A bike",
  focalPoint: { x: 0.25, y: 0.75 },
  updatedAt: "2026-09-20T00:00:00.100Z",
};

function Harness({
  initial,
  newer,
  onDirtyChange,
  onSaved,
}: {
  readonly initial: MediaMetadataDto;
  readonly newer?: MediaMetadataDto | undefined;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onSaved: (item: MediaMetadataDto) => void;
}) {
  const [latest, setLatest] = useState(initial);
  return (
    <>
      <MediaMetadataForm
        latest={latest}
        onDirtyChange={onDirtyChange}
        onReload={() => {
          if (newer !== undefined) setLatest(newer);
        }}
        onSaved={onSaved}
      />
      <button onClick={() => newer !== undefined && setLatest(newer)} type="button">
        Refresh in background
      </button>
    </>
  );
}

function mount(
  client: Partial<AdminClient>,
  { initial = described, newer }: { initial?: MediaMetadataDto; newer?: MediaMetadataDto } = {},
) {
  const onDirtyChange = vi.fn();
  const onSaved = vi.fn();
  renderInRouter(
    <Harness initial={initial} newer={newer} onDirtyChange={onDirtyChange} onSaved={onSaved} />,
    { client: stubClient(client) },
  );
  return { onDirtyChange, onSaved, user: userEvent.setup() };
}

test("a writer describes an image and saves only the changed values", async () => {
  const saved = {
    ...mediaItem,
    alt: "Red bicycle",
    caption: "On a hill",
    updatedAt: "2026-09-20T00:00:01.000Z",
  };
  const updateMediaMetadata = vi.fn(async () => ({
    build: { status: "not-dispatched" as const },
    media: saved,
  }));
  const { onDirtyChange, onSaved, user } = mount({ updateMediaMetadata }, { initial: mediaItem });
  expect(await screen.findByText(/has no alt text/)).toBeInTheDocument();
  const save = screen.getByRole("button", { name: "Save" });
  expect(save).toBeDisabled();
  await user.type(screen.getByLabelText("Alt text"), "Red bicycle");
  await user.type(screen.getByLabelText("Caption"), "On a hill");
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  await user.click(save);
  await waitFor(() =>
    expect(updateMediaMetadata).toHaveBeenCalledWith(
      mediaItem.id,
      { alt: "Red bicycle", caption: "On a hill" },
      mediaItem.updatedAt,
    ),
  );
  expect(await screen.findByText("Metadata saved.")).toBeInTheDocument();
  expect(onSaved).toHaveBeenCalledWith(saved);
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.queryByText(/has no alt text/)).not.toBeInTheDocument();
});

test("saving media used by published content announces the requested build", async () => {
  const updateMediaMetadata = vi.fn(async () => ({
    build: { status: "queued" as const, targetVersion: 8 },
    media: { ...described, caption: "A red bike", updatedAt: "2026-09-20T00:00:02.000Z" },
  }));
  const { user } = mount({ updateMediaMetadata });
  const caption = await screen.findByLabelText("Caption");
  await user.clear(caption);
  await user.type(caption, "A red bike");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(
    await screen.findByText(
      "Metadata saved. A site build was requested so published pages use it.",
    ),
  ).toBeInTheDocument();
  expect(updateMediaMetadata).toHaveBeenCalledWith(
    described.id,
    { caption: "A red bike" },
    described.updatedAt,
  );
});

test("clearing the alt text sends a clear and the missing-alt warning appears", async () => {
  const { alt: _alt, ...withoutAlt } = described;
  const updateMediaMetadata = vi.fn(async () => ({
    build: { status: "not-dispatched" as const },
    media: { ...withoutAlt, updatedAt: "2026-09-20T00:00:03.000Z" },
  }));
  const { user } = mount({ updateMediaMetadata });
  await user.clear(await screen.findByLabelText("Alt text"));
  expect(screen.queryByText(/has no alt text/)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(updateMediaMetadata).toHaveBeenCalledWith(
      described.id,
      { alt: null },
      described.updatedAt,
    ),
  );
  expect(await screen.findByText(/has no alt text/)).toBeInTheDocument();
});

test("focal point changes are saved with the metadata and Discard restores the item", async () => {
  const updateMediaMetadata = vi.fn(async () => ({
    build: { status: "not-dispatched" as const },
    media: described,
  }));
  const { user } = mount({ updateMediaMetadata });
  await user.click(await screen.findByRole("button", { name: "Reset focal point" }));
  await user.click(screen.getByRole("button", { name: "Discard" }));
  expect(screen.getByRole("slider", { name: "Focal point" })).toHaveAttribute(
    "aria-valuetext",
    "25% from left, 75% from top",
  );
  await user.click(screen.getByRole("button", { name: "Reset focal point" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(updateMediaMetadata).toHaveBeenCalledWith(
      described.id,
      { focalPoint: null },
      described.updatedAt,
    ),
  );
});

test("a failed save keeps the typed values and shows input issues", async () => {
  const updateMediaMetadata = vi.fn(async () => {
    throw new AdminClientError({
      code: "VALIDATION_FAILED",
      issues: [{ code: "invalid", message: "Alt text must be plain text.", path: "/alt" }],
      message: "Invalid.",
      status: 422,
    });
  });
  const { user } = mount({ updateMediaMetadata });
  const alt = await screen.findByLabelText("Alt text");
  await user.clear(alt);
  await user.type(alt, "Bad");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Alt text must be plain text.")).toBeInTheDocument();
  expect(alt).toHaveValue("Bad");
  expect(alt).toHaveAttribute("aria-invalid", "true");
});

test("a network failure is reported without losing the values", async () => {
  const { user } = mount({
    updateMediaMetadata: async () => {
      throw new AdminClientError({ message: "The Lace API could not be reached." });
    },
  });
  const caption = await screen.findByLabelText("Caption");
  await user.type(caption, "!");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The metadata was not saved. The Lace API could not be reached.",
  );
  expect(caption).toHaveValue("A bike!");
});

const newer: MediaMetadataDto = {
  ...described,
  alt: "Blue bicycle",
  updatedAt: "2026-09-20T00:00:05.000Z",
};
const conflict = () =>
  new AdminClientError({ code: "MEDIA_UPDATE_CONFLICT", message: "Changed.", status: 409 });

test("a conflict shows the newer values and writes nothing until the writer chooses", async () => {
  const updateMediaMetadata = vi
    .fn<AdminClient["updateMediaMetadata"]>()
    .mockRejectedValueOnce(conflict())
    .mockResolvedValueOnce({
      build: { status: "not-dispatched" },
      media: { ...newer, caption: "Mine", updatedAt: "2026-09-20T00:00:06.000Z" },
    });
  const { user } = mount({ updateMediaMetadata }, { newer });
  const caption = await screen.findByLabelText("Caption");
  await user.clear(caption);
  await user.type(caption, "Mine");
  await user.click(screen.getByRole("button", { name: "Save" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Someone else changed this media");
  expect(alert).toHaveTextContent("Blue bicycle");
  expect(caption).toHaveValue("Mine");
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(updateMediaMetadata).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("button", { name: "Save mine anyway" }));
  await waitFor(() => expect(updateMediaMetadata).toHaveBeenCalledTimes(2));
  expect(updateMediaMetadata).toHaveBeenLastCalledWith(
    described.id,
    { caption: "Mine" },
    newer.updatedAt,
  );
  expect(await screen.findByText("Metadata saved.")).toBeInTheDocument();
  expect(screen.getByLabelText("Alt text")).toHaveValue("Blue bicycle");
});

test("discarding after a conflict adopts the newer version", async () => {
  const updateMediaMetadata = vi.fn(async () => {
    throw conflict();
  });
  const { user } = mount({ updateMediaMetadata }, { newer });
  await user.type(await screen.findByLabelText("Caption"), " mine");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await user.click(await screen.findByRole("button", { name: "Discard my changes" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Alt text")).toHaveValue("Blue bicycle");
  expect(screen.getByLabelText("Caption")).toHaveValue("A bike");
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(updateMediaMetadata).toHaveBeenCalledTimes(1);
});

test("background refreshes replace a clean form but never typed values", async () => {
  const { user } = mount({}, { newer });
  const alt = await screen.findByLabelText("Alt text");
  await user.type(alt, "!");
  await user.click(screen.getByRole("button", { name: "Refresh in background" }));
  expect(alt).toHaveValue("Red bicycle!");
  await user.click(screen.getByRole("button", { name: "Discard" }));
  await user.click(screen.getByRole("button", { name: "Refresh in background" }));
  await waitFor(() => expect(alt).toHaveValue("Blue bicycle"));
});
