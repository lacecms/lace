import { expect, test, vi } from "vitest";
import { mediaItem } from "../../app/testing/index.js";
import { type AdminClient } from "../../shared/api/index.js";
import {
  checkpointKey,
  readCheckpoint,
  writeCheckpoint,
  type Checkpoint,
} from "./detach-checkpoint.js";
import { runDetach } from "./detach-sequence.js";

test("two tabs replay one confirmed revision and only the finishing tab receives a receipt", async () => {
  const key = checkpointKey("same-editor", mediaItem.id);
  const owner = { entryId: "entry", expectedRevision: 7, modelKey: "posts" };
  const saved: Checkpoint = { version: 1, token: "shared", drafts: [owner], next: 0 };
  writeCheckpoint(key, saved);
  const second = Promise.withResolvers<void>();
  const bothStarted = Promise.withResolvers<void>();
  let calls = 0,
    revision = 7,
    finishes = 0;
  const detachMedia = vi.fn<AdminClient["detachMedia"]>(async (_id, step) => {
    if (step === "finish") {
      finishes++;
      return { ...mediaItem, status: "deleting", usageCount: 0 };
    }
    expect(step).toEqual({ entryId: owner.entryId, expectedRevision: 7 });
    if (revision === 7) revision++;
    if (++calls === 2) {
      bothStarted.resolve();
      await second.promise;
    } else await bothStarted.promise;
    return { state: "entry-complete", entryId: owner.entryId };
  });
  const tab = () =>
    runDetach({
      key,
      id: mediaItem.id,
      resume: readCheckpoint(key),
      confirmed: [],
      active: () => true,
      progress: () => {},
      attempt: () => {},
      client: { getMedia: async () => ({ ...mediaItem, usage: [] }), detachMedia },
    });
  const first = tab(),
    later = tab();
  expect(await first).toMatchObject({ status: "deleting" });
  second.resolve();
  await expect(later).rejects.toThrow("another tab");
  expect(readCheckpoint(key)).toBeNull();
  expect(revision).toBe(8);
  expect(finishes).toBe(1);
});

test("an unusable checkpoint requires fresh confirmation", () => {
  const key = checkpointKey("actor", "media");
  for (const raw of [
    "garbled",
    JSON.stringify({ version: 2, drafts: [], next: 0 }),
    JSON.stringify({
      version: 1,
      token: "bad",
      drafts: [{ entryId: "a", expectedRevision: 1, modelKey: "notes" }],
      next: 2,
    }),
  ]) {
    localStorage.setItem(key, raw);
    expect(readCheckpoint(key)).toBeNull();
  }
  localStorage.removeItem(key);
});
