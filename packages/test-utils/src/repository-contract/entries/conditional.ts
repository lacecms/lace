import { ContentUseCases } from "@lacecms/application";

import { readAllBuildContentPages } from "../../delivery/build-export.js";
import type { CollectionModelInput } from "@lacecms/config";
import { defineCollection, defineConfig } from "@lacecms/config";

import { defineBlock, field, validateModelFields, publishedFieldValues } from "@lacecms/content";

import type {
  FieldDefinition,
  GroupFieldDefinition,
  ModelFieldDefinitions,
  JsonObject,
} from "@lacecms/content";
import { visibilityParityCases } from "../../visibility/parity-cases.js";

import {
  blockKey,
  contentEntryId,
  contentSnapshotId,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";

import {
  type ContractRepository,
  type RepositoryContractRuntime,
  type RepositoryContractCase,
  PUBLICATION_CHECKPOINTS,
  editor,
  admin,
  resolveRoute,
  sequence,
  count,
  seedModels,
  seedMedia,
  registerContract,
  entry,
  publish,
  applySync,
  syncResolver,
} from "../shared.js";
import { lifecycleState } from "../entries/fixtures.js";

import { metadataUpdate, pendingBuilds } from "../media/fixtures.js";
export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);
async function conditionalPublicationHarness(
  runtime: RepositoryContractRuntime,
  options: { readonly beforeMutation?: (checkpoint: string) => void } = {},
) {
  const kind = () =>
    field.select({ options: ["image", "video"], required: true, defaultValue: "image" });
  const feature = defineBlock({
    type: "feature",
    version: 1,
    fields: {
      kind: kind(),
      media: field.media({ required: true }),
      url: field.url(),
    },
    visibility: {
      media: { field: "kind", values: ["image"] },
      url: { field: "kind", values: ["video"] },
    },
  });
  const config = await defineConfig({
    blocks: [feature],
    content: [
      defineCollection({
        key: "posts",
        version: 1,
        route: "/blog/:slug",
        blocks: ["feature"],
        fields: {
          hasLink: field.boolean(),
          link: field.url({ required: true }),
          gallery: field.list({
            item: field.group({
              fields: {
                kind: kind(),
                media: field.media({ required: true }),
                videoUrl: field.url({ required: true }),
              },
              visibility: {
                media: { field: "kind", values: ["image"] },
                videoUrl: { field: "kind", values: ["video"] },
              },
            }),
          }),
        },
        visibility: { link: { field: "hasLink", values: [true] } },
      }),
    ],
  });
  const { repository, sql } = await runtime.open({
    resolveModel: resolveRoute,
    ...(options.beforeMutation === undefined ? {} : { beforeMutation: options.beforeMutation }),
  });
  await seedModels(sql, "posts");
  await seedMedia(sql, "media-shown");
  await seedMedia(sql, "media-hidden");
  await seedMedia(sql, "media-block-hidden");
  const useCases = (content: ContractRepository = repository, at = 10) =>
    new ContentUseCases({
      config: config.runtime,
      content,
      media: repository,
      clock: { now: () => unixMilliseconds(at) },
      idGenerator: { next: sequence(`conditional-${at}`) },
    });
  const draft = (slug: string, overrides: Record<string, unknown> = {}) => ({
    actor: editor,
    modelKey: "posts",
    title: slug,
    slug,
    fields: {
      hasLink: false,
      link: "entry:missing",
      gallery: [
        { kind: "image", media: "media-shown", videoUrl: "https://example.com/stale" },
        { kind: "video", media: "media-hidden", videoUrl: "https://example.com/v" },
      ],
    },
    blocks: [
      {
        key: blockKey("shown"),
        type: "feature",
        schemaVersion: 1,
        position: 1000,
        data: { kind: "image", media: "media-shown", url: "entry:missing" },
      },
      {
        key: blockKey("dormant"),
        type: "feature",
        schemaVersion: 1,
        position: 2000,
        hidden: true,
        data: { kind: "video", media: "media-block-hidden" },
      },
    ],
    ...overrides,
  });
  return { config, draft, repository, sql, useCases };
}

