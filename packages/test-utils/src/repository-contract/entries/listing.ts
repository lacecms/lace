import { actorId, blockKey, contentModelKey, mediaId, unixMilliseconds } from "@lacecms/domain";
import type { Actor } from "@lacecms/domain";
import {
  type RepositoryContractCase,
  editor,
  resolveRoute,
  sequence,
  base64Url,
  count,
  seedModels,
  seedUser,
  entry,
  save,
  publish,
  registerContract,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract(
  "lists entries with derived status, totals, search, sorts, and bound cursors",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    await seedUser(sql, "editor", "editor@example.test", "editor@example.test");
    const gone: Actor = { id: actorId("gone"), role: "editor" };
    const entries = [
      entry("e-zebra", "posts", {
        fields: { body: { type: "doc" }, category: "news" },
        slug: "zebra",
        title: "Zebra draft",
        updatedAt: 10,
      }),
      entry("e-apple", "posts", {
        fields: { rank: 2 },
        slug: "apple-launch",
        title: "apple launch",
        updatedAt: 11,
      }),
      entry("e-banana", "posts", {
        fields: { category: "design" },
        slug: "banana",
        title: "Banana Launch",
        updatedAt: 12,
        updatedBy: gone,
      }),
      entry("e-same-a", "posts", { slug: "same-a", title: "Same", updatedAt: 13 }),
      entry("e-same-b", "posts", { slug: "same-b", title: "same", updatedAt: 13 }),
      entry("e-literal", "posts", {
        slug: "literal",
        title: "100% _off_ 'deal'",
        updatedAt: 14,
        updatedBy: { id: actorId("system:content-sync"), role: "admin" },
      }),
    ];
    for (const value of entries) await repository.create({ entry: value, mediaReferences: [] });
    for (const [id, at] of [
      ["e-apple", 20],
      ["e-banana", 21],
    ] as const) {
      await repository.publish(publish(id, 1, at, `${id}-published`));
    }
    const base = {
      limit: 100,
      listFields: ["category", "rank", "body", "missing"],
      modelKey: contentModelKey("posts"),
      sort: "-updatedAt" as const,
    };
    expect((await repository.list(base)).totals).toEqual({
      all: 6,
      changed: 0,
      draft: 4,
      published: 2,
    });
    await repository.saveCompleteDraft(
      save("e-banana", 1, 30, {
        fields: { category: "design" },
        slug: "banana",
        title: "Banana Launch",
        updatedBy: gone,
      }),
    );
    const all = await repository.list(base);
    expect(all.totals).toEqual({ all: 6, changed: 1, draft: 4, published: 1 });
    const byId = new Map(all.items.map((item) => [String(item.id), item]));
    expect(byId.get("e-zebra")).toEqual({
      draftRevision: 1,
      id: "e-zebra",
      listValues: { category: "news" },
      modelKey: "posts",
      slug: "zebra",
      status: "draft",
      title: "Zebra draft",
      updatedAt: 10,
      updatedBy: { displayName: "editor@example.test", id: "editor" },
    });
    expect(byId.get("e-apple")).toMatchObject({
      listValues: { rank: 2 },
      publishedAt: 20,
      publishedSnapshotId: "e-apple-published",
      status: "published",
    });
    expect(byId.get("e-banana")).toMatchObject({
      publishedAt: 21,
      status: "changed",
      updatedBy: { displayName: "Unknown user", id: "gone" },
    });
    expect(byId.get("e-literal")!.updatedBy.displayName).toBe("System");

    const ids = async (input: Record<string, unknown>) =>
      (await repository.list({ ...base, ...input } as never)).items.map((item) => item.id);
    const search = await repository.list({ ...base, q: "launch", sort: "title" });
    expect(search.items.map((item) => item.id)).toEqual(["e-apple", "e-banana"]);
    expect(search.totals).toEqual({ all: 2, changed: 1, draft: 0, published: 1 });
    const filtered = await repository.list({ ...base, q: "launch", status: "changed" });
    expect(filtered.items.map((item) => item.id)).toEqual(["e-banana"]);
    expect(filtered.totals).toEqual(search.totals);
    expect(await ids({ q: "apple-l" })).toEqual(["e-apple"]);
    for (const [q, expected] of [
      ["%", ["e-literal"]],
      ["_off_", ["e-literal"]],
      ["'deal'", ["e-literal"]],
      ["o_f", []],
    ] as const) {
      expect(await ids({ q })).toEqual(expected);
    }

    const pageThrough = async (sort: string) => {
      const result: string[] = [];
      let after: string | undefined;
      do {
        const page = await repository.list({
          ...base,
          limit: 1,
          sort: sort as never,
          ...(after === undefined ? {} : { after: after as never }),
        });
        result.push(...page.items.map((item) => String(item.id)));
        after = page.nextCursor;
      } while (after !== undefined);
      return result;
    };
    // Publication advances the entry update time; never-published entries sort earliest.
    const expectedOrders = {
      "-publishedAt": ["e-banana", "e-apple", "e-zebra", "e-same-b", "e-same-a", "e-literal"],
      "-title": ["e-zebra", "e-same-b", "e-same-a", "e-banana", "e-apple", "e-literal"],
      "-updatedAt": ["e-banana", "e-apple", "e-literal", "e-same-b", "e-same-a", "e-zebra"],
      publishedAt: ["e-literal", "e-same-a", "e-same-b", "e-zebra", "e-apple", "e-banana"],
      title: ["e-literal", "e-apple", "e-banana", "e-same-a", "e-same-b", "e-zebra"],
      updatedAt: ["e-zebra", "e-same-a", "e-same-b", "e-literal", "e-apple", "e-banana"],
    };
    for (const [sort, expected] of Object.entries(expectedOrders)) {
      expect(await pageThrough(sort)).toEqual(expected);
      expect(await ids({ sort })).toEqual(expected);
    }

    const titlePage = await repository.list({ ...base, limit: 1, sort: "title" });
    for (const mismatch of [
      { sort: "-updatedAt" },
      { q: "launch", sort: "title" },
      { sort: "title", status: "draft" },
      { modelKey: contentModelKey("home"), sort: "title" },
    ]) {
      await expect(
        repository.list({ ...base, after: titlePage.nextCursor!, limit: 1, ...mismatch } as never),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }
    const actualTitleCursor = JSON.parse(
      atob(titlePage.nextCursor!.replace(/-/gu, "+").replace(/_/gu, "/")),
    ) as { kind: string; version: number };
    const forged = (value: unknown) =>
      base64Url({
        id: "e-apple",
        kind: actualTitleCursor.kind,
        value,
        version: 2,
      });
    await expect(
      repository.list({ ...base, after: forged(5) as never, sort: "title" }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await ids({ after: forged("apple launch"), sort: "title" })).toEqual([
      "e-banana",
      "e-same-a",
      "e-same-b",
      "e-zebra",
    ]);
    await expect(
      repository.list({
        ...base,
        after: base64Url({ id: "e-apple", kind: "admin", timestamp: 1, version: 1 }) as never,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(repository.list({ ...base, limit: 101 })).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });

    await expect(
      repository.describeActors([
        actorId("editor"),
        actorId("system:content-sync"),
        actorId("gone"),
      ]),
    ).resolves.toEqual([
      { displayName: "editor@example.test", id: "editor" },
      { displayName: "System", id: "system:content-sync" },
      { displayName: "Unknown user", id: "gone" },
    ]);
    const many = Array.from({ length: 150 }, (_, index) => actorId(`actor-${index}`));
    expect((await repository.describeActors(many)).at(-1)).toEqual({
      displayName: "Unknown user",
      id: "actor-149",
    });
  },
);

contract(
  "lists media with search, type filter, sorts, bound cursors, and usage",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("outbox"),
      resolveModel: resolveRoute,
    });
    await seedModels(sql, "posts");
    await seedUser(sql, "editor", "Ada", "ada@example.test");
    for (const [id, filename, mimeType, size, createdAt, createdBy] of [
      ["m-a", "Cover.png", "image/png", 30, 10, "editor"],
      ["m-b", "cover-2.jpg", "image/jpeg", 10, 11, "gone"],
      ["m-c", "100% _off_ 'deal'.webp", "image/webp", 20, 12, "system:content-sync"],
      ["m-d", "banner.png", "image/png", 20, 12, "editor"],
      ["m-e", "cover.png", "image/png", 30, 10, "editor"],
    ] as const) {
      await repository.createMedia({
        createdAt: unixMilliseconds(createdAt),
        createdBy: actorId(createdBy),
        filename,
        height: 2,
        id: mediaId(id),
        mimeType,
        size,
        storageKey: `media/${id}`,
        width: 3,
      });
    }
    await expect(
      repository.createMedia({
        createdAt: unixMilliseconds(1),
        createdBy: actorId("editor"),
        filename: "dup.png",
        height: 1,
        id: mediaId("m-dup"),
        mimeType: "image/png",
        size: 1,
        storageKey: "media/m-a",
        width: 1,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    const base = { limit: 100, sort: "-createdAt" as const };
    const ids = async (input: Record<string, unknown>) =>
      (await repository.listMedia({ ...base, ...input } as never)).items.map(
        (item) => item.media.id,
      );
    const all = await repository.listMedia(base);
    const byId = new Map(all.items.map((item) => [String(item.media.id), item]));
    expect(byId.get("m-a")).toEqual({
      createdBy: { displayName: "Ada", id: "editor" },
      media: expect.objectContaining({ filename: "Cover.png", height: 2, width: 3 }),
      usageCount: 0,
    });
    expect(byId.get("m-b")!.createdBy).toEqual({ displayName: "Unknown user", id: "gone" });
    expect(byId.get("m-c")!.createdBy.displayName).toBe("System");
    expect(await ids({ q: "cover" })).toEqual(["m-b", "m-e", "m-a"]);
    expect(await ids({ q: "COVER", type: "image/png" })).toEqual(["m-e", "m-a"]);
    for (const [q, expected] of [
      ["%", ["m-c"]],
      ["_off_", ["m-c"]],
      ["'deal'", ["m-c"]],
      ["o_f", []],
    ] as const) {
      expect(await ids({ q })).toEqual(expected);
    }
    await expect(
      repository.listMedia({ ...base, type: "image/svg+xml" as never }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });

    const pageThrough = async (sort: string) => {
      const result: string[] = [];
      let after: string | undefined;
      do {
        const page = await repository.listMedia({
          limit: 1,
          sort: sort as never,
          ...(after === undefined ? {} : { after: after as never }),
        });
        result.push(...page.items.map((item) => String(item.media.id)));
        after = page.nextCursor;
      } while (after !== undefined);
      return result;
    };
    const expectedOrders = {
      "-createdAt": ["m-d", "m-c", "m-b", "m-e", "m-a"],
      "-filename": ["m-e", "m-a", "m-b", "m-d", "m-c"],
      "-size": ["m-e", "m-a", "m-d", "m-c", "m-b"],
      createdAt: ["m-a", "m-e", "m-b", "m-c", "m-d"],
      filename: ["m-c", "m-d", "m-b", "m-a", "m-e"],
      size: ["m-b", "m-c", "m-d", "m-a", "m-e"],
    };
    for (const [sort, expected] of Object.entries(expectedOrders)) {
      expect(await pageThrough(sort)).toEqual(expected);
      expect(await ids({ sort })).toEqual(expected);
    }
    const filenamePage = await repository.listMedia({ limit: 1, sort: "filename" });
    for (const mismatch of [
      { sort: "-createdAt" },
      { sort: "filename", type: "image/png" },
      { q: "cover", sort: "filename" },
    ]) {
      await expect(
        repository.listMedia({ after: filenamePage.nextCursor!, limit: 1, ...mismatch } as never),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }
    const forged = (fields: Record<string, unknown>) =>
      base64Url({
        id: "m-a",
        kind: JSON.stringify(["media", "filename", null, null, []]),
        value: "cover.png",
        version: 2,
        ...fields,
      });
    for (const after of [
      forged({ value: 10 }),
      forged({ version: 1 }),
      base64Url({ id: "m-a", kind: "media", timestamp: 10, version: 1 }),
      "not a cursor",
    ]) {
      await expect(
        repository.listMedia({ after: after as never, limit: 1, sort: "filename" }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }
    await expect(
      repository.listMedia({ after: forged({}) as never, limit: 1, sort: "filename" }),
    ).resolves.toMatchObject({ items: [{ media: { id: "m-e" } }] });

    const mediaBlock = (key: string, type: string, position: number, image: string) => ({
      data: { image },
      hidden: false,
      key: blockKey(key),
      position,
      schemaVersion: 1,
      settings: {},
      type,
    });
    const published = entry("e-one", "posts", {
      blocks: [
        mediaBlock("hero-1", "hero", 1000, "m-a"),
        mediaBlock("gallery-1", "gallery", 2000, "m-a"),
      ],
      fields: { cover: "m-a" },
      slug: "e-one",
      title: "Title e-one",
      updatedAt: 20,
    });
    await repository.create({
      entry: published,
      mediaReferences: [
        { fieldPath: "cover", mediaId: mediaId("m-a"), sourceKey: "$fields" },
        { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("hero-1") },
        { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("gallery-1") },
      ],
    });
    await repository.publish(publish("e-one", 1, 30, "e-one-published"));
    await repository.saveCompleteDraft(
      save("e-one", 1, 40, {
        blocks: [mediaBlock("gallery-1", "carousel", 1000, "m-a")],
        fields: { cover: "m-d" },
        mediaReferences: [
          { fieldPath: "cover", mediaId: mediaId("m-d"), sourceKey: "$fields" },
          { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("gallery-1") },
        ],
        slug: "e-one",
        title: "Title e-one",
      }),
    );
    await repository.create({
      entry: entry("e-two", "posts", {
        fields: { cover: "m-a" },
        slug: "e-two",
        title: "Title e-two",
        updatedAt: 50,
      }),
      mediaReferences: [{ fieldPath: "cover", mediaId: mediaId("m-a"), sourceKey: "$fields" }],
    });
    expect((await repository.loadMediaCatalogItem("m-a"))!.usageCount).toBe(2);
    expect((await repository.loadMediaCatalogItem("m-d"))!.usageCount).toBe(1);
    expect((await repository.loadMediaCatalogItem("m-b"))!.usageCount).toBe(0);
    await expect(repository.loadMediaCatalogItem("missing")).resolves.toBeNull();
    expect(
      new Map((await repository.listMedia(base)).items.map((i) => [i.media.id, i.usageCount])),
    ).toEqual(
      new Map([
        ["m-a", 2],
        ["m-b", 0],
        ["m-c", 0],
        ["m-d", 1],
        ["m-e", 0],
      ]),
    );
    expect(await repository.loadMediaUsage({ limit: 50, mediaId: mediaId("m-a") })).toEqual([
      {
        entryId: "e-two",
        locations: [{ field: "cover", source: "field", states: ["draft"] }],
        modelKey: "posts",
        slug: "e-two",
        status: "draft",
        title: "Title e-two",
      },
      {
        entryId: "e-one",
        locations: [
          { field: "cover", source: "field", states: ["published"] },
          {
            blockKey: "gallery-1",
            blockType: "carousel",
            field: "image",
            source: "block",
            states: ["draft", "published"],
          },
          {
            blockKey: "hero-1",
            blockType: "hero",
            field: "image",
            source: "block",
            states: ["published"],
          },
        ],
        modelKey: "posts",
        slug: "e-one",
        status: "changed",
        title: "Title e-one",
      },
    ]);
    expect(await repository.loadMediaUsage({ limit: 50, mediaId: mediaId("m-d") })).toEqual([
      expect.objectContaining({
        entryId: "e-one",
        locations: [{ field: "cover", source: "field", states: ["draft"] }],
      }),
    ]);
    expect(
      (await repository.loadMediaUsage({ limit: 1, mediaId: mediaId("m-a") })).map(
        (value) => value.entryId,
      ),
    ).toEqual(["e-two"]);
    for (const limit of [0, 51]) {
      await expect(
        repository.loadMediaUsage({ limit, mediaId: mediaId("m-a") }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }

    const outboxCount = () =>
      count(
        sql,
        "select count(*) as count from outbox_events where type = 'media.delete.requested'",
      );
    const request = (id: string) => ({
      mediaId: mediaId(id),
      requestedAt: unixMilliseconds(60),
      requestedBy: editor,
    });
    await expect(repository.markForDeletion(request("m-a"))).rejects.toMatchObject({
      code: "MEDIA_IN_USE",
    });
    await expect(repository.retryDeletion(request("m-a"))).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    await sql.run("update media set status = 'delete_failed' where id = 'm-d'");
    await expect(repository.retryDeletion(request("m-d"))).rejects.toMatchObject({
      code: "MEDIA_IN_USE",
    });
    expect(await outboxCount()).toBe(0);
    await expect(repository.markForDeletion(request("m-b"))).resolves.toMatchObject({
      media: { id: "m-b", status: "deleting", updatedAt: 60 },
      status: "deleting",
    });
    await expect(repository.markForDeletion(request("m-b"))).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    await expect(repository.markForDeletion(request("missing"))).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await outboxCount()).toBe(1);
    expect(
      JSON.parse(
        (await sql.get<{ payload_json: string }>(
          "select payload_json from outbox_events where type = 'media.delete.requested'",
        ))!.payload_json,
      ),
    ).toEqual({ mediaId: "m-b", requestedBy: "editor" });
    expect((await repository.loadMedia("m-a"))!.status).toBe("active");
  },
);

declare function atob(data: string): string;
