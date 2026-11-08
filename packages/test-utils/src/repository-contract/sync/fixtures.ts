import {
  applyPreparedConfigurationSynchronization,
  prepareConfigurationSynchronization,
} from "@lacecms/application";
import { defineCollection, defineConfig } from "@lacecms/config";
import type { CollectionModelInput, NormalizedContentModel } from "@lacecms/config";
import { builtInBlocks, defineBlock, field } from "@lacecms/content";
import type { BlockDefinition, BlockMigrations, JsonObject } from "@lacecms/content";
import { blockKey, mediaId, unixMilliseconds } from "@lacecms/domain";
import type { ContentBlock } from "@lacecms/domain";
import {
  type ContractRepository,
  type ContractSql,
  type RepositoryContractRuntime,
  entry,
  publish,
  sequence,
  count,
  seedMedia,
  save,
  syncResolver,
} from "../shared.js";

export async function evolvingPosts(
  overrides: Partial<CollectionModelInput> = {},
  blocks: readonly BlockDefinition[] = Object.values(builtInBlocks),
): Promise<NormalizedContentModel> {
  const config = await defineConfig({
    blocks,
    content: [
      defineCollection({
        blocks: ["richText", "image", "quote"],
        fields: { summary: field.text({ maxLength: 100 }) },
        key: "posts",
        route: "/blog/:slug",
        version: 1,
        ...overrides,
      } as CollectionModelInput),
    ],
  });
  return config.runtime.content[0]!;
}

export async function seedEvolvingEntries(
  repository: ContractRepository,
  fields: { readonly draft: JsonObject; readonly published: JsonObject },
  blocks: readonly ContentBlock[] = [],
): Promise<void> {
  await repository.create({
    entry: entry("draft-only", "posts", {
      blocks,
      fields: fields.draft,
      title: "Draft",
      updatedAt: 20,
    }),
    mediaReferences: [],
  });
  await repository.create({
    entry: entry("live", "posts", {
      fields: fields.published,
      slug: "live",
      title: "Live",
      updatedAt: 21,
    }),
    mediaReferences: [],
  });
  await repository.publish(publish("live", 1, 22, "live-published"));
}

export function block(key: string, type: string, position: number, data: JsonObject) {
  return Object.freeze({
    data,
    hidden: false,
    key: blockKey(key),
    position,
    schemaVersion: 1,
    settings: {},
    type,
  });
}

export const noteV1 = defineBlock({
  fields: { body: field.text({ required: true }), image: field.media() },
  type: "note",
  version: 1,
});

export function noteV3(migrations: BlockMigrations = {}): BlockDefinition {
  return defineBlock({
    fields: { cover: field.media(), text: field.text({ required: true }) },
    migrations: {
      2: ({ data: { body, image, ...rest } }) => ({
        data: {
          ...rest,
          ...(image === undefined ? {} : { cover: image }),
          ...(body === undefined ? {} : { quote: body }),
        },
      }),
      3: ({ data: { quote, ...rest } }) => ({
        data: quote === undefined ? rest : { ...rest, text: quote },
      }),
      ...migrations,
    },
    type: "note",
    version: 3,
  });
}

/** A `posts` configuration whose blocks include one `note` definition. */
export async function noteConfig(note: BlockDefinition, version: number) {
  return defineConfig({
    blocks: [...Object.values(builtInBlocks), note],
    content: [
      defineCollection({
        blocks: ["richText", "note"],
        fields: { summary: field.text() },
        key: "posts",
        route: "/blog/:slug",
        version,
      }),
    ],
  });
}

type NoteConfig = Awaited<ReturnType<typeof noteConfig>>;

export async function prepareNotes(repository: ContractRepository, config: NoteConfig) {
  return prepareConfigurationSynchronization({
    blocks: config.runtime.blocks,
    models: config.runtime.content,
    state: repository,
  });
}

export async function syncNotes(
  repository: ContractRepository,
  config: NoteConfig,
  at: number,
  prepared?: Awaited<ReturnType<typeof prepareNotes>>,
) {
  return applyPreparedConfigurationSynchronization({
    blocks: config.runtime.blocks,
    clock: { now: () => unixMilliseconds(at) },
    ids: { next: sequence(`sync-${at}`) },
    models: config.runtime.content,
    prepared: prepared ?? (await prepareNotes(repository, config)),
    target: repository,
  });
}

export function note(key: string, data: JsonObject, position = 2000) {
  return Object.freeze({
    data,
    hidden: false,
    key: blockKey(key),
    position,
    schemaVersion: 1,
    settings: {},
    type: "note",
  });
}

export function richTextBlock(key: string) {
  return Object.freeze({
    data: { content: { content: [], type: "doc" } },
    hidden: false,
    key: blockKey(key),
    position: 1000,
    schemaVersion: 1,
    settings: {},
    type: "richText",
  });
}

