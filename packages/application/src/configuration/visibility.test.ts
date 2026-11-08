// @ts-nocheck
// TODO(rf2): Type visibility evolution tables, mutable descriptors and partial synchronization adapters.
import { expect, test } from "vitest";
import { defineCollection, defineConfig } from "@lacecms/config";
import { builtInBlocks, defineBlock, field } from "@lacecms/content";
import {
  diffContentModelStructures,
  planEntryMigration,
  prepareConfigurationSynchronization,
  transformConfigurationSyncFields,
} from "../index.js";

import {
  storedModelFixture,
  snapshotFixture,
  scanFixture,
} from "../test-support/configuration-fixtures.js";

const blocks = Object.values(builtInBlocks);
const kinds = () => ({
  kind: field.select({
    options: ["image", "video", "embed"],
    required: true,
    defaultValue: "image",
  }),
});

async function works({ fields, visibility, version = 1, ...rest } = {}) {
  const config = await defineConfig({
    blocks,
    content: [
      defineCollection({
        blocks: [],
        fields: fields ?? {
          ...kinds(),
          media: field.media(),
          videoUrl: field.url({ required: true }),
        },
        key: "works",
        route: "/works/:slug",
        version,
        ...(visibility === undefined ? {} : { visibility }),
        ...rest,
      }),
    ],
  });
  return config.runtime.content[0];
}

const stored = (model) => storedModelFixture(model, "fingerprint");
const snapshot = snapshotFixture;
const port = (models, snapshots) => scanFixture(models, snapshots);

const video = { field: "kind", values: ["video"] };

test("classifies added, removed, narrowed, widened and controller changes", async () => {
  const none = await works();
  const added = await works({ version: 2, visibility: { videoUrl: video } });
  const widened = await works({
    version: 3,
    visibility: { videoUrl: { field: "kind", values: ["video", "embed"] } },
  });
  const diff = (before, after) =>
    diffContentModelStructures(before.structure, after.structure, after).map(
      ({ class: kind, kind: change, target }) => [kind, change, target],
    );
  expect(diff(none, added)).toEqual([["compatible", "field-visibility-added", "videoUrl"]]);
  expect(diff(added, none)).toEqual([["validated", "field-visibility-removed", "videoUrl"]]);
  expect(diff(added, widened)).toEqual([["validated", "field-visibility-changed", "videoUrl"]]);
  expect(diff(widened, added)).toEqual([["compatible", "field-visibility-changed", "videoUrl"]]);
  expect(diff(added, added)).toEqual([]);
  const [change] = diffContentModelStructures(widened.structure, added.structure, added);
  expect(change.visibility).toEqual({
    before: { field: "kind", values: ["video", "embed"] },
    after: video,
  });
  const flagged = await works({
    version: 2,
    fields: { ...kinds(), flag: field.boolean(), media: field.media(), videoUrl: field.url() },
    visibility: { videoUrl: { field: "flag", values: [true] } },
  });
  const flaggedBefore = await works({
    fields: { ...kinds(), flag: field.boolean(), media: field.media(), videoUrl: field.url() },
    visibility: { videoUrl: video },
  });
  expect(diff(flaggedBefore, flagged)).toEqual([
    ["validated", "field-visibility-changed", "videoUrl"],
  ]);
});

test("pairs renamed targets and controllers and reports only field changes for added or removed targets", async () => {
  const before = await works({
    fields: { type: kinds().kind, media: field.media(), clip: field.url() },
    visibility: { clip: { field: "type", values: ["video"] } },
  });
  const after = await works({
    version: 2,
    fields: {
      kind: field.select({
        options: ["image", "video", "embed"],
        required: true,
        defaultValue: "image",
        renamedFrom: "type",
      }),
      media: field.media(),
      videoUrl: field.url({ renamedFrom: "clip" }),
      caption: field.text(),
    },
    visibility: { videoUrl: video, caption: video },
  });
  const changes = diffContentModelStructures(before.structure, after.structure, after);
  expect(changes.map((change) => [change.kind, change.target])).toEqual([
    ["field-added", "caption"],
    ["field-renamed", "kind"],
    ["field-renamed", "videoUrl"],
  ]);
  const removed = await works({
    version: 3,
    fields: { type: kinds().kind, media: field.media() },
    removedFields: ["clip"],
  });
  expect(
    diffContentModelStructures(before.structure, removed.structure, removed).map(
      (change) => change.kind,
    ),
  ).toEqual(["field-removed"]);
});

