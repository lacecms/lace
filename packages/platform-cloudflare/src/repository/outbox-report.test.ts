import { afterEach, expect, test } from "vitest";
import { publicationIdempotencyKey, publicationRequestFingerprint } from "@lacecms/application";
import {
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  mediaId,
  siteBuildId,
  unixMilliseconds,
  type Actor,
  type ContentBlock,
} from "@lacecms/domain";
import { openLocalD1 } from "../test-support/d1-test-harness.js";
import { D1ContentRepository, type D1RepositoryOptions } from "./repository.js";

const editor: Actor = { id: actorId("editor"), role: "admin" };
const posts = { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" } as const;
const disposals: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const dispose of disposals.splice(0)) await dispose();
});

async function open(options: D1RepositoryOptions = {}) {
  const { database, dispose } = await openLocalD1();
  disposals.push(dispose);
  await database
    .prepare(
      "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values ('posts', 'collection', 'Posts', 1, 'structure', 'projection', 1, 1)",
    )
    .run();
  let reports = 0;
  const repository = new D1ContentRepository(
    database,
    (key) => (key === "posts" ? posts : undefined),
    { ...options, onOutboxWork: () => void (reports += 1) },
  );
  return {
    database,
    repository,
    /** Returns the reports counted since the previous call. */
    reports: () => {
      const counted = reports;
      reports = 0;
      return counted;
    },
    sql: (statement: string) => database.prepare(statement).run(),
  };
}

type Opened = Awaited<ReturnType<typeof open>>;

function block(key: string): ContentBlock {
  return {
    data: { image: "media-1" },
    hidden: false,
    key: blockKey(key),
    position: 1000,
    schemaVersion: 1,
    settings: {},
    type: "image",
  } as unknown as ContentBlock;
}

async function createPost({ repository }: Opened, id: string, blocks: readonly ContentBlock[]) {
  const entryId = contentEntryId(id);
  await repository.create({
    entry: createContentEntry({
      draft: {
        blocks,
        createdAt: unixMilliseconds(1),
        entryId,
        fields: {},
        id: contentSnapshotId(`${id}-draft`),
        revision: 1,
        slug: id,
        state: "draft",
        title: id,
        updatedAt: unixMilliseconds(1),
        updatedBy: editor,
      },
      id: entryId,
      model: posts,
    }),
    mediaReferences: blocks.map((item) => ({
      fieldPath: "/image",
      mediaId: mediaId("media-1"),
      sourceKey: item.key,
    })),
  });
}

function publishInput(id: string, at: number, idempotent = false) {
  return {
    entryId: contentEntryId(id),
    expectedRevision: 1,
    publishedAt: unixMilliseconds(at),
    publishedBy: editor,
    publishedSnapshotId: contentSnapshotId(`${id}-published`),
    ...(idempotent
      ? {
          idempotency: {
            actorId: editor.id,
            fingerprint: publicationRequestFingerprint("fingerprint"),
            key: publicationIdempotencyKey("publication-key"),
          },
        }
      : {}),
  };
}

async function createMedia({ repository }: Opened, id: string) {
  return repository.createMedia({
    createdAt: unixMilliseconds(1),
    createdBy: editor.id,
    filename: `${id}.png`,
    height: 1,
    id: mediaId(id),
    mimeType: "image/png",
    size: 1,
    storageKey: `media/${id}`,
    width: 1,
  });
}

function metadataUpdate(id: string, expectedUpdatedAt: number, updatedAt: number) {
  return {
    alt: `alt ${updatedAt}`,
    caption: null,
    expectedUpdatedAt: unixMilliseconds(expectedUpdatedAt),
    focalPoint: null,
    mediaId: mediaId(id),
    requestedBy: editor,
    updatedAt: unixMilliseconds(updatedAt),
  };
}

/** Marks queued events processed so the next enqueue inserts instead of coalescing. */
const drainOutbox = (opened: Opened) =>
  opened.sql("update outbox_events set processed_at = 1 where processed_at is null");

test("a batch reports once when an outbox statement changes a row", async () => {
  const opened = await open();
  await opened.repository.requestBuild({ requestedAt: unixMilliseconds(10), requestedBy: editor });
  expect(opened.reports()).toBe(1);
  // The second request coalesces into the pending event: the update changes a row.
  await opened.repository.requestBuild({ requestedAt: unixMilliseconds(20), requestedBy: editor });
  expect(opened.reports()).toBe(1);
});

