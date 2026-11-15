import type { Actor, ContentBlockInput } from "@lacecms/domain";

import { present } from "../test-support/fixtures.js";
import { expect, test } from "vitest";

import { actorId, mediaId } from "@lacecms/domain";

import {
  admin,
  editor,
  seoFixture,
  seoPost,
  envelopeFixture,
  panel,
  envelopePost,
} from "../test-support/fixtures.js";

test("content use cases carry the SEO group through save, publish, revert and duplicate", async () => {
  const { store, useCases } = await seoFixture();
  const viewer: Actor = { id: actorId("viewer"), role: "viewer" };
  const created = await useCases.create({
    actor: editor,
    modelKey: "posts",
    ...seoPost("A", "a", {
      canonical: " https://example.com/a ",
      image: "media-1",
      noindex: false,
      title: "  Hello  ",
    }),
  });
  expect(created.draft.seo).toEqual({
    canonical: "https://example.com/a",
    image: "media-1",
    title: "Hello",
  });
  expect(store.mediaReferences(created.draft.id)).toEqual([
    { fieldPath: "image", mediaId: "media-1", sourceKey: "$seo" },
  ]);
  const { entry: published } = await useCases.publish({
    actor: admin,
    entryId: created.id,
    expectedRevision: 1,
  });
  expect(present(published.published).seo).toEqual(created.draft.seo);
  expect(store.mediaReferences(present(published.published).id)).toEqual([
    { fieldPath: "image", mediaId: "media-1", sourceKey: "$seo" },
  ]);
  const publicEntry = present(await store.loadPublic("/blog/a"));
  expect(present(publicEntry.entry.published).seo).toEqual(created.draft.seo);
  expect(publicEntry.media.map((media) => media.id)).toEqual(["media-1"]);
  expect(await store.loadPublicMedia(mediaId("media-1"))).not.toBeNull();
  expect(
    present((await store.loadMediaUsage({ limit: 50, mediaId: mediaId("media-1") }))[0]).locations,
  ).toEqual([{ field: "image", source: "seo", states: ["draft", "published"] }]);

  const cleared = await useCases.save({
    actor: editor,
    entryId: created.id,
    expectedRevision: 1,
    ...seoPost("A", "a"),
  });
  expect(cleared.draft).not.toHaveProperty("seo");
  expect(store.mediaReferences(cleared.draft.id)).toEqual([]);

  await expect(
    useCases.revertDraft({ actor: viewer, entryId: created.id, expectedRevision: 2 }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  const reverted = await useCases.revertDraft({
    actor: editor,
    entryId: created.id,
    expectedRevision: 2,
  });
  expect(reverted.draft.seo).toEqual(created.draft.seo);
  expect(store.mediaReferences(reverted.draft.id)).toEqual([
    { fieldPath: "image", mediaId: "media-1", sourceKey: "$seo" },
  ]);

  const copy = await useCases.duplicate({ actor: editor, entryId: created.id });
  expect(copy.draft.seo).toEqual(created.draft.seo);
  expect(store.mediaReferences(copy.draft.id)).toEqual([
    { fieldPath: "image", mediaId: "media-1", sourceKey: "$seo" },
  ]);
  await expect(
    useCases.save({
      actor: viewer,
      entryId: created.id,
      expectedRevision: 3,
      ...seoPost("A", "a", { title: "x" }),
    }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
});

test("content use cases refuse SEO for models without it and unavailable SEO images", async () => {
  const { store, useCases } = await seoFixture();
  let writes = 0;
  const create = store.create.bind(store);
  store.create = async (input) => {
    writes++;
    return create(input);
  };
  await expect(
    useCases.create({ actor: editor, modelKey: "notes", ...seoPost("N", "n", { title: "x" }) }),
  ).rejects.toMatchObject({
    issues: [{ code: "seo_not_allowed", path: ["seo"] }],
  });
  await expect(
    useCases.create({
      actor: editor,
      modelKey: "posts",
      ...seoPost("P", "p", { canonical: "/relative" }),
    }),
  ).rejects.toMatchObject({
    issues: [{ code: "invalid_canonical_url", path: ["seo", "canonical"] }],
  });
  await expect(
    useCases.create({
      actor: editor,
      modelKey: "posts",
      ...seoPost("P", "p", { image: "media-missing" }),
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(writes).toBe(0);
  const note = await useCases.create({
    actor: editor,
    modelKey: "notes",
    ...seoPost("N", "n", null),
  });
  expect(note.draft).not.toHaveProperty("seo");
});

test("the publication fingerprint covers the SEO group", async () => {
  const fingerprints: string[] = [];
  for (const seo of [undefined, { title: "Hello" }]) {
    const { store, useCases } = await seoFixture("fingerprint");
    const publish = store.publish.bind(store);
    store.publish = async (input) => {
      fingerprints.push(present(input.idempotency).fingerprint);
      return publish(input);
    };
    const created = await useCases.create({
      actor: editor,
      modelKey: "posts",
      ...seoPost("A", "a", seo),
    });
    await useCases.publish({
      actor: admin,
      entryId: created.id,
      expectedRevision: 1,
      idempotencyKey: "publish-1",
    });
  }
  expect(fingerprints).toHaveLength(2);
  expect(fingerprints[0]).not.toBe(fingerprints[1]);
});

test("content use cases carry block envelopes through save, publish, revert and duplicate", async () => {
  const { store, useCases } = await envelopeFixture();
  const created = await useCases.create({
    actor: editor,
    modelKey: "posts",
    ...envelopePost([
      panel("b1", 1000, {
        anchor: "pricing",
        className: " wide  wide ",
        settings: { boxed: true },
      }),
      panel("b2", 2000, { hidden: true }, { image: "media-2" }),
      panel("b3", 3000, {}, { heading: "Shown", image: "media-1" }),
    ]),
  });
  const [first, hidden, plain] = created.draft.blocks;
  expect(first).toMatchObject({
    anchor: "pricing",
    className: "wide",
    hidden: false,
    settings: { align: "left", boxed: true },
  });
  // Omitted envelope values take their defaults.
  expect(plain).toMatchObject({ hidden: false, settings: { align: "left", boxed: false } });
  expect(plain).not.toHaveProperty("anchor");
  expect(hidden).toMatchObject({ data: { image: "media-2" }, hidden: true });
  // Hidden-block media stays referenced.
  expect(store.mediaReferences(created.draft.id)).toEqual([
    { fieldPath: "image", mediaId: "media-2", sourceKey: "b2" },
    { fieldPath: "image", mediaId: "media-1", sourceKey: "b3" },
  ]);

  // The hidden block lacks its required heading, yet publication succeeds.
  const { entry: published } = await useCases.publish({
    actor: admin,
    entryId: created.id,
    expectedRevision: 1,
  });
  expect(present(published.published).blocks).toEqual(created.draft.blocks);
  const publicEntry = present(await store.loadPublic("/blog/a"));
  expect(present(publicEntry.entry.published).blocks.map((block) => block.key)).toEqual([
    "b1",
    "b3",
  ]);
  expect(publicEntry.media.map((media) => media.id)).toEqual(["media-1"]);
  expect(await store.loadPublicMedia(mediaId("media-2"))).toBeNull();
  expect(await store.loadPublicMedia(mediaId("media-1"))).not.toBeNull();

  const unhidden = await useCases.save({
    actor: editor,
    entryId: created.id,
    expectedRevision: 1,
    ...envelopePost([
      panel("b1", 1000, { settings: { align: "center" } }),
      panel("b2", 2000, {}, { image: "media-2" }),
    ]),
  });
  expect(unhidden.draft.blocks[0]).not.toHaveProperty("anchor");
  await expect(
    useCases.publish({ actor: admin, entryId: created.id, expectedRevision: 2 }),
  ).rejects.toMatchObject({
    issues: [{ code: "missing_required_field", path: ["blocks", 1, "data", "heading"] }],
  });
  expect(present(present(await store.loadPublic("/blog/a")).entry.published).id).toBe(
    present(published.published).id,
  );

  const reverted = await useCases.revertDraft({
    actor: editor,
    entryId: created.id,
    expectedRevision: 2,
  });
  expect(reverted.draft.blocks).toEqual(present(published.published).blocks);

  const copy = await useCases.duplicate({ actor: editor, entryId: created.id });
  expect(copy.draft.blocks.map(({ key: _key, ...rest }) => rest)).toEqual(
    reverted.draft.blocks.map(({ key: _key, ...rest }) => rest),
  );
  expect(copy.draft.blocks.map((block) => block.key)).not.toContain("b1");
});

test("content use cases refuse invalid block envelopes before writing", async () => {
  const { store, useCases } = await envelopeFixture();
  let writes = 0;
  const create = store.create.bind(store);
  store.create = async (input) => {
    writes++;
    return create(input);
  };
  const refused = async (blocks: readonly ContentBlockInput[], issue: unknown) =>
    expect(
      useCases.create({ actor: editor, modelKey: "posts", ...envelopePost(blocks) }),
    ).rejects.toMatchObject({ issues: [issue] });
  await refused([panel("b1", 1000, { anchor: "faq" }), panel("b2", 2000, { anchor: "faq" })], {
    code: "duplicate_block_anchor",
    path: ["blocks", 1, "anchor"],
  });
  await refused([panel("b1", 1000, { anchor: "FAQ" })], {
    code: "invalid_block_anchor",
    path: ["blocks", 0, "anchor"],
  });
  await refused([panel("b1", 1000, { settings: { width: 2 } })], {
    code: "unknown_field",
    path: ["blocks", 0, "settings", "width"],
  });
  await expect(
    useCases.create({
      actor: editor,
      modelKey: "posts",
      ...envelopePost([panel("b1", 1000, { hidden: true }, { image: "media-missing" })]),
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(writes).toBe(0);
});

test("the publication fingerprint covers the block envelope", async () => {
  const fingerprints: string[] = [];
  for (const hidden of [false, true]) {
    const { store, useCases } = await envelopeFixture("envelope-fingerprint");
    const publish = store.publish.bind(store);
    store.publish = async (input) => {
      fingerprints.push(present(input.idempotency).fingerprint);
      return publish(input);
    };
    const created = await useCases.create({
      actor: editor,
      modelKey: "posts",
      ...envelopePost([panel("b1", 1000, { hidden })]),
    });
    await useCases.publish({
      actor: admin,
      entryId: created.id,
      expectedRevision: 1,
      idempotencyKey: "publish-1",
    });
  }
  expect(fingerprints).toHaveLength(2);
  expect(fingerprints[0]).not.toBe(fingerprints[1]);
});