test("nested group rules use schema paths", async () => {
  const gallery = (visibility) =>
    works({
      version: visibility ? 2 : 1,
      fields: {
        gallery: field.list({
          item: field.group({
            fields: { ...kinds(), media: field.media(), videoUrl: field.url() },
            ...(visibility ? { visibility } : {}),
          }),
        }),
      },
    });
  const before = await gallery();
  const after = await gallery({ videoUrl: video });
  expect(
    diffContentModelStructures(before.structure, after.structure, after).map((change) => [
      change.class,
      change.kind,
      change.target,
    ]),
  ).toEqual([["compatible", "field-visibility-added", "/gallery/*/videoUrl"]]);
});

test("transforms prune hidden published values, skip hidden backfills and keep drafts", async () => {
  const fields = {
    ...kinds(),
    media: field.media(),
    videoUrl: field.url(),
    note: field.text({ defaultValue: "note" }),
    gallery: field.list({
      item: field.group({
        fields: { ...kinds(), media: field.media(), videoUrl: field.url() },
        visibility: { videoUrl: video },
      }),
    }),
  };
  const before = await works({ fields: { ...fields, note: field.text() } });
  const after = await works({ version: 2, fields, visibility: { videoUrl: video, note: video } });
  const changes = diffContentModelStructures(before.structure, after.structure, after);
  const values = {
    kind: "image",
    media: "media-1",
    videoUrl: "https://example.com/v",
    gallery: [
      { kind: "video", videoUrl: "https://example.com/1" },
      { kind: "image", media: "media-2", videoUrl: "https://example.com/2" },
    ],
  };
  const published = transformConfigurationSyncFields(
    after.fields,
    changes,
    values,
    "published",
    after.visibility,
  );
  expect(published.fields).toEqual({
    kind: "image",
    media: "media-1",
    gallery: [
      { kind: "video", videoUrl: "https://example.com/1" },
      { kind: "image", media: "media-2" },
    ],
  });
  expect(published.prunes).toEqual({
    videoUrl: "/fields/videoUrl",
    "/gallery/*/videoUrl": "/fields/gallery/1/videoUrl",
  });
  expect(published.backfills).toEqual({});
  const draft = transformConfigurationSyncFields(
    after.fields,
    changes,
    values,
    "draft",
    after.visibility,
  );
  expect(draft.fields).toEqual({ ...values, note: "note" });
  expect(draft.prunes).toEqual({});
  expect(published.references.map((reference) => reference.mediaId)).toEqual([
    "media-1",
    "media-2",
  ]);
});

test("pruning releases media held only by hidden published values", async () => {
  const before = await works({ fields: { ...kinds(), media: field.media() } });
  const after = await works({
    version: 2,
    fields: { ...kinds(), media: field.media() },
    visibility: { media: { field: "kind", values: ["image"] } },
  });
  const changes = diffContentModelStructures(before.structure, after.structure, after);
  const result = transformConfigurationSyncFields(
    after.fields,
    changes,
    { kind: "video", media: "media-1" },
    "published",
    after.visibility,
  );
  expect(result.fields).toEqual({ kind: "video" });
  expect(result.references).toEqual([]);
});

