import { readAllBuildContentPages } from "../../delivery/build-export.js";

import { mediaId, unixMilliseconds } from "@lacecms/domain";

import {
  type RepositoryContractCase,
  editor,
  resolveRoute,
  noModels,
  sequence,
  seedMedia,
  registerContract,
} from "../shared.js";
import { seedPublishedLifecycle } from "../entries/fixtures.js";

import { metadataUpdate, mediaMetadataState, pendingBuilds } from "../media/fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract(
  "stores, filters, counts and deletes media tags atomically without public build effects",
  async (runtime, expect) => {
    const harness = await runtime.open({
      resolveModel: resolveRoute,
      nextId: sequence("tag-work"),
    });
    const { repository, sql } = harness;
    await seedPublishedLifecycle(repository, sql);
    const version = await repository.publishedContentVersion();
    const builds = await pendingBuilds(sql);
    const patch = (id: string, expected: number, time: number, tags: readonly string[]) => ({
      ...metadataUpdate(id, expected, time),
      tags,
      publishedEffect: false,
    });
    await repository.updateMediaMetadata(patch("media-1", 1, 10, [" Birch ", "IBIZA", "birch"]));
    expect((await repository.loadMediaCatalogItem("media-1"))!.media.tags).toEqual([
      "birch",
      "ibiza",
    ]);
    expect(await repository.publishedContentVersion()).toBe(version);
    expect(await pendingBuilds(sql)).toEqual(builds);
    await repository.createMedia({
      id: mediaId("tag-new"),
      storageKey: "tag-new",
      filename: "tag-cover.png",
      mimeType: "image/png",
      size: 2,
      width: 1,
      height: 1,
      createdAt: unixMilliseconds(2),
      createdBy: editor.id,
      tags: ["ibiza", "birch", "red"],
    });
    const created = await repository.loadMedia("tag-new");
    expect(created!.tags).toEqual(["birch", "ibiza", "red"]);
    for (const sort of [
      "createdAt",
      "-createdAt",
      "filename",
      "-filename",
      "size",
      "-size",
    ] as const) {
      const first = await repository.listMedia({ limit: 1, sort, tags: ["Ibiza", "BIRCH"] });
      expect(first.items).toHaveLength(1);
      expect(first.items[0]!.media.tags).toContain("birch");
      const next = await repository.listMedia({
        limit: 1,
        sort,
        tags: ["birch", "ibiza"],
        after: first.nextCursor!,
      });
      expect(next.items).toHaveLength(1);
      expect(next.items[0]!.media.id).not.toBe(first.items[0]!.media.id);
      await expect(
        repository.listMedia({ limit: 1, sort, tags: ["birch"], after: first.nextCursor! }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }
    expect(
      (
        await repository.listMedia({
          limit: 10,
          sort: "filename",
          tags: ["birch", "ibiza"],
          q: "tag-cover",
          type: "image/png",
        })
      ).items.map((i) => i.media.id),
    ).toEqual(["tag-new"]);
    expect(
      (await repository.listMedia({ limit: 10, sort: "filename", tags: ["unknown"] })).items,
    ).toEqual([]);
    const catalog = await repository.listMediaTags({ limit: 1 });
    expect(catalog.items).toEqual([{ tag: "birch", count: 2 }]);
    expect(
      (await repository.listMediaTags({ limit: 10, after: catalog.nextCursor! })).items,
    ).toEqual([
      { tag: "ibiza", count: 2 },
      { tag: "red", count: 1 },
    ]);
    expect((await repository.listMediaTags({ limit: 10, q: "RE" })).items).toEqual([
      { tag: "red", count: 1 },
    ]);
    await expect(
      repository.listMediaTags({ limit: 10, q: "re", after: catalog.nextCursor! }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    const state = await mediaMetadataState(sql);
    await expect(
      repository.updateMediaMetadata(patch("media-1", 1, 11, ["stale"])),
    ).rejects.toMatchObject({ code: "MEDIA_UPDATE_CONFLICT" });
    expect(await mediaMetadataState(sql)).toEqual(state);
    const concurrent = await Promise.allSettled([
      repository.updateMediaMetadata(patch("media-1", 10, 11, ["first"])),
      harness.reopen().updateMediaMetadata(patch("media-1", 10, 12, ["second"])),
    ]);
    expect(concurrent.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loser = concurrent.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(loser.reason).toMatchObject({ code: "MEDIA_UPDATE_CONFLICT" });
    const publicEntry = await repository.loadPublic("/blog/post");
    // Public projections do not select stored organization tags.
    if (publicEntry !== null)
      expect(publicEntry.media.every((m) => m.tags.length === 0)).toBe(true);
    const exported = await readAllBuildContentPages(repository);
    for (const item of exported.entries)
      expect(item.media.every((m) => m.tags.length === 0)).toBe(true);
    const current = (await repository.loadMedia("media-1"))!;
    await repository.updateMediaMetadata(patch("media-1", current.updatedAt, 13, []));
    expect((await repository.loadMedia("media-1"))!.tags).toEqual([]);
    await repository.markForDeletion({
      mediaId: mediaId("tag-new"),
      requestedAt: unixMilliseconds(20),
      requestedBy: editor,
    });
    expect((await repository.listMediaTags({ limit: 10, q: "red" })).items).toEqual([
      { tag: "red", count: 1 },
    ]);
    const leases = await repository.claim({
      eventTypes: ["media.delete.requested"],
      limit: 10,
      now: unixMilliseconds(21),
    });
    await repository.completeMediaDeletion({
      mediaId: mediaId("tag-new"),
      leaseId: leases[0]!.id,
      completedAt: unixMilliseconds(22),
    });
    expect((await repository.listMediaTags({ limit: 10 })).items).toEqual([]);
  },
);

contract(
  "rolls back tag replacement after an injected tag checkpoint failure",
  async (runtime, expect) => {
    let fail = false;
    const { repository, sql } = await runtime.open({
      resolveModel: resolveRoute,
      beforeMutation(name) {
        if (fail && name === "media.tags") throw new Error("injected tag failure");
      },
    });
    await seedPublishedLifecycle(repository, sql);
    await repository.updateMediaMetadata({
      ...metadataUpdate("media-1", 1, 10),
      tags: ["before"],
      publishedEffect: false,
    });
    const before = await mediaMetadataState(sql);
    fail = true;
    await expect(
      repository.updateMediaMetadata({
        ...metadataUpdate("media-1", 10, 11),
        tags: ["after"],
        publishedEffect: false,
      }),
    ).rejects.toThrow();
    expect(await mediaMetadataState(sql)).toEqual(before);
  },
);

contract("enforces the ASCII media tag schema on every SQL runtime", async (runtime, expect) => {
  const { sql } = await runtime.open({ resolveModel: noModels });
  await seedMedia(sql, "schema-tag");
  const insert = (tag: string, id = "schema-tag") =>
    sql.run("insert into media_tags(media_id, tag) values (?, ?)", id, tag);
  await insert("project-2026");
  for (const tag of [
    "project-2026",
    "",
    "a".repeat(41),
    "A",
    "a b",
    "a,b",
    "Выставка",
    "😀",
    "a\u0000",
  ])
    await expect(insert(tag)).rejects.toThrow();
  await expect(insert("valid", "missing")).rejects.toThrow();
});
