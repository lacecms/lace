// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";
import { syncMigrationPage } from "./block-migration-scan.js";

test("maps migration scan rows into ordered entries", () => {
  const page = syncMigrationPage(
    [
      { draft_snapshot_id: "d1", id: "e1", published_snapshot_id: "p1" },
      { draft_snapshot_id: "d2", id: "e2", published_snapshot_id: null },
    ],
    [
      { id: "d1", fields_json: "{}", revision: 2, title: "One" },
      { id: "p1", fields_json: "{}", revision: 2, title: "One" },
      { id: "d2", fields_json: "{}", revision: 1, title: "Two" },
    ],
    [
      {
        block_key: "b2",
        block_type: "hero",
        data_json: "{}",
        hidden: 1,
        position: 2,
        schema_version: 1,
        settings_json: null,
        snapshot_id: "d1",
      },
      {
        block_key: "b1",
        block_type: "note",
        data_json: '{"a":1}',
        hidden: 0,
        position: 1,
        schema_version: 1,
        settings_json: '{"tone":"dark"}',
        snapshot_id: "d1",
      },
    ],
    [{ field_path: "image", media_id: "m1", snapshot_id: "p1", source_key: "b1" }],
    2,
  );
  expect(page.next).toBe("e2");
  expect(page.items[0].draft.blocks).toEqual([
    {
      data: { a: 1 },
      hidden: false,
      key: "b1",
      position: 1,
      schemaVersion: 1,
      settings: { tone: "dark" },
      type: "note",
    },
    { data: {}, hidden: true, key: "b2", position: 2, schemaVersion: 1, type: "hero" },
  ]);
  expect(page.items[0].published.references).toEqual([
    { fieldPath: "image", mediaId: "m1", sourceKey: "b1" },
  ]);
  expect(page.items[1]).toEqual({
    draft: {
      blocks: [],
      fields: {},
      references: [],
      revision: 1,
      snapshotId: "d2",
      state: "draft",
      title: "Two",
    },
    entryId: "e2",
  });
});
