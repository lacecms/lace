import Database from "better-sqlite3";
import { expect, test } from "vitest";
import { publicationResultEntry, publishWritePlan } from "../publication/write-plan.js";
import {
  actorId,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  unixMilliseconds,
} from "@lacecms/domain";
import { executeWritePlan } from "./write-plan.js";

test("publication admission diagnoses a stale candidate before invalid links", () => {
  const db = new Database(":memory:");
  try {
    db.exec(`create table content_entries (id text, draft_snapshot_id text, published_snapshot_id text);
      create table content_snapshots (id text, revision integer);
      create table content_entry_link_references (snapshot_id text, source_key text, area text, field_path text, target_entry_id text, delivered integer);
      create table published_routes (path text, entry_id text, snapshot_id text);
      insert into content_entries values ('post','draft',null);
      insert into content_snapshots values ('draft',2);
      insert into content_entry_link_references values ('draft','$fields','fields','/link','missing',1);`);
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
      entryId: id,
      expectedRevision: 1,
      publishedAt: unixMilliseconds(2),
      publishedBy: actor,
      publishedSnapshotId: contentSnapshotId("published"),
    };
    const plan = publishWritePlan(
      input,
      entry,
      publicationResultEntry(entry, input, "editor"),
      "event",
    );
    expect(executeWritePlan(db, plan)).toMatchObject({
      kind: "rejected",
      reason: { kind: "revision" },
      committedOutboxWork: false,
    });
    expect(db.prepare("select count(*) as count from content_snapshots").get()).toEqual({
      count: 1,
    });
  } finally {
    db.close();
  }
});
