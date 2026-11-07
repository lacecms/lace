import { readAllBuildContentPages } from "../../delivery/build-export.js";

import {
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import type { MediaMetadata } from "@lacecms/domain";
import {
  type ContractRepository,
  type ContractSql,
  type RepositoryContractCase,
  editor,
  resolveRoute,
  base64Url,
  seedModels,
  seedMedia,
  entry,
  heroBlock,
  publish,
  syncPage,
  syncCollection,
  syncGlobal,
  syncResolver,
  applySync,
  registerContract,
} from "../shared.js";
import { unpublishCommand } from "../entries/fixtures.js";

import { metadataUpdate } from "../media/fixtures.js";
import { globalEntry, seoReference } from "../entries/fixtures.js";
import { envelopeBlock, blockReference } from "../entries/fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

function deliveredMediaIds(items: readonly { readonly media: readonly MediaMetadata[] }[]) {
  return [...new Set(items.flatMap((item) => item.media.map((value) => String(value.id))))].sort();
}

async function seedExportSite(repository: ContractRepository, sql: ContractSql): Promise<void> {
  await seedModels(sql, "home", "posts", "settings");
  for (const id of ["media-1", "media-2", "media-3", "media-4", "media-5", "media-6"]) {
    await seedMedia(sql, id);
  }
  const home = entry("home", "home", {
    blocks: [
      heroBlock("home-hero", "media-1"),
      envelopeBlock("home-hidden", "media-5", { hidden: true }, 2000),
    ],
    fields: { title: "Home" },
    updatedAt: 1,
  });
  await repository.create({
    entry: home,
    mediaReferences: [
      blockReference("media-1", "home-hero"),
      blockReference("media-5", "home-hidden"),
    ],
  });
  await repository.publish(publish("home", 1, 2, "home-published"));
  const posts: readonly [string, readonly string[]][] = [
    ["post-d", ["media-2"]],
    ["post-a", ["media-2"]],
    ["post-c", ["media-3"]],
    ["post-b", []],
  ];
  for (const [id, media] of posts) {
    const value = entry(id, "posts", {
      blocks: media.map((image) => heroBlock(`${id}-block`, image)),
      fields: { title: id },
      slug: id,
      updatedAt: 3,
    });
    await repository.create({
      entry:
        id === "post-b"
          ? createContentEntry({
              draft: { ...value.draft, seo: { image: mediaId("media-4"), title: "B" } },
              id: value.id,
              model: value.model,
            })
          : value,
      mediaReferences: [
        ...media.map((image) => blockReference(image, `${id}-block`)),
        ...(id === "post-b" ? [seoReference("media-4")] : []),
      ],
    });
    await repository.publish(publish(id, 1, 4, `${id}-published`));
  }
  await repository.create({
    entry: entry("draft-only", "posts", {
      blocks: [heroBlock("draft-only-block", "media-6")],
      slug: "draft-only",
      updatedAt: 5,
    }),
    mediaReferences: [blockReference("media-6", "draft-only-block")],
  });
  await repository.create({
    entry: globalEntry("settings", 6, "media-1"),
    mediaReferences: [
      { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: "$fields" },
      { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: blockKey("settings-block") },
    ],
  });
  await repository.publish(publish("settings", 1, 7, "settings-published"));
}

contract(
  "pages the build export by path with first-page globals and per-page media",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedExportSite(repository, sql);
    const version = await repository.publishedContentVersion();

    const paged = await readAllBuildContentPages(repository, 2);
    expect(paged.pages.map((page) => page.entries.map((item) => item.path))).toEqual([
      ["/", "/blog/post-a"],
      ["/blog/post-b", "/blog/post-c"],
      ["/blog/post-d"],
    ]);
    expect(paged.pages.map((page) => page.version)).toEqual([version, version, version]);
    expect(paged.pages.map((page) => page.nextCursor === undefined)).toEqual([false, false, true]);
    expect(paged.pages[0]!.globals!.map((item) => item.entry.id)).toEqual(["settings"]);
    for (const page of paged.pages.slice(1)) expect(page).not.toHaveProperty("globals");

    // Each page delivers exactly its own media; hidden-only and draft-only media never appear.
    expect(
      paged.pages.map((page) => deliveredMediaIds([...page.entries, ...(page.globals ?? [])])),
    ).toEqual([["media-1", "media-2"], ["media-3", "media-4"], ["media-2"]]);
    expect(paged.entries[0]!.entry.published!.blocks.map((block) => block.key)).toEqual([
      "home-hero",
    ]);
    expect(paged.entries.map((item) => item.entry.id)).not.toContain("draft-only");
    expect(paged.entries[2]!.entry.published!.seo).toEqual({ image: "media-4", title: "B" });

    // Concatenated pages equal one complete page sequence of the same state.
    const complete = await readAllBuildContentPages(repository);
    expect(complete.pages).toHaveLength(1);
    expect(complete.pages[0]).not.toHaveProperty("nextCursor");
    expect(paged.entries).toEqual(complete.entries);
    expect(paged.globals).toEqual(complete.globals);
    expect(deliveredMediaIds([...paged.entries, ...paged.globals])).toEqual([
      "media-1",
      "media-2",
      "media-3",
      "media-4",
    ]);

    // A site without routed entries still delivers its globals on the only page.
    await repository.unpublish(unpublishCommand("home", "home-published", 10));
    for (const id of ["post-a", "post-b", "post-c", "post-d"]) {
      await repository.unpublish(unpublishCommand(id, `${id}-published`, 11));
    }
    const globalsOnly = await repository.exportBuildContentPage({ limit: 1 });
    expect(globalsOnly.entries).toEqual([]);
    expect(globalsOnly.globals!.map((item) => item.entry.id)).toEqual(["settings"]);
    expect(globalsOnly).not.toHaveProperty("nextCursor");
    expect(deliveredMediaIds(globalsOnly.globals!)).toEqual(["media-1"]);

    for (const limit of [0, 101, 1.5]) {
      await expect(repository.exportBuildContentPage({ limit })).rejects.toMatchObject({
        code: "CONTENT_INVALID_STATE",
      });
    }
  },
);