contract(
  "publishes the conditional-field projection with its references and keeps the draft",
  async (runtime, expect) => {
    const { draft, repository, sql, useCases } = await conditionalPublicationHarness(runtime);
    const cases = useCases();
    const created = await cases.create(draft("work"));
    const draftReferences = await sql.all(
      "select source_key, field_path, media_id from content_media_references where snapshot_id = ? order by 1, 2",
      created.draft.id,
    );
    const draftLinks = await sql.all(
      "select source_key, field_path, delivered from content_entry_link_references where snapshot_id = ? order by 1, 2",
      created.draft.id,
    );
    expect(draftLinks).toEqual([
      { source_key: "$fields", field_path: "/link", delivered: 0 },
      { source_key: "shown", field_path: "/url", delivered: 0 },
    ]);
    const published = await cases.publish({
      actor: admin,
      entryId: created.id,
      expectedRevision: 1,
      idempotencyKey: "conditional-publication",
    });
    expect(published.publication).toBe("published");
    const loaded = (await repository.load({ entryId: created.id }))!;
    expect(loaded.published!.fields).toEqual({
      hasLink: false,
      gallery: [
        { kind: "image", media: "media-shown" },
        { kind: "video", videoUrl: "https://example.com/v" },
      ],
    });
    expect(
      loaded.published!.blocks.map(({ key, data, hidden, position }) => [
        key,
        data,
        hidden,
        position,
      ]),
    ).toEqual([
      ["shown", { kind: "image", media: "media-shown" }, false, 1000],
      ["dormant", { kind: "video" }, true, 2000],
    ]);
    expect(loaded.published!.title).toBe("work");
    expect(loaded.published!.slug).toBe("work");
    expect(published.entry.published).toEqual(loaded.published);
    // The draft, its revision and its references keep every hidden value.
    expect(loaded.draft).toEqual(created.draft);
    expect(
      await sql.all(
        "select source_key, field_path, media_id from content_media_references where snapshot_id = ? order by 1, 2",
        created.draft.id,
      ),
    ).toEqual(draftReferences);
    expect(
      await sql.all(
        "select source_key, field_path, media_id from content_media_references where snapshot_id = ? order by 1, 2",
        loaded.published!.id,
      ),
    ).toEqual([
      { source_key: "$fields", field_path: "/gallery/0/media", media_id: "media-shown" },
      { source_key: "shown", field_path: "media", media_id: "media-shown" },
    ]);
    expect(
      await count(
        sql,
        "select count(*) as count from content_entry_link_references where snapshot_id = ?",
        loaded.published!.id,
      ),
    ).toBe(0);
    // Delivery reads only the projection.
    const page = await readAllBuildContentPages(repository);
    expect(page.entries[0]!.entry.published!.fields).toEqual(loaded.published!.fields);
    expect(page.entries[0]!.media.map((media) => media.id)).toEqual(["media-shown"]);
    const delivered = (await repository.loadPublic("/blog/work"))!.entry.published!;
    expect(delivered.fields).toEqual(loaded.published!.fields);
    // Hidden blocks are never delivered; the visible one carries projected data.
    expect(delivered.blocks.map((block) => [block.key, block.data])).toEqual([
      ["shown", { kind: "image", media: "media-shown" }],
    ]);
    // Hidden media are draft usage only and their metadata edits request no build.
    const usage = await repository.loadMediaUsage({ limit: 50, mediaId: mediaId("media-hidden") });
    expect(usage.map((item) => item.locations.map((location) => location.states))).toEqual([
      [["draft"]],
    ]);
    const version = await repository.publishedContentVersion();
    const builds = await pendingBuilds(sql);
    const edited = await repository.updateMediaMetadata(
      metadataUpdate("media-hidden", 1, 20, { alt: "Hidden" }),
    );
    expect(edited).not.toHaveProperty("targetVersion");
    expect(await repository.publishedContentVersion()).toBe(version);
    expect(await pendingBuilds(sql)).toEqual(builds);
    await expect(
      repository.markForDeletion({
        mediaId: mediaId("media-hidden"),
        requestedAt: unixMilliseconds(21),
        requestedBy: editor,
      }),
    ).rejects.toMatchObject({ code: "MEDIA_IN_USE" });
    // A retry replays the stored result without a second snapshot.
    const replay = await cases.publish({
      actor: admin,
      entryId: created.id,
      expectedRevision: 1,
      idempotencyKey: "conditional-publication",
    });
    expect(replay.publication).toBe("replayed");
    expect(replay.entry.published).toEqual(loaded.published);
    expect(await count(sql, "select count(*) as count from content_snapshots")).toBe(2);
    expect(await repository.publishedContentVersion()).toBe(version);
    expect(await sql.all("pragma foreign_key_check")).toEqual([]);
  },
);

