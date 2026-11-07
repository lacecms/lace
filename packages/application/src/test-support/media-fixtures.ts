import { MediaUseCases } from "../media/use-cases.js";
import { actorId, mediaId, unixMilliseconds } from "@lacecms/domain";
import type { Actor, MediaMetadata } from "@lacecms/domain";
import type { MediaUseCaseDependencies } from "../media/types.js";
import type { ByteStream, ObjectStorage, MediaCatalogItem } from "../ports/media.js";

type MediaPort = MediaUseCaseDependencies["media"];
function fakePort<T extends object>(partial: Partial<T>): T {
  return new Proxy(partial, {
    get(target, key, receiver) {
      if (Reflect.has(target, key)) return Reflect.get(target, key, receiver);
      throw new Error(`Unexpected port call: ${String(key)}`);
    },
  }) as T;
}

export const mediaEditor: Actor = { id: actorId("editor-1"), role: "editor" };

export const mediaViewer: Actor = { id: actorId("viewer-1"), role: "viewer" };

export const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

export function mediaRecord(overrides: Partial<MediaMetadata> = {}): MediaMetadata {
  return {
    tags: [],
    createdAt: unixMilliseconds(1),
    createdBy: actorId("editor-1"),
    filename: "cover.png",
    height: 2,
    id: mediaId("media-1"),
    mimeType: "image/png",
    size: 12,
    status: "active",
    storageKey: "media/media-1",
    updatedAt: unixMilliseconds(1),
    width: 3,
    ...overrides,
  };
}

export function catalogItem(overrides: Partial<MediaMetadata> = {}): MediaCatalogItem {
  return {
    createdBy: { displayName: "Ada", id: actorId("editor-1") },
    media: mediaRecord(overrides),
    usageCount: 0,
  };
}

export function mediaUseCases(
  media: Partial<MediaPort>,
  overrides: Omit<Partial<MediaUseCaseDependencies>, "storage"> & {
    storage?: Partial<ObjectStorage>;
  } = {},
) {
  const { storage, ...rest } = overrides;
  return new MediaUseCases({
    clock: { now: () => unixMilliseconds(5) },
    idGenerator: { next: () => "media-1" },
    imageInspector: { inspect: async () => ({ height: 2, width: 3 }) },
    logger: { error() {} },
    media: fakePort(media),
    storage: fakePort<ObjectStorage>({
      async delete() {},
      async get() {
        return null;
      },
      async put(input) {
        return { contentType: input.contentType, key: input.key, size: pngBytes.byteLength };
      },
    }),
    ...rest,
    ...(storage === undefined ? {} : { storage: fakePort<ObjectStorage>(storage) }),
  });
}

export function bytes(value: Uint8Array): ByteStream {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    },
  };
}