contract("ends build-export pages at the stored byte budget", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedModels(sql, "posts");
  const text = (length: number) => "x".repeat(length);
  // About 1.8 MB each: two fit the 4 MB budget, a third does not.
  const sizes: readonly [string, number][] = [
    ["p1", 1],
    ["p2", 1],
    ["p3", 1],
    ["p4", 5],
    ["p5", 0],
  ];
  for (const [id, extraBlocks] of sizes) {
    const blocks =
      extraBlocks === 0
        ? []
        : Array.from({ length: extraBlocks }, (_, index) =>
            Object.freeze({
              ...heroBlock(`${id}-big-${index}`, "media-1", text(900_000), "hero", 1000 + index),
            }),
          );
    await repository.create({
      entry: entry(id, "posts", {
        blocks: [
          ...blocks,
          // A hidden block never counts against the budget.
          envelopeBlock(`${id}-hidden`, "media-1", { hidden: true }, 9000),
        ],
        fields: { body: id === "p5" ? "small" : text(900_000) },
        slug: id,
        updatedAt: 1,
      }),
      mediaReferences: [],
    });
    await repository.publish(publish(id, 1, 2, `${id}-published`));
  }
  const paged = await readAllBuildContentPages(repository);
  // p4 alone holds about 5.4 MB and is delivered on its own page.
  expect(paged.pages.map((page) => page.entries.map((item) => item.path))).toEqual([
    ["/blog/p1", "/blog/p2"],
    ["/blog/p3"],
    ["/blog/p4"],
    ["/blog/p5"],
  ]);
  expect(paged.entries[3]!.entry.published!.blocks).toHaveLength(5);
  // The entry limit ends a page before the budget does.
  const limited = await readAllBuildContentPages(repository, 1);
  expect(limited.pages.map((page) => page.entries.length)).toEqual([1, 1, 1, 1, 1]);
});

contract(
  "refuses build-export cursors of a changed published state or another list",
  async (runtime, expect) => {
    const models = [syncPage(), syncCollection(), syncGlobal()];
    const notes = syncCollection({
      key: "notes",
      projectionHash: "projection-notes",
      route: "/notes/:slug",
      structureHash: "structure-notes",
    });
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver([...models, notes]),
    });
    await applySync(repository, models, 1);
    await seedMedia(sql, "media-1");
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      await repository.create({
        entry: entry(id, "posts", {
          blocks: [heroBlock(`${id}-block`, "media-1")],
          slug: id,
          updatedAt: 2,
        }),
        mediaReferences: [blockReference("media-1", `${id}-block`)],
      });
      if (id !== "f") await repository.publish(publish(id, 1, 3, `${id}-published`));
    }

    const mutations: readonly [string, () => Promise<unknown>][] = [
      ["publish", () => repository.publish(publish("f", 1, 4, "f-published"))],
      ["unpublish", () => repository.unpublish(unpublishCommand("f", "f-published", 5))],
      [
        "delete",
        () =>
          repository.delete({
            deletedAt: unixMilliseconds(6),
            deletedBy: editor,
            entryId: contentEntryId("e"),
            expectedPublishedSnapshotId: contentSnapshotId("e-published"),
            expectedRevision: 1,
          }),
      ],
      ["media metadata", () => repository.updateMediaMetadata(metadataUpdate("media-1", 1, 7))],
      ["sync", () => applySync(repository, [...models, notes], 8)],
    ];
    for (const [name, mutate] of mutations) {
      const first = await repository.exportBuildContentPage({ limit: 1 });
      expect(first.nextCursor, name).toBeDefined();
      await mutate();
      const actual = await repository.publishedContentVersion();
      expect(actual, name).toBe(first.version + 1);
      const failure = await repository
        .exportBuildContentPage({ after: first.nextCursor!, limit: 1 })
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      expect(failure, name).toMatchObject({
        actualVersion: actual,
        code: "BUILD_EXPORT_VERSION_CHANGED",
        expectedVersion: first.version,
      });
    }

    const current = await repository.exportBuildContentPage({ limit: 1 });
    expect(
      (await repository.exportBuildContentPage({ after: current.nextCursor!, limit: 1 })).entries,
    ).toHaveLength(1);
    const collectionCursor = (
      await repository.listPublic({ limit: 1, modelKey: contentModelKey("posts") })
    ).nextCursor!;
    for (const after of [collectionCursor, "not-a-cursor", base64Url({ kind: "build-export" })]) {
      await expect(
        repository.exportBuildContentPage({ after: after as never, limit: 1 }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE", name: "BuildExportCursorError" });
    }
  },
);
