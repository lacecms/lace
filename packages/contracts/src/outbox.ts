import * as v from "valibot";

export const SITE_BUILD_REQUESTED = "site.build.requested";
export const MEDIA_DELETE_REQUESTED = "media.delete.requested";

const nonempty = v.pipe(v.string(), v.nonEmpty());
const safeInteger = v.pipe(v.number(), v.safeInteger());
const targetVersion = v.pipe(safeInteger, v.minValue(0));
const publishedSnapshotId = v.nullable(nonempty);

const buildRequest = {
  reason: nonempty,
  requestedAt: safeInteger,
  requestedBy: nonempty,
  retryOfBuildId: v.exactOptional(nonempty),
};

function describeEvent<
  const Type extends string,
  const Enqueue extends v.GenericSchema,
  const Read extends v.GenericSchema,
>(type: Type, enqueueSchema: Enqueue, readSchema: Read) {
  function decode(input: unknown): v.InferOutput<Read> | null {
    const parsed = v.safeParse(readSchema, input);
    return parsed.success ? parsed.output : null;
  }

  return {
    type,
    version: 1 as const,
    enqueueSchema,
    readSchema,
    decode,
    decodeJson(json: string): v.InferOutput<Read> | null {
      let value: unknown;
      try {
        value = JSON.parse(json);
      } catch {
        return null;
      }
      return decode(value);
    },
    parseEnqueue(input: unknown): v.InferOutput<Enqueue> {
      return v.parse(enqueueSchema, input);
    },
  };
}

export const outboxEvents = {
  [SITE_BUILD_REQUESTED]: describeEvent(
    SITE_BUILD_REQUESTED,
    v.object({ ...buildRequest, publishedSnapshotId }),
    v.object({
      ...buildRequest,
      publishedSnapshotId: v.exactOptional(publishedSnapshotId),
      targetVersion,
    }),
  ),
  [MEDIA_DELETE_REQUESTED]: describeEvent(
    MEDIA_DELETE_REQUESTED,
    v.object({ mediaId: nonempty, requestedBy: nonempty }),
    v.object({ mediaId: nonempty, requestedBy: v.exactOptional(nonempty) }),
  ),
} as const;

type OutboxRegistry = typeof outboxEvents;

export type RegisteredOutboxType = keyof OutboxRegistry;
export type OutboxPayload<Type extends RegisteredOutboxType> = v.InferOutput<
  OutboxRegistry[Type]["readSchema"]
>;
export type OutboxEnqueuePayload<Type extends RegisteredOutboxType> = v.InferOutput<
  OutboxRegistry[Type]["enqueueSchema"]
>;
export type RegisteredOutboxEvent = {
  [Type in RegisteredOutboxType]: { readonly type: Type; readonly payload: OutboxPayload<Type> };
}[RegisteredOutboxType];
