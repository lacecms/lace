import { describe, expect, it } from "vitest";
import { defineCollection, defineConfig } from "@lacecms/config";
import { defineBlock, encodeEntryLink, field } from "@lacecms/content";
import {
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import type { Actor, ContentEntry, DraftSnapshot } from "@lacecms/domain";
import type { JsonValue } from "@lacecms/content";
import type { PublishContentEntryCommand } from "../ports/content.js";
import type { ContentUseCaseDependencies } from "./use-case-inputs.js";
import { contentPort } from "../test-support/content-port.js";
import { mediaRecord } from "../test-support/media-fixtures.js";
import { ContentUseCases, ContentValidationError } from "../index.js";

const kind = () =>
  field.select({ options: ["image", "video"], required: true, defaultValue: "image" });
const item = field.group({
  fields: {
    kind: kind(),
    media: field.media({ required: true }),
    videoUrl: field.url({ required: true }),
    link: field.url(),
  },
  visibility: {
    media: { field: "kind", values: ["image"] },
    videoUrl: { field: "kind", values: ["video"] },
    link: { field: "kind", values: ["video"] },
  },
});
const mediaBlock = defineBlock({
  type: "feature",
  version: 1,
  fields: {
    kind: kind(),
    media: field.media({ required: true }),
    caption: field.text({ defaultValue: "Hidden default" }),
  },
  visibility: {
    media: { field: "kind", values: ["image"] },
    caption: { field: "kind", values: ["video"] },
  },
});
const plainBlock = defineBlock({
  type: "plain",
  version: 1,
  fields: { media: field.media(), url: field.url() },
});
const config = await defineConfig({
  blocks: [mediaBlock, plainBlock],
  content: [
    defineCollection({
      key: "works",
      version: 1,
      route: "/works/:slug",
      blocks: ["feature", "plain"],
      fields: {
        hasCta: field.boolean(),
        ctaUrl: field.url({ required: true }),
        gallery: field.list({ item }),
      },
      visibility: { ctaUrl: { field: "hasCta", values: [true] } },
    }),
    defineCollection({
      key: "notes",
      version: 1,
      route: "/notes/:slug",
      blocks: ["plain"],
      fields: { cover: field.media(), related: field.url() },
    }),
  ],
});

const actor: Actor = { id: actorId("user"), role: "admin" };
const IMAGE = "media-image";
const STALE = "media-stale";

function draftOf<T extends Partial<DraftSnapshot>>(input: T) {
  const base: DraftSnapshot = {
    id: contentSnapshotId("draft-1"),
    entryId: contentEntryId("entry-1"),
    revision: 3,
    state: "draft" as const,
    createdAt: unixMilliseconds(1),
    updatedAt: unixMilliseconds(1),
    updatedBy: actor,
    title: "Work",
    slug: "work",
    fields: {},
    blocks: [],
  };
  return { ...base, ...input };
}

function harness(
  draft: DraftSnapshot,
  modelKey = "works",
  targets: Awaited<
    ReturnType<NonNullable<ContentUseCaseDependencies["content"]["resolveLinkTargets"]>>
  > = {},
) {
  const commands: PublishContentEntryCommand[] = [];
  const entry: ContentEntry = {
    id: contentEntryId("entry-1"),
    model: { key: contentModelKey(modelKey), kind: "collection", route: `/${modelKey}/:slug` },
    draft,
  };
  const cases = new ContentUseCases({
    config: config.runtime,
    clock: { now: () => unixMilliseconds(10) },
    idGenerator: { next: () => "snapshot-2" },
    media: {
      loadMedia: async () => {
        throw new Error("Unexpected loadMedia");
      },
      loadMediaMany: async (ids) => ids.map((id) => mediaRecord({ id: mediaId(id) })),
    },
    content: contentPort({
      load: async () => entry,
      publish: async (command) => {
        commands.push(command);
        return {
          entry,
          status: "published",
          outcome: "published",
          targetVersion: 2,
        };
      },
      resolveLinkTargets: async () => targets,
    }),
  });
  const publish = (expectedRevision = 3) =>
    cases.publish({ actor, entryId: contentEntryId("entry-1"), expectedRevision });
  return { commands, publish };
}

function issueOf(error: unknown) {
  expect(error).toBeInstanceOf(ContentValidationError);
  if (!(error instanceof ContentValidationError)) throw error;
  return error.issues[0];
}

const galleryDraft = () =>
  draftOf({
    fields: {
      hasCta: false,
      ctaUrl: encodeEntryLink("unpublished"),
      gallery: [
        { kind: "image", media: IMAGE, videoUrl: "https://example.com/stale" },
        {
          kind: "video",
          media: STALE,
          videoUrl: "https://example.com/v",
          link: encodeEntryLink("published"),
        },
      ],
    },
    blocks: [
      {
        key: blockKey("b1"),
        position: 1,
        schemaVersion: 1,
        type: "feature",
        data: { kind: "image", media: IMAGE, caption: "Stale" },
        hidden: false,
        settings: {},
      },
      {
        key: blockKey("b2"),
        position: 2,
        schemaVersion: 1,
        type: "feature",
        data: { kind: "video", media: STALE },
        hidden: true,
        settings: {},
      },
      {
        key: blockKey("b3"),
        position: 3,
        schemaVersion: 1,
        type: "plain",
        data: { media: IMAGE },
        hidden: false,
        settings: {},
      },
    ],
  });

describe("conditional publication", () => {
  it("publishes the projection of fields, every block and their references", async () => {
    const draft = galleryDraft();
    const { commands, publish } = harness(draft, "works", {
      published: {
        id: "published",
        state: "published",
        modelKey: "notes",
        modelKind: "collection",
        title: "P",
        path: "/notes/p",
      },
    });
    await publish();
    const [command] = commands;
    if (!command?.projection) throw new Error("Expected publication projection");
    expect(command.expectedRevision).toBe(3);
    expect(command.projection.fields).toEqual({
      hasCta: false,
      gallery: [
        { kind: "image", media: IMAGE },
        { kind: "video", videoUrl: "https://example.com/v", link: encodeEntryLink("published") },
      ],
    });
    expect(command.projection.blocks).toEqual([
      { key: blockKey("b1"), data: { kind: "image", media: IMAGE } },
      { key: blockKey("b2"), data: { kind: "video", caption: "Hidden default" } },
      { key: blockKey("b3"), data: { media: IMAGE } },
    ]);
    expect(command.projection.mediaReferences).toEqual([
      { fieldPath: "/gallery/0/media", mediaId: IMAGE, sourceKey: "$fields" },
      { fieldPath: "media", mediaId: IMAGE, sourceKey: "b1" },
      { fieldPath: "media", mediaId: IMAGE, sourceKey: "b3" },
    ]);
    expect(command.projection.internalLinks).toEqual([
      {
        area: "fields",
        delivered: true,
        pointer: "/gallery/1/link",
        sourceKey: "$fields",
        targetId: "published",
      },
    ]);
    // The draft keeps every hidden value; the use case never rewrites it.
    expect(draft.fields.gallery[1]?.media).toBe(STALE);
  });

  it("does not check hidden links but still checks visible ones", async () => {
    const hidden = harness(galleryDraft(), "works", {
      published: {
        id: "published",
        state: "published",
        modelKey: "notes",
        modelKind: "collection",
        title: "P",
        path: "/notes/p",
      },
    });
    await expect(hidden.publish()).resolves.toMatchObject({ publication: "published" });
    const draft = galleryDraft();
    const visible = harness({ ...draft, fields: { ...draft.fields, hasCta: true } }, "works", {
      published: {
        id: "published",
        state: "published",
        modelKey: "notes",
        modelKind: "collection",
        title: "P",
        path: "/notes/p",
      },
    });
    const issue = await visible.publish().then(
      () => undefined,
      (error) => issueOf(error),
    );
    expect(issue).toMatchObject({ code: "internal_link_unavailable", path: ["fields", "ctaUrl"] });
    expect(visible.commands).toEqual([]);
  });

  it("refuses a stale revision before attaching a projection", async () => {
    const { commands, publish } = harness(galleryDraft(), "works", {
      published: {
        id: "published",
        state: "published",
        modelKey: "notes",
        modelKind: "collection",
        title: "P",
        path: "/notes/p",
      },
    });
    await expect(publish(2)).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
    expect(commands).toEqual([]);
  });

  it("keeps the copy path for content without rules", async () => {
    const { commands, publish } = harness(
      draftOf({
        fields: { cover: IMAGE },
        blocks: [
          {
            key: blockKey("b1"),
            position: 1,
            schemaVersion: 1,
            type: "plain",
            data: { media: IMAGE },
            hidden: false,
            settings: {},
          },
        ],
      }),
      "notes",
    );
    await publish();
    expect(commands[0]).not.toHaveProperty("projection");
  });

  it("enforces visible required targets with exact paths on the server", async () => {
    const draft = galleryDraft();
    const firstItem = draft.fields.gallery[0];
    const firstBlock = draft.blocks[0];
    if (!firstItem || !firstBlock) throw new Error("Expected draft fixtures");
    const missing = harness(
      {
        ...draft,
        fields: {
          ...draft.fields,
          gallery: [firstItem, { kind: "video" }],
        },
      },
      "works",
      {
        published: {
          id: "published",
          state: "published",
          modelKey: "notes",
          modelKind: "collection",
          title: "P",
          path: "/notes/p",
        },
      },
    );
    const issue = await missing.publish().then(
      () => undefined,
      (error) => issueOf(error),
    );
    expect(issue).toMatchObject({
      code: "missing_required_field",
      path: ["fields", "gallery", 1, "videoUrl"],
    });
    const block = harness(
      { ...draft, blocks: [{ ...firstBlock, data: { kind: "image" } }] },
      "works",
      {
        published: {
          id: "published",
          state: "published",
          modelKey: "notes",
          modelKind: "collection",
          title: "P",
          path: "/notes/p",
        },
      },
    );
    const blockIssue = await block.publish().then(
      () => undefined,
      (error) => issueOf(error),
    );
    expect(blockIssue).toMatchObject({
      code: "missing_required_field",
      path: ["blocks", 0, "data", "media"],
    });
  });
});

describe("conditional drafts", () => {
  it("create keeps hidden values and validates them as drafts", async () => {
    const stored: ContentEntry[] = [];
    const cases = new ContentUseCases({
      config: config.runtime,
      clock: { now: () => unixMilliseconds(1) },
      idGenerator: { next: () => `id-${stored.length}` },
      media: {
        loadMedia: async () => {
          throw new Error("Unexpected loadMedia");
        },
        loadMediaMany: async (ids) => ids.map((id) => mediaRecord({ id: mediaId(id) })),
      },
      content: contentPort({
        create: async ({ entry }) => {
          stored.push(entry);
          return { entry, status: "created" };
        },
        resolveLinkTargets: async () => ({}),
      }),
    });
    const draft = (gallery: JsonValue[]) => ({
      actor,
      modelKey: "works",
      title: "Work",
      slug: "work",
      fields: { hasCta: false, gallery },
      blocks: [],
    });
    await cases.create(draft([{ kind: "image", videoUrl: "https://example.com/kept" }]));
    expect(stored[0]?.draft.fields.gallery).toEqual([
      { kind: "image", videoUrl: "https://example.com/kept" },
    ]);
    const issue = await cases.create(draft([{ kind: "image", videoUrl: "not a url" }])).then(
      () => undefined,
      (error) => issueOf(error),
    );
    expect(issue).toMatchObject({ path: ["fields", "gallery", 0, "videoUrl"] });
  });
});
