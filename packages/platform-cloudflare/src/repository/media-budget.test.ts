import { expect, test } from "vitest";
import { actorId, mediaId, unixMilliseconds } from "@lacecms/domain";
import { countingD1, openLocalD1 } from "../test-support/d1-test-harness.js";
import { D1ContentRepository } from "./repository.js";

test("twenty-tag creation and replacement stay within D1 batch limits", async () => {
  const { database, dispose } = await openLocalD1();
  try {
    const counted = countingD1(database);
    const repository = new D1ContentRepository(counted.binding, () => undefined);
    const id = mediaId("budget-tags");
    const tags = Array.from({ length: 20 }, (_, index) => `tag-${index}`);
    await repository.createMedia({
      id,
      storageKey: "budget-tags",
      filename: "x.png",
      mimeType: "image/png",
      size: 1,
      width: 1,
      height: 1,
      createdBy: actorId("admin"),
      createdAt: unixMilliseconds(1),
      tags,
    });
    await repository.updateMediaMetadata({
      mediaId: id,
      expectedUpdatedAt: unixMilliseconds(1),
      updatedAt: unixMilliseconds(2),
      requestedBy: { id: actorId("admin"), role: "admin" },
      alt: null,
      caption: null,
      focalPoint: null,
      publishedEffect: false,
      tags: tags.map((tag) => `${tag}-new`),
    });
    expect(counted.stats.maxParameters).toBeLessThanOrEqual(100);
    expect(counted.stats.maxBatchStatements).toBeLessThanOrEqual(40);
    expect((await repository.loadMedia(id))!.tags).toHaveLength(20);
  } finally {
    await dispose();
  }
}, 60_000);