contract(
  "guards projected internal links atomically and ignores hidden ones",
  async (runtime, expect) => {
    const { draft, repository, useCases } = await conditionalPublicationHarness(runtime);
    const cases = useCases();
    const target = await cases.create({ ...draft("target"), blocks: [] });
    const targetPublished = await cases.publish({
      actor: admin,
      entryId: target.id,
      expectedRevision: 1,
    });
    const visible = await cases.create(
      draft("visible", {
        fields: { hasLink: true, link: `entry:${target.id}`, gallery: [] },
        blocks: [],
      }),
    );
    // The target loses its route after the use case checked it, before the atomic commit.
    const racePort = Object.create(repository) as ContractRepository;
    racePort.resolveLinkTargets = async (ids) => {
      const statuses = await repository.resolveLinkTargets(ids);
      await cases.unpublish({
        actor: admin,
        entryId: target.id,
        expectedPublishedSnapshotId: targetPublished.entry.published!.id,
      });
      return statuses;
    };
    const before = await repository.publishedContentVersion();
    await expect(
      useCases(racePort, 20).publish({ actor: admin, entryId: visible.id, expectedRevision: 1 }),
    ).rejects.toMatchObject({
      issues: [{ code: "internal_link_unavailable", path: ["fields", "link"] }],
    });
    expect((await repository.load({ entryId: visible.id }))!.published).toBeUndefined();
    // Only the racing unpublication advanced the published state.
    expect(await repository.publishedContentVersion()).toBe(before + 1);
    // A hidden link to a missing target never blocks publication.
    const hidden = await cases.create(draft("hidden"));
    await expect(
      cases.publish({ actor: admin, entryId: hidden.id, expectedRevision: 1 }),
    ).resolves.toMatchObject({ publication: "published" });
  },
);

contract(
  "rolls back projected publication at every injected checkpoint",
  async (runtime, expect) => {
    for (const checkpoint of PUBLICATION_CHECKPOINTS) {
      let armed = false;
      const { draft, repository, sql, useCases } = await conditionalPublicationHarness(runtime, {
        beforeMutation: (name) => {
          if (armed && name === checkpoint) throw new Error(`injected ${checkpoint}`);
        },
      });
      const created = await useCases().create(draft("work"));
      const state = await lifecycleState(sql);
      armed = true;
      await expect(
        useCases().publish({ actor: admin, entryId: created.id, expectedRevision: 1 }),
        checkpoint,
      ).rejects.toBeDefined();
      expect(await lifecycleState(sql), checkpoint).toEqual(state);
      expect(
        await count(sql, "select count(*) as count from content_entry_link_references"),
        checkpoint,
      ).toBe(2);
      expect(
        (await repository.load({ entryId: created.id }))!.published,
        checkpoint,
      ).toBeUndefined();
    }
  },
);

