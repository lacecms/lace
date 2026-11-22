import Database from "better-sqlite3";
import { expect, test } from "vitest";
import { publicationResultEntry, publishWritePlan } from "../publication/write-plan.js";
import {
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  unixMilliseconds,
} from "@lacecms/domain";
import { executeWritePlan } from "./write-plan.js";
import { siteBuildEvent } from "@lacecms/application";

test("publication admission diagnoses a stale candidate before invalid links", () => {
  const db = new Database(":memory:");
  try {
    db.exec(`create table content_entries (id text, draft_snapshot_id text, published_snapshot_id text);
      create table content_snapshots (id text, revision integer);
      create table content_entry_link_references (snapshot_id text, source_key text, area text, field_path text, target_entry_id text, delivered integer, purpose text not null default 'url');
      create table published_routes (path text, entry_id text, snapshot_id text);
      insert into content_entries values ('post','draft',null);
      insert into content_snapshots values ('draft',2);
      insert into content_entry_link_references (snapshot_id,source_key,area,field_path,target_entry_id,delivered) values ('draft','$fields','fields','/link','missing',1);`);
    const id = contentEntryId("post");
    const actor = { id: actorId("editor"), role: "editor" as const };
    const entry = createContentEntry({
      id,
      model: { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" },
      draft: {
        id: contentSnapshotId("draft"),
        entryId: id,
        revision: 1,
        slug: "post",
        title: "Post",
        fields: {},
        blocks: [],
        state: "draft",
        createdAt: unixMilliseconds(1),
        updatedAt: unixMilliseconds(1),
        updatedBy: actor,
      },
    });
    const input = {
      events: [
        siteBuildEvent({
          reason: "publication",
          requestedAt: 2,
          requestedBy: actor.id,
          publishedSnapshotId: "published",
        }),
      ],
      entryId: id,
      expectedRevision: 1,
      publishedAt: unixMilliseconds(2),
      publishedBy: actor,
      publishedSnapshotId: contentSnapshotId("published"),
    };
    const plan = publishWritePlan(input, entry, publicationResultEntry(entry, input, "editor"), [
      "event",
    ]);
    expect(executeWritePlan(db, plan)).toMatchObject({
      kind: "rejected",
      reason: { kind: "revision" },
      committedOutboxWork: false,
    });
    const staleProjection = {
      ...input,
      expectedRevision: 2,
      projection: {
        fields: {},
        internalLinks: [],
        mediaReferences: [],
        blocks: [{ key: blockKey("removed-after-read"), data: {} }],
      },
    };
    const stale = publishWritePlan(
      staleProjection,
      entry,
      publicationResultEntry(entry, staleProjection, "editor"),
      ["event"],
    );
    expect(executeWritePlan(db, stale)).toMatchObject({
      kind: "rejected",
      reason: { kind: "revision" },
    });
    expect(db.prepare("select count(*) as count from content_snapshots").get()).toEqual({
      count: 1,
    });
  } finally {
    db.close();
  }
});