test("revealed published occurrences must satisfy publication; hidden ones keep draft semantics", async () => {
  const conditional = await works({ visibility: { videoUrl: video } });
  const unconditional = await works({ version: 2 });
  const removal = diffContentModelStructures(
    conditional.structure,
    unconditional.structure,
    unconditional,
  );
  const reveal = (fields, state = "published", model = unconditional, changes = removal) =>
    transformConfigurationSyncFields(model.fields, changes, fields, state, model.visibility)
      .violations;
  expect(reveal({ kind: "image" })).toEqual({ videoUrl: "/fields/videoUrl" });
  expect(reveal({ kind: "image" }, "draft")).toEqual({});
  expect(reveal({ kind: "video" })).toEqual({});
  expect(reveal({ kind: "image", videoUrl: "https://example.com/v" })).toEqual({});

  const optional = await works({
    version: 2,
    fields: { ...kinds(), media: field.media(), videoUrl: field.url() },
  });
  const optionalBefore = await works({
    fields: { ...kinds(), media: field.media(), videoUrl: field.url() },
    visibility: { videoUrl: video },
  });
  const optionalRemoval = diffContentModelStructures(
    optionalBefore.structure,
    optional.structure,
    optional,
  );
  expect(reveal({ kind: "image" }, "published", optional, optionalRemoval)).toEqual({});

  const optionalConditional = await works({
    fields: { ...kinds(), media: field.media(), videoUrl: field.url() },
    visibility: { videoUrl: video },
  });
  const requiredConditional = await works({ version: 2, visibility: { videoUrl: video } });
  const tightening = diffContentModelStructures(
    optionalConditional.structure,
    requiredConditional.structure,
    requiredConditional,
  );
  expect(tightening.map((change) => [change.class, change.kind])).toEqual([
    ["validated", "field-changed"],
  ]);
  expect(reveal({ kind: "image" }, "published", requiredConditional, tightening)).toEqual({});
  expect(reveal({ kind: "video" }, "published", requiredConditional, tightening)).toEqual({
    videoUrl: "/fields/videoUrl",
  });
});

test("sync plans prune published values, report affected counts and refuse revealed gaps", async () => {
  const before = await works();
  const after = await works({ version: 2, visibility: { videoUrl: video } });
  const prepared = await prepareConfigurationSynchronization({
    models: [after],
    state: port(
      [stored(before)],
      [
        snapshot(1, "draft", { kind: "image", videoUrl: "https://example.com/1" }),
        snapshot(2, "published", { kind: "image", videoUrl: "https://example.com/1" }),
        snapshot(3, "draft", { kind: "video", videoUrl: "https://example.com/3" }),
      ],
    ),
  });
  expect(prepared.plan.isValid).toBe(true);
  const [operation] = prepared.plan.operations;
  expect(operation.evolution.recursiveFields).toBe(true);
  expect(operation.evolution.changes).toMatchObject([
    {
      class: "compatible",
      kind: "field-visibility-added",
      target: "videoUrl",
      affected: { draft: 0, published: 1 },
    },
  ]);

  const refused = await prepareConfigurationSynchronization({
    models: [await works({ version: 3 })],
    state: port(
      [stored(after)],
      [
        snapshot(1, "draft", { kind: "image" }),
        snapshot(2, "published", { kind: "image" }),
        snapshot(3, "published", { kind: "video", videoUrl: "https://example.com/3" }),
      ],
    ),
  });
  expect(refused.plan.isValid).toBe(false);
  expect(refused.plan.diagnostics).toMatchObject([
    { code: "CONSTRAINT_VIOLATED", fieldKey: "videoUrl", affectedCount: 1 },
  ]);
  expect(refused.plan.diagnostics[0].snapshots).toEqual([
    { entryId: "entry-2", state: "published", title: "Title 2" },
  ]);
  expect(refused.plan.diagnostics[0].message).toContain("reveals field videoUrl");
});

test("published block migrations store the published projection of block data", async () => {
  const cta = defineBlock({
    type: "cta",
    version: 2,
    fields: { hasCta: field.boolean(), ctaUrl: field.url() },
    visibility: { ctaUrl: { field: "hasCta", values: [true] } },
    migrations: { 2: (block) => block },
  });
  const snap = (id, state) => ({
    blocks: [
      {
        data: { ctaUrl: "https://example.com" },
        hidden: false,
        key: "b1",
        schemaVersion: 1,
        settings: {},
        type: "cta",
      },
    ],
    fields: {},
    references: [],
    revision: 1,
    snapshotId: id,
    state,
    title: "Title",
  });
  const unit = planEntryMigration(
    { draft: snap("d1", "draft"), entryId: "e1", published: snap("p1", "published") },
    new Map([["cta", cta]]),
    "system:content-sync",
  ).unit;
  const plan = (state) => unit.snapshots.find((value) => value.state === state);
  expect(plan("published").blocks[0].data).toEqual({});
  expect(plan("draft").blocks[0].data).toEqual({ ctaUrl: "https://example.com" });
});
