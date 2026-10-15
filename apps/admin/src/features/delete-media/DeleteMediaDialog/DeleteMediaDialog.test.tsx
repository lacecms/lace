import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { mediaItem, renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { DeleteMediaDialog } from "./index.js";

test("cancelling sends nothing and returns focus to the delete action", async () => {
  const user = userEvent.setup();
  const deleteMedia = vi.fn(async () => ({ ...mediaItem, status: "deleting" as const }));
  renderInRouter(<DeleteMediaDialog item={mediaItem} onChanged={vi.fn()} />, {
    client: stubClient({ deleteMedia }),
  });
  const trigger = await screen.findByRole("button", { name: "Delete media" });
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("dialog", { name: "Delete cover.png?" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  expect(deleteMedia).not.toHaveBeenCalled();
});

test("confirmation reports the accepted item and a refusal stays explained", async () => {
  const user = userEvent.setup();
  const onChanged = vi.fn();
  const deleteMedia = vi
    .fn()
    .mockRejectedValueOnce(
      new AdminClientError({ code: "MEDIA_IN_USE", message: "In use.", status: 409 }),
    )
    .mockResolvedValueOnce({ ...mediaItem, status: "deleting" });
  renderInRouter(<DeleteMediaDialog item={mediaItem} onChanged={onChanged} />, {
    client: stubClient({ deleteMedia }),
  });
  await user.click(await screen.findByRole("button", { name: "Delete media" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Delete media" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("content still uses this media");
  expect(onChanged).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Delete media" }));
  await waitFor(() =>
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: "deleting" })),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(deleteMedia).toHaveBeenCalledWith("media-1");
});

const drafts = [
  {
    entryId: "entry-1",
    locations: [{ field: "cover", source: "field" as const, states: ["draft" as const] }],
    modelKey: "posts",
    status: "draft" as const,
    title: "Hello",
  },
];

test("a detaching confirmation names the drafts, can be cancelled, and refreshes those entries", async () => {
  const user = userEvent.setup();
  const onChanged = vi.fn();
  const deleteMedia = vi.fn(async () => ({ ...mediaItem, status: "deleting" as const }));
  const { queryClient } = renderInRouter(
    <DeleteMediaDialog detachFrom={drafts} item={mediaItem} onChanged={onChanged} />,
    { client: stubClient({ deleteMedia }) },
  );
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const trigger = await screen.findByRole("button", { name: "Delete media" });
  await user.click(trigger);
  let dialog = await screen.findByRole("dialog", { name: "Delete cover.png?" });
  expect(
    within(dialog).getByRole("list", { name: "Drafts that lose this media" }),
  ).toHaveTextContent("Hello");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  expect(deleteMedia).not.toHaveBeenCalled();

  await user.click(trigger);
  dialog = await screen.findByRole("dialog", { name: "Delete cover.png?" });
  await user.click(within(dialog).getByRole("button", { name: "Remove from drafts and delete" }));
  await waitFor(() =>
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: "deleting" })),
  );
  expect(deleteMedia).toHaveBeenCalledWith("media-1", { detachDrafts: true });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "entry", "entry-1"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "entries", "posts"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "media"] });
});
