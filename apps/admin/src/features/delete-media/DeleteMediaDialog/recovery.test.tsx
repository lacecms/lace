import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { mediaItem, renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";
import {
  checkpointKey,
  readCheckpoint,
  writeCheckpoint,
  type Checkpoint,
} from "../detach-checkpoint.js";
import { DeleteMediaDialog } from "./DeleteMediaDialog.js";

const owners = ["a", "b"].map((entryId) => ({ entryId, expectedRevision: 3 }));
const usage = owners.map(({ entryId }) => ({
  entryId,
  title: entryId,
  modelKey: "posts",
  status: "draft" as const,
  locations: [],
}));
const key = checkpointKey("editor-1", mediaItem.id);
const checkpoint = (next: number): Checkpoint => ({
  token: "saved",
  version: 1,
  next,
  drafts: owners.map((o) => ({ ...o, modelKey: "posts" })),
});
const receipt = { ...mediaItem, status: "deleting" as const, usageCount: 0 };
afterEach(() => localStorage.clear());

function mount(client: Partial<AdminClient>, actor = "editor-1") {
  const onChanged = vi.fn();
  const { queryClient } = renderInRouter(
    <DeleteMediaDialog item={mediaItem} detachFrom={usage} onChanged={onChanged} />,
    { client: stubClient(client), session: { id: actor, role: "editor" } },
  );
  return { onChanged, invalidate: vi.spyOn(queryClient, "invalidateQueries") };
}
async function submit(resume: boolean) {
  const user = userEvent.setup();
  const trigger = await screen.findByRole("button", {
    name: resume ? "Continue deletion" : "Delete media",
  });
  trigger.focus();
  await user.keyboard("{Enter}");
  const dialog = await screen.findByRole("dialog");
  within(dialog)
    .getByRole("button", { name: resume ? "Continue" : "Remove from drafts and delete" })
    .focus();
  await user.keyboard("{Enter}");
}

test("reopens under the confirming account and replays a lost entry response at the original revision", async () => {
  const revisions = new Map(owners.map((owner) => [owner.entryId, 3]));
  let lost = true;
  const detachMedia = vi.fn<AdminClient["detachMedia"]>(async (_id, step) => {
    if (step === undefined) return { state: "drafts", drafts: owners };
    if (step === "finish") return receipt;
    if (revisions.get(step.entryId) === 3) revisions.set(step.entryId, 4);
    if (step.entryId === "b" && lost) {
      lost = false;
      throw new Error("Connection lost.");
    }
    return { state: "entry-complete", entryId: step.entryId };
  });
  const getMedia = vi.fn(async () => ({ ...mediaItem, usage: [] }));
  const client = { detachMedia, getMedia };
  const first = mount(client);
  await submit(false);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Some drafts may already have changed.",
  );
  expect(readCheckpoint(key)?.next).toBe(1);
  expect(first.invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "entry", "b"] });
  cleanup();
  mount(client, "another");
  expect(await screen.findByRole("button", { name: "Delete media" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Continue deletion" })).toBeNull();
  cleanup();
  const last = mount(client);
  await submit(true);
  await waitFor(() => expect(last.onChanged).toHaveBeenCalledWith(receipt));
  expect(getMedia).toHaveBeenCalledWith(mediaItem.id);
  expect(detachMedia.mock.calls.map((c) => c[1])).toEqual([
    undefined,
    owners[0],
    owners[1],
    owners[1],
    "finish",
  ]);
  expect([...revisions.values()]).toEqual([4, 4]);
  expect(readCheckpoint(key)).toBeNull();
});

test.each(["active", "deleting", "delete_failed", "missing"] as const)(
  "reconciles a lost finish response from %s media",
  async (status) => {
    writeCheckpoint(key, checkpoint(2));
    const detachMedia = vi.fn().mockResolvedValue(receipt);
    const getMedia = vi.fn(async () => {
      if (status === "missing") throw new AdminClientError({ status: 404, message: "Not found." });
      return { ...mediaItem, status, usage: [] };
    });
    const { onChanged } = mount({ getMedia, detachMedia });
    await submit(true);
    if (status === "active") {
      await waitFor(() => expect(onChanged).toHaveBeenCalledWith(receipt));
      expect(detachMedia.mock.calls).toEqual([[mediaItem.id, "finish"]]);
    } else {
      expect(await screen.findByRole("alert")).toHaveTextContent(
        status === "deleting"
          ? "pending deletion"
          : status === "missing"
            ? "no longer in the library"
            : "previous deletion failed",
      );
      expect(onChanged).not.toHaveBeenCalled();
      expect(detachMedia).not.toHaveBeenCalled();
    }
    expect(readCheckpoint(key)).toBeNull();
  },
);

test.each([403, 409])(
  "interrupts on HTTP %i and refreshes the affected entries",
  async (status) => {
    writeCheckpoint(key, checkpoint(1));
    const detachMedia = vi.fn().mockRejectedValue(
      new AdminClientError({
        status,
        code: status === 409 ? "CONTENT_REVISION_CONFLICT" : "AUTHORIZATION_DENIED",
        message: status === 409 ? "Draft changed." : "Permission denied.",
      }),
    );
    const { invalidate } = mount({ getMedia: async () => ({ ...mediaItem, usage }), detachMedia });
    await submit(true);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some drafts may already have changed.",
    );
    expect(detachMedia.mock.calls).toEqual([[mediaItem.id, owners[1]]]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "entries", "posts"] });
    if (status === 403) {
      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Review current usage" })).toBeEnabled();
    } else {
      expect(readCheckpoint(key)).toBeNull();
      expect(screen.getByRole("button", { name: "Remove from drafts and delete" })).toBeEnabled();
    }
  },
);

test("closing during a save preserves its acknowledgment and pauses the next request", async () => {
  const pending = Promise.withResolvers<{ state: "entry-complete"; entryId: string }>();
  const detachMedia = vi
    .fn()
    .mockResolvedValueOnce({ state: "drafts", drafts: owners })
    .mockImplementationOnce(() => pending.promise);
  mount({ detachMedia });
  await submit(false);
  await waitFor(() => expect(detachMedia.mock.calls).toHaveLength(2));
  cleanup();
  pending.resolve({ state: "entry-complete", entryId: "a" });
  await waitFor(() => expect(readCheckpoint(key)?.next).toBe(1));
  expect(detachMedia.mock.calls).toHaveLength(2);
  mount({ detachMedia });
  await screen.findByRole("button", { name: "Continue deletion" });
});
