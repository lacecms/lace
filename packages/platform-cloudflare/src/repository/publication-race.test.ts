import { expect, test } from "vitest";
import {
  actorId,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  unixMilliseconds,
} from "@lacecms/domain";
import type { ContentModelRoute } from "@lacecms/domain";
import type { D1Database } from "../d1/database.js";
import { openLocalD1 } from "../test-support/d1-test-harness.js";
import { D1ContentRepository } from "./repository.js";

test("a concurrent draft change outranks invalid delivered links at publication admission", async () => {
  const { database, dispose } = await openLocalD1();
  try {
    await database
      .prepare(
        "insert into content_models (key,kind,label,config_version,structure_hash,projection_hash,created_at,updated_at) values ('posts','collection','Posts',1,'s','p',1,1)",
      )
      .run();
    const model: ContentModelRoute = {
      key: contentModelKey("posts"),
      kind: "collection",
      route: "/blog/:slug",
    };
    const actor = { id: actorId("editor"), role: "editor" as const };
    const id = contentEntryId("post");
    const draftId = contentSnapshotId("post-draft");
    const entry = createContentEntry({
      id,
      model,
      draft: {
        id: draftId,
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
    const repository = new D1ContentRepository(database, () => model);
    await repository.create({ entry, mediaReferences: [] });
    let race = false;
    const racing: D1Database = {
      prepare(sql) {
        if (sql.startsWith("insert into mutation_guards (token, created_at) select")) race = true;
        return database.prepare(sql);
      },
      async batch(statements) {
        if (race) {
          race = false;
          await database.batch([
            database.prepare("update content_snapshots set revision=2 where id='post-draft'"),
            database.prepare(
              "insert into content_entry_link_references (snapshot_id,source_key,area,field_path,target_entry_id,delivered) values ('post-draft','$fields','fields','/link','missing',1)",
            ),
          ]);
        }
        return database.batch(statements);
      },
    };
    const publisher = new D1ContentRepository(racing, () => model);
    await expect(
      publisher.publish({
        entryId: id,
        expectedRevision: 1,
        publishedAt: unixMilliseconds(2),
        publishedBy: actor,
        publishedSnapshotId: contentSnapshotId("published"),
      }),
    ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
    expect(
      await database
        .prepare("select count(*) as count from content_snapshots where id='published'")
        .first(),
    ).toEqual({ count: 0 });
    expect(await database.prepare("select count(*) as count from outbox_events").first()).toEqual({
      count: 0,
    });
    expect(await database.prepare("select count(*) as count from mutation_guards").first()).toEqual(
      { count: 0 },
    );
    await database.prepare("delete from content_entry_link_references").run();
    let reports = 0;
    const reporting = new D1ContentRepository(database, () => model, {
      onOutboxWork: () => {
        reports += 1;
      },
    });
    const publish = {
      entryId: id,
      expectedRevision: 2,
      publishedAt: unixMilliseconds(3),
      publishedBy: actor,
      publishedSnapshotId: contentSnapshotId("published"),
    };
    await reporting.publish(publish);
    await reporting.publish({
      ...publish,
      publishedSnapshotId: contentSnapshotId("published-again"),
      publishedAt: unixMilliseconds(4),
    });
    expect(reports).toBe(2);
    const state = await database
      .prepare("select version from published_state where singleton_key=1")
      .first<{ version: number }>();
    const event = await database
      .prepare("select payload_json from outbox_events where processed_at is null")
      .first<{ payload_json: string }>();
    expect(JSON.parse(event!.payload_json).targetVersion).toBe(state!.version);
    expect(state!.version).toBe(2);
    const failing = new D1ContentRepository(database, () => model, {
      onOutboxWork: () => {
        reports += 1;
      },
      beforeMutation: (checkpoint) => {
        if (checkpoint === "unpublish.snapshot") throw new Error("late failure");
      },
    });
    await expect(
      failing.unpublish({
        entryId: id,
        expectedPublishedSnapshotId: contentSnapshotId("published-again"),
        unpublishedAt: unixMilliseconds(5),
        unpublishedBy: actor,
      }),
    ).rejects.toThrow();
    expect(reports).toBe(2);
    expect(
      await database.prepare("select version from published_state where singleton_key=1").first(),
    ).toEqual({ version: 2 });
    expect(await database.prepare("select count(*) as count from mutation_guards").first()).toEqual(
      { count: 0 },
    );
  } finally {
    await dispose();
  }
}, 60_000);
