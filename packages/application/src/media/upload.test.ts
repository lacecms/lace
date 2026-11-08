import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import {
  mediaEditor,
  mediaViewer,
  pngBytes,
  mediaRecord,
  catalogItem,
  mediaUseCases,
  bytes,
} from "../test-support/media-fixtures.js";
import type { ListMediaInput, CreateMediaMetadataInput } from "../ports/media.js";

test("uploads record the stored bytes' SHA-256 and lists filter by a valid hash", async () => {
  const created: CreateMediaMetadataInput[] = [];
  const reads: ListMediaInput[] = [];
  const expected = createHash("sha256").update(pngBytes).digest("hex");
  const media = mediaUseCases({
    async createMedia(input) {
      created.push(input);
      return mediaRecord({
        id: input.id,
        ...(input.sha256 === undefined ? {} : { sha256: input.sha256 }),
      });
    },
    async loadMediaCatalogItem() {
      return catalogItem({ sha256: expected });
    },
    async listMedia(input) {
      reads.push(input);
      return { items: [catalogItem({ sha256: expected })] };
    },
  });
  await expect(
    media.create({ actor: mediaEditor, body: bytes(pngBytes), filename: "cover.png" }),
  ).resolves.toMatchObject({ sha256: expected });
  expect(created[0]!.sha256).toBe(expected);

  await expect(
    media.list({ actor: mediaViewer, limit: 5, sha256: expected }),
  ).resolves.toMatchObject({ items: [{ sha256: expected }] });
  expect(reads).toEqual([{ limit: 5, sha256: expected, sort: "-createdAt", tags: [] }]);
  for (const sha256 of [expected.toUpperCase(), expected.slice(1), "z".repeat(64)])
    await expect(media.list({ actor: mediaViewer, limit: 5, sha256 })).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
  expect(reads).toHaveLength(1);

  // A rejected upload stores no metadata and therefore no hash.
  await expect(
    media.create({ actor: mediaEditor, body: bytes(new Uint8Array([1, 2, 3])), filename: "x" }),
  ).rejects.toThrow();
  expect(created).toHaveLength(1);
});
