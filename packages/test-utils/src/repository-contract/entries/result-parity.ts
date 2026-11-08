import { publicationIdempotencyKey, publicationRequestFingerprint } from "@lacecms/application";
import { blockKey, contentEntryId, createContentEntry } from "@lacecms/domain";
import type { ContentEntry, EntrySeo } from "@lacecms/domain";
import { lifecycleState, unpublishCommand } from "./fixtures.js";
import {
  type RepositoryContractCase,
  editor,
  entry,
  heroBlock,
  publish,
  references,
  registerContract,
  resolveRoute,
  save,
  seedMedia,
  seedModels,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

const SEO: EntrySeo = Object.freeze({
  description: "Search description",
  noindex: true,
  title: "Search title",
});

/** A `posts` entry with one hero block and an SEO group on its draft. */
function seoHeroEntry(id: string, updatedAt: number): ContentEntry {
  const value = entry(id, "posts", {
    blocks: [heroBlock(`${id}-block`, "media-1", id)],
    fields: { image: "media-1", title: id },
    slug: id,
    title: id,
    updatedAt,
  });
  return createContentEntry({
    draft: { ...value.draft, seo: SEO },
    id: value.id,
    model: value.model,
  });
}

contract(
  "returns publication and unpublication results equal to a later load",
  async (runtime, expect) => {
    const harness = await runtime.open({ resolveModel: resolveRoute });
    const { repository, sql } = harness;
    await seedModels(sql, "posts");
    await seedMedia(sql, "media-1");
    const plainId = contentEntryId("plain");
    await repository.create({
      entry: seoHeroEntry("plain", 1),
      mediaReferences: references("plain-block"),
    });
    const idempotency = {
      actorId: editor.id,
      fingerprint: publicationRequestFingerprint("parity"),
      key: publicationIdempotencyKey("parity"),
    };
    const published = await repository.publish({ ...publish("plain", 1, 2), idempotency });
    expect(published.outcome).toBe("published");
    const loaded = await repository.load({ entryId: plainId });
    expect(loaded!.published!.seo).toEqual(SEO);
    expect(published.entry).toEqual(loaded);

    // The stored replay is the same value, read through a second repository.
    const replay = await harness.reopen().publish({ ...publish("plain", 1, 3), idempotency });
    expect(replay.outcome).toBe("replayed");
    expect(replay.entry).toEqual(await repository.load({ entryId: plainId }));

    // A conditional projection replaces the copied fields and block data.
    const projectedId = contentEntryId("projected");
    await repository.create({
      entry: seoHeroEntry("projected", 4),
      mediaReferences: references("projected-block"),
    });
    const projection = {
      blocks: [{ data: { title: "Shown" }, key: blockKey("projected-block") }],
      fields: { title: "Shown" },
      internalLinks: [],
      mediaReferences: [],
    };
    const projected = await repository.publish({ ...publish("projected", 1, 5), projection });
    const projectedLoad = await repository.load({ entryId: projectedId });
    expect(projectedLoad!.published!.fields).toEqual(projection.fields);
    expect(projectedLoad!.published!.seo).toEqual(SEO);
    expect(projected.entry).toEqual(projectedLoad);

    const unpublished = await repository.unpublish(
      unpublishCommand("plain", loaded!.published!.id, 6),
    );
    const unpublishedLoad = await repository.load({ entryId: plainId });
    expect(unpublishedLoad!.published).toBeUndefined();
    expect(unpublished.entry).toEqual(unpublishedLoad);
  },
);

contract(
  "refuses a stale publication as a revision conflict before link validation",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    await repository.create({
      entry: entry("target", "posts", { slug: "target", title: "Target", updatedAt: 1 }),
      mediaReferences: [],
    });
    // The source links to a target that has no published route.
    const internalLinks = [
      {
        area: "fields" as const,
        delivered: true,
        pointer: "/link",
        sourceKey: "$fields" as const,
        targetId: "target",
      },
    ];
    const fields = { link: "entry:target" };
    await repository.create({
      entry: entry("source", "posts", { fields, slug: "source", title: "Source", updatedAt: 1 }),
      internalLinks,
      mediaReferences: [],
    });
    await repository.saveCompleteDraft({
      ...save("source", 1, 2, { fields, slug: "source", title: "Source" }),
      internalLinks,
    });
    const before = await lifecycleState(sql);
    await expect(repository.publish(publish("source", 2, 3))).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(await lifecycleState(sql)).toEqual(before);
    await expect(repository.publish(publish("source", 1, 4))).rejects.toMatchObject({
      code: "CONTENT_REVISION_CONFLICT",
    });
    expect(await lifecycleState(sql)).toEqual(before);
  },
);