contract("refuses a projection that does not name the draft's blocks", async (runtime, expect) => {
  const { draft, repository, sql, useCases } = await conditionalPublicationHarness(runtime);
  const created = await useCases().create(draft("work"));
  const state = await lifecycleState(sql);
  await expect(
    repository.publish({
      entryId: created.id,
      expectedRevision: 1,
      publishedAt: unixMilliseconds(30),
      publishedBy: admin,
      publishedSnapshotId: contentSnapshotId("bad-projection"),
      projection: {
        blocks: [{ key: blockKey("shown"), data: {} }],
        fields: {},
        internalLinks: [],
        mediaReferences: [],
      },
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(await lifecycleState(sql)).toEqual(state);
});

function withoutVisibility(fields: ModelFieldDefinitions): ModelFieldDefinitions {
  const stripGroup = (definition: GroupFieldDefinition): GroupFieldDefinition => {
    const { visibility: _rules, ...plain } = definition;
    return { ...plain, fields: withoutVisibility(definition.fields) };
  };
  const strip = (definition: FieldDefinition): FieldDefinition => {
    if (definition.type === "group") return stripGroup(definition);
    if (definition.type === "list")
      return {
        ...definition,
        item: definition.item.type === "group" ? stripGroup(definition.item) : definition.item,
      };
    return definition;
  };
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, strip(value)]));
}

contract(
  "shares visibility parity across synchronization and publication",
  async (runtime, expect) => {
    for (const parity of visibilityParityCases) {
      const values = JSON.parse(JSON.stringify(parity.values)) as Record<
        string,
        JsonObject[string]
      >;
      const expected = JSON.parse(JSON.stringify(parity.published)) as Record<
        string,
        JsonObject[string]
      >;
      // Cleared form controllers are unset before storage; SQL snapshots never store null controllers.
      for (const key of Object.keys(values))
        if (values[key] === null) {
          delete values[key];
          delete expected[key];
        }
      const config = async (version: number) =>
        defineConfig({
          blocks: [],
          content: [
            defineCollection({
              key: "posts",
              version,
              route: "/blog/:slug",
              blocks: [],
              fields: version === 1 ? withoutVisibility(parity.fields) : parity.fields,
              ...(version === 1 ? {} : { visibility: parity.visibility }),
            } as CollectionModelInput),
          ],
        });
      const v1 = await config(1);
      const v2 = await config(2);
      const { repository } = await runtime.open({ resolveModel: syncResolver(v2.runtime.content) });
      await applySync(repository, v1.runtime.content, 10);
      await repository.create({
        entry: entry("parity-raw", "posts", { fields: values, slug: "raw", updatedAt: 20 }),
        mediaReferences: [],
      });
      await repository.publish(publish("parity-raw", 1, 21));
      await applySync(repository, v2.runtime.content, 30);
      const synced = (await repository.load({ entryId: contentEntryId("parity-raw") }))!;
      expect(synced.published!.fields, parity.name).toEqual(expected);
      expect(synced.draft.fields, parity.name).toEqual(values);
      const useCases = new ContentUseCases({
        config: v2.runtime,
        content: repository,
        media: repository,
        clock: { now: () => unixMilliseconds(40) },
        idGenerator: { next: sequence("parity") },
      });
      const created = await useCases.create({
        actor: editor,
        modelKey: "posts",
        title: "Parity",
        slug: "normal",
        fields: values,
        blocks: [],
      });
      await useCases.publish({ actor: admin, entryId: created.id, expectedRevision: 1 });
      const stored = (await repository.load({ entryId: created.id }))!.published!.fields;
      const normalized = validateModelFields(
        parity.fields,
        values,
        "publish",
        [],
        parity.visibility,
      );
      expect(stored, parity.name).toEqual(
        publishedFieldValues(parity.fields, normalized, parity.visibility),
      );
      // Sync preserves absent controllers; ordinary writes materialize defaults. Both retain the same targets.
      const normalizedSync = validateModelFields(
        parity.fields,
        synced.published!.fields,
        "publish",
        [],
        parity.visibility,
      );
      expect(stored, parity.name).toEqual(
        publishedFieldValues(parity.fields, normalizedSync, parity.visibility),
      );
      for (const occurrence of parity.occurrences) {
        let value: unknown = stored;
        for (const key of occurrence.path) value = (value as Record<string | number, unknown>)[key];
        const keys = Object.keys(value as JsonObject);
        expect(
          keys.filter((key) => !occurrence.visibleKeys.includes(key)),
          parity.name,
        ).toEqual([]);
        for (const key of Object.keys(occurrence.visibility))
          expect(keys.includes(key), `${parity.name}: ${occurrence.path.join("/")}/${key}`).toBe(
            occurrence.visibleKeys.includes(key),
          );
      }
    }
  },
);
