import type { Actor, ContentBlock, ContentBlockInput, ContentModelRoute } from "@lacecms/domain";
import type { JsonObject } from "@lacecms/content";
import type { NormalizedContentModel, RuntimeConfigProjection } from "@lacecms/config";
import type { CompleteDraftInput } from "@lacecms/application";
import { expect } from "vitest";
import {
  DeterministicClock,
  DeterministicIdGenerator,
  InMemoryContentStore,
  InMemoryObjectStorage,
} from "../index.js";
import {
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import {
  applyPreparedConfigurationSynchronization,
  prepareConfigurationSynchronization,
} from "@lacecms/application";
import { ContentUseCases, MediaUseCases } from "@lacecms/application";
import { defineCollection, defineConfig, defineGlobal, definePage } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";

export const admin: Actor = { id: actorId("admin"), role: "admin" };

export const editor: Actor = { id: actorId("editor"), role: "editor" };

export function stream(text: string) {
  const bytes = new TextEncoder().encode(text);
  return {
    async *[Symbol.asyncIterator]() {
      yield bytes;
    },
  };
}

export async function read(streamValue: AsyncIterable<Uint8Array>) {
  const chunks = [];
  for await (const chunk of streamValue) chunks.push(...chunk);
  return new TextDecoder().decode(new Uint8Array(chunks));
}

export function binaryStream(bytes: Uint8Array) {
  return {
    async *[Symbol.asyncIterator]() {
      yield bytes;
    },
  };
}

export const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function entry({
  id,
  model,
  slug,
  title = "Original",
}: {
  id: string;
  model: ContentModelRoute;
  slug?: string;
  title?: string;
}) {
  return createContentEntry({
    id: contentEntryId(id),
    model,
    draft: {
      blocks: [
        {
          data: { body: title },
          hidden: false,
          settings: {},
          key: blockKey(`${id}-block`),
          position: 1000,
          schemaVersion: 1,
          type: "richText",
        },
      ],
      createdAt: unixMilliseconds(1),
      entryId: contentEntryId(id),
      fields: { body: title },
      id: contentSnapshotId(`${id}-draft`),
      revision: 1,
      ...(slug === undefined ? {} : { slug }),
      state: "draft",
      title,
      updatedAt: unixMilliseconds(1),
      updatedBy: editor,
    },
  });
}

export function savedMutation(revision: number, title: string, slug: string) {
  return {
    blocks: [
      {
        data: { body: title },
        hidden: false,
        settings: {},
        key: blockKey(`${title}-block`),
        position: 1000,
        schemaVersion: 1,
        type: "richText",
      },
    ],
    expectedRevision: revision,
    mediaReferences: [],
    fields: { body: title },
    slug,
    title,
    updatedAt: unixMilliseconds(revision + 1),
    updatedBy: editor,
  };
}

export async function lifecycleFixture() {
  const config = await defineConfig({
    blocks: [
      defineBlock({
        fields: { image: field.media({ required: true }) },
        type: "asset",
        version: 1,
      }),
    ],
    content: [
      definePage({ blocks: [], fields: {}, key: "home", path: "/", version: 1 }),
      defineCollection({
        blocks: ["asset"],
        fields: { cover: field.media(), summary: field.text() },
        key: "posts",
        route: "/blog/:slug",
        version: 1,
      }),
      defineGlobal({
        blocks: ["asset"],
        fields: { logo: field.media(), siteName: field.text({ required: true }) },
        key: "settings",
        label: "Site settings",
        version: 1,
      }),
    ],
  });
  const store = new InMemoryContentStore();
  for (const id of ["media-1", "media-2", "media-3"]) {
    await store.createMedia({
      createdAt: unixMilliseconds(1),
      createdBy: admin.id,
      filename: `${id}.png`,
      height: 1,
      id: mediaId(id),
      mimeType: "image/png",
      size: 1,
      storageKey: `media/${id}.png`,
      width: 1,
    });
  }
  const useCases = new ContentUseCases({
    clock: new DeterministicClock(unixMilliseconds(10)),
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator("lifecycle"),
    media: store,
  });
  const post = (title: string, slug: string, image = "media-1") => ({
    blocks: [
      {
        data: { image },
        hidden: false,
        settings: {},
        key: blockKey("hero"),
        position: 1000,
        schemaVersion: 1,
        type: "asset",
      },
    ],
    fields: { cover: image, summary: title },
    slug,
    title,
  });
  return { config, post, store, useCases };
}

export async function syncedGlobal(
  config: Pick<RuntimeConfigProjection, "content">,
  store: InMemoryContentStore,
) {
  const prepared = await prepareConfigurationSynchronization({
    models: config.content,
    state: store,
  });
  await applyPreparedConfigurationSynchronization({
    clock: new DeterministicClock(unixMilliseconds(5)),
    ids: new DeterministicIdGenerator("sync"),
    models: config.content,
    prepared,
    target: store,
  });
  const page = await store.list({
    limit: 10,
    listFields: [],
    modelKey: contentModelKey("settings"),
    sort: "-updatedAt",
  });
  const first = page.items[0];
  expect(first).toBeDefined();
  if (first === undefined) throw new Error("Expected global singleton");
  return first.id;
}

export const postsRoute: ContentModelRoute = {
  key: contentModelKey("posts"),
  kind: "collection",
  route: "/blog/:slug",
};

export function mediaUsageEntry(
  id: string,
  {
    blocks = [],
    fields = {},
    updatedAt,
  }: { blocks?: readonly ContentBlock[]; fields?: JsonObject; updatedAt: number },
) {
  const entryId = contentEntryId(id);
  return createContentEntry({
    id: entryId,
    model: postsRoute,
    draft: {
      blocks,
      createdAt: unixMilliseconds(updatedAt),
      entryId,
      fields,
      id: contentSnapshotId(`${id}-draft`),
      revision: 1,
      slug: id,
      state: "draft",
      title: `Title ${id}`,
      updatedAt: unixMilliseconds(updatedAt),
      updatedBy: editor,
    },
  });
}

export function imageBlock(key: string, type: string, position: number, image: string) {
  return {
    data: { image },
    hidden: false,
    settings: {},
    key: blockKey(key),
    position,
    schemaVersion: 1,
    type,
  };
}

export function seedMediaCatalog(store: InMemoryContentStore) {
  store.setActorDisplayNames({ editor: "Ada" });
  for (const [id, filename, mimeType, size, createdAt, createdBy] of [
    ["m-a", "Cover.png", "image/png", 30, 10, "editor"],
    ["m-b", "cover-2.jpg", "image/jpeg", 10, 11, "gone"],
    ["m-c", "100% _off_ 'deal'.webp", "image/webp", 20, 12, "system:content-sync"],
    ["m-d", "banner.png", "image/png", 20, 12, "editor"],
    ["m-e", "cover.png", "image/png", 30, 10, "editor"],
  ] as const) {
    store.registerMedia({
      createdAt: unixMilliseconds(createdAt),
      createdBy: actorId(createdBy),
      filename,
      height: 2,
      id: mediaId(id),
      mimeType,
      size,
      status: "active",
      storageKey: `media/${id}`,
      tags: [],
      updatedAt: unixMilliseconds(createdAt),
      width: 3,
    });
  }
}

export async function seoConfig({ posts = {}, notes = {} } = {}) {
  return defineConfig({
    content: [
      defineCollection({
        fields: { cover: field.media(), summary: field.textarea() },
        key: "posts",
        route: "/blog/:slug",
        seo: { description: "summary", image: "cover" },
        version: 1,
        ...posts,
      }),
      defineCollection({
        fields: { summary: field.text() },
        key: "notes",
        route: "/notes/:slug",
        version: 1,
        ...notes,
      }),
    ],
  });
}

export async function seoFixture(prefix = "seo") {
  const config = await seoConfig();
  const store = new InMemoryContentStore();
  for (const id of ["media-1", "media-2"]) {
    await store.createMedia({
      createdAt: unixMilliseconds(1),
      createdBy: admin.id,
      filename: `${id}.png`,
      height: 1,
      id: mediaId(id),
      mimeType: "image/png",
      size: 1,
      storageKey: `media/${id}.png`,
      width: 1,
    });
  }
  const useCases = new ContentUseCases({
    clock: new DeterministicClock(unixMilliseconds(10)),
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator(prefix),
    media: store,
  });
  const sync = async (models: readonly NormalizedContentModel[]) => {
    const prepared = await prepareConfigurationSynchronization({ models, state: store });
    if (!prepared.plan.isValid) return prepared;
    await applyPreparedConfigurationSynchronization({
      clock: new DeterministicClock(unixMilliseconds(20)),
      ids: new DeterministicIdGenerator(`${prefix}-sync`),
      models,
      prepared,
      target: store,
    });
    return prepared;
  };
  await sync(config.runtime.content);
  return { config, store, sync, useCases };
}

export const seoPost = (title: string, slug: string, seo?: unknown) => ({
  blocks: [],
  fields: { summary: title },
  ...(seo === undefined ? {} : { seo }),
  slug,
  title,
});

export const panelBlock = defineBlock({
  fields: { heading: field.text({ required: true }), image: field.media() },
  settings: {
    align: field.select({ defaultValue: "left", options: ["left", "center"] }),
    boxed: field.boolean({ defaultValue: false }),
  },
  type: "panel",
  version: 1,
});

export async function envelopeFixture(prefix = "envelope") {
  const config = await defineConfig({
    blocks: [panelBlock],
    content: [
      defineCollection({ blocks: ["panel"], key: "posts", route: "/blog/:slug", version: 1 }),
    ],
  });
  const store = new InMemoryContentStore();
  for (const id of ["media-1", "media-2"]) {
    await store.createMedia({
      createdAt: unixMilliseconds(1),
      createdBy: admin.id,
      filename: `${id}.png`,
      height: 1,
      id: mediaId(id),
      mimeType: "image/png",
      size: 1,
      storageKey: `media/${id}.png`,
      width: 1,
    });
  }
  const useCases = new ContentUseCases({
    clock: new DeterministicClock(unixMilliseconds(10)),
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator(prefix),
    media: store,
  });
  const prepared = await prepareConfigurationSynchronization({
    models: config.runtime.content,
    state: store,
  });
  await applyPreparedConfigurationSynchronization({
    clock: new DeterministicClock(unixMilliseconds(5)),
    ids: new DeterministicIdGenerator(`${prefix}-sync`),
    models: config.runtime.content,
    prepared,
    target: store,
  });
  return { store, useCases };
}

export const panel = (
  key: string,
  position: number,
  envelope: Partial<Pick<ContentBlock, "anchor" | "className" | "hidden" | "settings">> = {},
  data: JsonObject = { heading: key },
) => ({
  data,
  key: blockKey(key),
  hidden: false,
  settings: {},
  position,
  schemaVersion: 1,
  type: "panel",
  ...envelope,
});

export const envelopePost = (blocks: readonly ContentBlockInput[]) => ({
  blocks,
  fields: {},
  slug: "a",
  title: "A",
});

export async function detachFixture() {
  const config = await defineConfig({
    blocks: [
      defineBlock({
        fields: { image: field.media({ required: true }) },
        type: "asset",
        version: 1,
      }),
      defineBlock({
        fields: {
          images: field.list({
            item: field.group({ fields: { caption: field.text(), image: field.media() } }),
          }),
        },
        type: "gallery",
        version: 1,
      }),
    ],
    content: [
      defineCollection({
        blocks: ["asset", "gallery"],
        fields: { cover: field.media(), photos: field.list({ item: field.media() }) },
        key: "posts",
        route: "/blog/:slug",
        seo: {},
        version: 1,
      }),
    ],
  });
  const store = new InMemoryContentStore();
  for (const id of ["media-1", "media-2"]) {
    await store.createMedia({
      createdAt: unixMilliseconds(1),
      createdBy: admin.id,
      filename: `${id}.png`,
      height: 1,
      id: mediaId(id),
      mimeType: "image/png",
      size: 1,
      storageKey: `media/${id}.png`,
      width: 1,
    });
  }
  const content = new ContentUseCases({
    clock: new DeterministicClock(unixMilliseconds(10)),
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator("detach"),
    media: store,
  });
  const mediaDependencies = {
    clock: new DeterministicClock(unixMilliseconds(20)),
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: { inspect: async () => ({ height: 1, width: 1 }) },
    logger: { error() {} },
    media: store,
    storage: new InMemoryObjectStorage(),
  };
  const media = new MediaUseCases({ ...mediaDependencies, drafts: content });
  const create = (slug: string, input: Partial<CompleteDraftInput> = {}) =>
    content.create({
      actor: editor,
      fields: {},
      blocks: [],
      slug,
      title: slug,
      ...input,
      modelKey: "posts",
    });
  const asset = (key: string, image: string, position = 1000, hidden = false) => ({
    data: { image },
    hidden,
    key: blockKey(key),
    position,
    schemaVersion: 1,
    type: "asset",
  });
  return { asset, content, create, media, mediaDependencies, store };
}

/** Assert a test fixture or lookup exists and narrow it for subsequent assertions. */
export function present<T>(value: T | null | undefined): T {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
  if (value === undefined || value === null) throw new Error("Expected a value");
  return value;
}