export async function syncEvidenceState(sql: ContractSql) {
  return {
    models: await sql.all(
      "select key, config_version, structure_hash, structure_json is not null as has_baseline from content_models order by key",
    ),
    outbox: await count(sql, "select count(*) as count from outbox_events"),
    snapshots: await sql.all(
      "select id, revision, fields_json, updated_at from content_snapshots order by id",
    ),
    version: (await sql.get<{ version: number }>("select version from published_state"))?.version,
  };
}

export async function seedHintedEntries(
  repository: ContractRepository,
  sql: ContractSql,
): Promise<void> {
  for (const id of ["m-1", "m-2", "m-3"]) await seedMedia(sql, id);
  await repository.create({
    entry: entry("draft-only", "posts", {
      blocks: [
        richTextBlock("text-1"),
        block("img-1", "image", 2000, { alt: "Alt", media: "m-2" }),
        block("quote-1", "quote", 3000, { quote: "Q" }),
      ],
      fields: { cover: "m-1", headline: "Draft head", keep: "k", thumb: "m-3" },
      title: "Draft",
      updatedAt: 20,
    }),
    mediaReferences: [
      { fieldPath: "cover", mediaId: mediaId("m-1"), sourceKey: "$fields" },
      { fieldPath: "thumb", mediaId: mediaId("m-3"), sourceKey: "$fields" },
      { fieldPath: "media", mediaId: mediaId("m-2"), sourceKey: blockKey("img-1") },
    ],
  });
  await repository.create({
    entry: entry("live", "posts", {
      fields: { cover: "m-1", headline: "Live head" },
      slug: "live",
      title: "Live",
      updatedAt: 21,
    }),
    mediaReferences: [{ fieldPath: "cover", mediaId: mediaId("m-1"), sourceKey: "$fields" }],
  });
  await repository.publish(publish("live", 1, 22, "live-published"));
}

export async function hintedState(sql: ContractSql) {
  return {
    ...(await syncEvidenceState(sql)),
    blocks: await sql.all(
      "select snapshot_id, block_key, block_type, position, data_json from content_blocks order by snapshot_id, position",
    ),
    references: await sql.all(
      "select snapshot_id, source_key, field_path, media_id from content_media_references order by snapshot_id, source_key, field_path",
    ),
  };
}

export const hintedFieldsV1 = {
  cover: field.media(),
  headline: field.text(),
  keep: field.text(),
  thumb: field.media(),
};

export const conditionalFields = () => ({
  kind: field.select({ options: ["image", "video"], required: true, defaultValue: "image" }),
  media: field.media(),
  videoUrl: field.url({ required: true }),
});

export async function seedNoteEntries(
  repository: ContractRepository,
  sql: ContractSql,
): Promise<void> {
  for (const id of ["m-1", "m-2"]) await seedMedia(sql, id);
  await repository.create({
    entry: entry("draft-only", "posts", {
      blocks: [richTextBlock("text-1"), note("n1", { body: "Draft note", image: "m-1" })],
      title: "Draft",
      updatedAt: 20,
    }),
    mediaReferences: [{ fieldPath: "image", mediaId: mediaId("m-1"), sourceKey: blockKey("n1") }],
  });
  await repository.create({
    entry: entry("live", "posts", {
      blocks: [note("n1", { body: "Live" })],
      slug: "live",
      title: "Live",
      updatedAt: 21,
    }),
    mediaReferences: [],
  });
  await repository.publish(publish("live", 1, 22, "live-published"));
  await repository.create({
    entry: entry("changed", "posts", {
      blocks: [note("n1", { body: "Old" })],
      slug: "changed",
      title: "Changed",
      updatedAt: 23,
    }),
    mediaReferences: [],
  });
  await repository.publish(publish("changed", 1, 24, "changed-published"));
  await repository.saveCompleteDraft(
    save("changed", 1, 25, { blocks: [note("n1", { body: "New" })], slug: "changed" }),
  );
}

export async function noteState(sql: ContractSql) {
  return {
    ...(await syncEvidenceState(sql)),
    blocks: await sql.all(
      "select snapshot_id, block_key, block_type, position, schema_version, data_json from content_blocks order by snapshot_id, position",
    ),
    references: await sql.all(
      "select snapshot_id, source_key, field_path, media_id from content_media_references order by snapshot_id, source_key, field_path",
    ),
    updatedBy: await sql.all("select id, updated_by from content_snapshots order by id"),
  };
}

export async function openNotes(runtime: RepositoryContractRuntime) {
  const v1 = await noteConfig(noteV1, 1);
  const harness = await runtime.open({ resolveModel: syncResolver(v1.runtime.content) });
  await syncNotes(harness.repository, v1, 10);
  await seedNoteEntries(harness.repository, harness.sql);
  return harness;
}