test("a batch whose guard fails reports nothing", async () => {
  const opened = await open();
  await expect(
    opened.repository.requestBuild({
      requestedAt: unixMilliseconds(10),
      requestedBy: editor,
      retryOfBuildId: siteBuildId("missing"),
    }),
  ).rejects.toThrow();
  expect(opened.reports()).toBe(0);
});

test("a thrown batch reports nothing", async () => {
  const opened = await open({
    beforeMutation: (checkpoint) => {
      if (checkpoint === "build-outbox") throw new Error("injected");
    },
  });
  await createPost(opened, "post", []);
  await expect(opened.repository.publish(publishInput("post", 2))).rejects.toThrow();
  expect(opened.reports()).toBe(0);
});

test("publication, unpublication and deletion report committed outbox work", async () => {
  const opened = await open();
  const { repository } = opened;
  await createPost(opened, "first", []);
  expect(opened.reports()).toBe(0);
  await repository.publish(publishInput("first", 2, true));
  expect(opened.reports()).toBe(1);
  // A stored idempotency result replays without a batch.
  expect((await repository.publish(publishInput("first", 3, true))).outcome).toBe("replayed");
  expect(opened.reports()).toBe(0);
  await expect(
    repository.publish({ ...publishInput("first", 4), expectedRevision: 9 }),
  ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  expect(opened.reports()).toBe(0);

  await drainOutbox(opened);
  await repository.unpublish({
    entryId: contentEntryId("first"),
    expectedPublishedSnapshotId: contentSnapshotId("first-published"),
    unpublishedAt: unixMilliseconds(5),
    unpublishedBy: editor,
  });
  expect(opened.reports()).toBe(1);

  await createPost(opened, "second", []);
  await repository.publish(publishInput("second", 6));
  expect(opened.reports()).toBe(1);
  await drainOutbox(opened);
  await repository.delete({
    deletedAt: unixMilliseconds(7),
    deletedBy: editor,
    entryId: contentEntryId("second"),
    expectedPublishedSnapshotId: contentSnapshotId("second-published"),
    expectedRevision: 1,
  });
  expect(opened.reports()).toBe(1);
});

test("media metadata reports work only when a publication uses the media", async () => {
  const opened = await open();
  const unused = await createMedia(opened, "media-1");
  await opened.repository.updateMediaMetadata(metadataUpdate("media-1", unused.updatedAt, 5));
  expect(opened.reports()).toBe(0);

  await createPost(opened, "post", [block("hero")]);
  await opened.repository.publish(publishInput("post", 6));
  expect(opened.reports()).toBe(1);
  await drainOutbox(opened);
  await opened.repository.updateMediaMetadata(metadataUpdate("media-1", 5, 7));
  expect(opened.reports()).toBe(1);
});

test("build requests, build retries and media deletions report committed outbox work", async () => {
  const opened = await open();
  await opened.repository.requestBuild({ requestedAt: unixMilliseconds(10), requestedBy: editor });
  expect(opened.reports()).toBe(1);
  await drainOutbox(opened);
  await opened.sql(
    "insert into site_builds (id, reason, status, target_version, requested_by, requested_at) values ('failed-build', 'manual', 'failed', 0, 'editor', 1)",
  );
  await opened.repository.requestBuild({
    requestedAt: unixMilliseconds(20),
    requestedBy: editor,
    retryOfBuildId: siteBuildId("failed-build"),
  });
  expect(opened.reports()).toBe(1);

  await createMedia(opened, "media-2");
  await opened.repository.markForDeletion({
    mediaId: mediaId("media-2"),
    requestedAt: unixMilliseconds(30),
    requestedBy: editor,
  });
  expect(opened.reports()).toBe(1);
  await opened.sql("update media set status = 'delete_failed' where id = 'media-2'");
  await opened.repository.retryDeletion({
    mediaId: mediaId("media-2"),
    requestedAt: unixMilliseconds(40),
    requestedBy: editor,
  });
  expect(opened.reports()).toBe(1);
});

test("build lease and outcome changes never report committed enqueue work", async () => {
  const { repository, reports } = await open();
  await repository.requestBuild({ requestedAt: unixMilliseconds(1), requestedBy: editor });
  expect(reports()).toBe(1);

  const now = unixMilliseconds(5_001);
  const [lease] = await repository.claimSiteBuilds({ limit: 1, now });
  expect(lease).toBeDefined();
  expect(reports()).toBe(0);
  expect(await repository.renewSiteBuildLease({ leaseId: lease!.id, now })).toBe(true);
  expect(reports()).toBe(0);
  await repository.recordSiteBuildSuccess({ leaseId: lease!.id, now });
  expect(reports()).toBe(0);
});
