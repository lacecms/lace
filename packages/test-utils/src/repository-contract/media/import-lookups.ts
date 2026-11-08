import { readAllBuildContentPages } from "../../delivery/build-export.js";

import { contentModelKey, mediaId, unixMilliseconds } from "@lacecms/domain";

import {
  type RepositoryContractCase,
  editor,
  resolveRoute,
  seedModels,
  entry,
  save,
  publish,
  registerContract,
} from "../shared.js";
import { seedPublishedLifecycle } from "../entries/fixtures.js";

import { metadataUpdate } from "../media/fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract(
  "stores content hashes and filters active media by hash for import lookups",
  async (runtime, expect) => {
    const harness = await runtime.open({ resolveModel: resolveRoute });
    const { repository, sql } = harness;
    await seedPublishedLifecycle(repository, sql);
    const hash = "a".repeat(64);
    const other = "b".repeat(64);
    const create = (id: string, sha256: string, filename: string, createdAt: number) =>
      repository.createMedia({
        id: mediaId(id),
        storageKey: id,
        filename,
        mimeType: "image/png",
        sha256,
        size: createdAt,
        width: 1,
        height: 1,
        createdAt: unixMilliseconds(createdAt),
        createdBy: editor.id,
        tags: id === "hash-b" ? ["kept"] : [],
      });
    await create("hash-a", hash, "a.png", 3);
    await create("hash-b", hash, "b.png", 4);
    await create("hash-c", hash, "c.png", 5);
    await create("hash-other", other, "other.png", 6);
    expect((await repository.loadMedia("hash-a"))!.sha256).toBe(hash);
    expect((await repository.loadMedia("media-1"))!.sha256).toBeUndefined();

    // Metadata and tag updates keep the hash.
    await repository.updateMediaMetadata({
      ...metadataUpdate("hash-a", 3, 10),
      alt: "Alt",
      tags: ["x"],
      publishedEffect: false,
    });
    expect((await repository.loadMediaCatalogItem("hash-a"))!.media.sha256).toBe(hash);

    // Only active items match; deleting items and legacy rows never do.
    await repository.markForDeletion({
      mediaId: mediaId("hash-c"),
      requestedAt: unixMilliseconds(11),
      requestedBy: editor,
    });
    const ids = async (input: Partial<Parameters<typeof repository.listMedia>[0]>) =>
      (await repository.listMedia({ limit: 10, sort: "filename", ...input })).items.map(
        (item) => item.media.id,
      );
    expect(await ids({ sha256: hash })).toEqual(["hash-a", "hash-b"]);
    expect(await ids({ sha256: other })).toEqual(["hash-other"]);
    expect(await ids({ sha256: "c".repeat(64) })).toEqual([]);
    expect(await ids({ sha256: hash, tags: ["kept"] })).toEqual(["hash-b"]);
    expect(await ids({ sha256: hash, q: "b.png", type: "image/png" })).toEqual(["hash-b"]);
    expect(await ids({ sha256: hash, type: "image/gif" })).toEqual([]);
    for (const sort of [
      "createdAt",
      "-createdAt",
      "filename",
      "-filename",
      "size",
      "-size",
    ] as const) {
      const first = await repository.listMedia({ limit: 1, sort, sha256: hash });
      const next = await repository.listMedia({
        limit: 1,
        sort,
        sha256: hash,
        after: first.nextCursor!,
      });
      expect([...first.items, ...next.items].map((i) => i.media.id).sort()).toEqual([
        "hash-a",
        "hash-b",
      ]);
      expect(next.nextCursor).toBeUndefined();
      await expect(
        repository.listMedia({ limit: 1, sort, after: first.nextCursor! }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
      await expect(
        repository.listMedia({ limit: 1, sort, sha256: other, after: first.nextCursor! }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }
    await expect(
      repository.listMedia({ limit: 10, sort: "filename", sha256: hash.toUpperCase() }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });

    // A cursor issued without a hash keeps working without one.
    const plain = await repository.listMedia({ limit: 1, sort: "filename" });
    await expect(
      repository.listMedia({ limit: 1, sort: "filename", after: plain.nextCursor! }),
    ).resolves.toMatchObject({ items: [expect.anything()] });

    // Public projections never select the hash.
    await repository.saveCompleteDraft(
      save("post", 1, 12, {
        fields: { image: "hash-a", title: "Hashed" },
        mediaReferences: [{ fieldPath: "image", mediaId: mediaId("hash-a"), sourceKey: "$fields" }],
        slug: "post",
        title: "Hashed",
      }),
    );
    await repository.publish(publish("post", 2, 13));
    const publicEntry = await repository.loadPublic("/blog/post");
    expect(publicEntry!.media.map((m) => m.id)).toContain("hash-a");
    expect(publicEntry!.media.every((m) => m.sha256 === undefined)).toBe(true);
    expect((await repository.loadPublicMedia("hash-a"))!.sha256).toBeUndefined();
    const exported = await readAllBuildContentPages(repository);
    for (const item of exported.entries)
      expect(item.media.every((m) => m.sha256 === undefined)).toBe(true);

    await expect(
      sql.run("update media set sha256 = ? where id = 'media-2'", "A".repeat(64)),
    ).rejects.toThrow();
    await expect(
      sql.run("update media set sha256 = ? where id = 'media-2'", "a".repeat(63)),
    ).rejects.toThrow();
  },
);

contract(
  "filters entry lists by exact current draft slug for import lookups",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    const create = (id: string, slug: string, title: string, updatedAt: number) =>
      repository.create({
        entry: entry(id, "posts", { slug, title, updatedAt }),
        mediaReferences: [],
      });
    await create("about-1", "about", "About one", 1);
    await create("about-2", "about", "About two", 2);
    await create("about-us", "about-us", "About us", 3);
    await create("renamed", "old", "Renamed", 4);
    await repository.publish(publish("renamed", 1, 5));
    await repository.saveCompleteDraft(save("renamed", 1, 6, { slug: "new", title: "Renamed" }));
    const listInput = {
      limit: 10,
      listFields: [],
      modelKey: contentModelKey("posts"),
      sort: "-updatedAt" as const,
    };
    const about = await repository.list({ ...listInput, slug: "about" });
    expect(about.items.map((item) => item.id)).toEqual(["about-2", "about-1"]);
    expect(about.totals).toEqual({ all: 2, changed: 0, draft: 2, published: 0 });
    expect(
      (await repository.list({ ...listInput, slug: "new" })).items.map((item) => item.id),
    ).toEqual(["renamed"]);
    expect((await repository.list({ ...listInput, slug: "old" })).items).toEqual([]);
    expect(
      (await repository.list({ ...listInput, slug: "about", q: "two" })).items.map((i) => i.id),
    ).toEqual(["about-2"]);
    expect(
      (await repository.list({ ...listInput, slug: "new", status: "changed" })).totals,
    ).toMatchObject({ all: 1, changed: 1 });
    expect(
      (await repository.list({ ...listInput, slug: "about", sort: "title" })).items.map(
        (i) => i.id,
      ),
    ).toEqual(["about-1", "about-2"]);
    const first = await repository.list({ ...listInput, limit: 1, slug: "about" });
    const next = await repository.list({
      ...listInput,
      limit: 1,
      slug: "about",
      after: first.nextCursor!,
    });
    expect(next.items.map((item) => item.id)).toEqual(["about-1"]);
    await expect(
      repository.list({ ...listInput, limit: 1, slug: "about-us", after: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(
      repository.list({ ...listInput, limit: 1, after: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  },
);
