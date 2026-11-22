import { mediaId } from "@lacecms/domain";
import { expect, test, vi } from "vitest";
import type { MediaCreateOutcome, MediaUploadOwnership } from "../ports/media.js";
import { resolveMediaUploadFailure } from "./create-recovery.js";

const id = mediaId("upload-1");
const storageKey = "media/upload-1";

test.each<[MediaCreateOutcome, MediaUploadOwnership, string]>([
  ["unknown", "matching", "preserve"],
  ["unknown", "conflicting", "unresolved"],
  ["unknown-settled", "conflicting", "unresolved"],
  ["unknown-settled", "absent", "cleanup"],
  ["unknown", "absent", "unresolved"],
  ["rolled-back", "absent", "cleanup"],
  ["rolled-back", "matching", "unresolved"],
])("resolves %s writes with %s ownership as %s", async (outcome, ownership, resolution) => {
  const checkMediaUploadOwnership = vi.fn(async () => ownership);
  await expect(
    resolveMediaUploadFailure({ checkMediaUploadOwnership }, id, storageKey, outcome),
  ).resolves.toBe(resolution);
  expect(checkMediaUploadOwnership).toHaveBeenCalledExactlyOnceWith(id, storageKey);
});

test("preserves confirmed commits without reconciliation and treats failed checks as unresolved", async () => {
  const checkMediaUploadOwnership = vi.fn(async () => {
    throw new Error("database unavailable");
  });
  const repository = { checkMediaUploadOwnership };
  await expect(resolveMediaUploadFailure(repository, id, storageKey, "committed")).resolves.toBe(
    "preserve",
  );
  expect(checkMediaUploadOwnership).not.toHaveBeenCalled();
  await expect(
    resolveMediaUploadFailure(repository, id, storageKey, "unknown-settled"),
  ).resolves.toBe("unresolved");
  expect(checkMediaUploadOwnership).toHaveBeenCalledExactlyOnceWith(id, storageKey);
});
