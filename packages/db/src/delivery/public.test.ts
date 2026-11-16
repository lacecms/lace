import { strict as assert } from "node:assert";
import {
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  unixMilliseconds,
} from "@lacecms/domain";
import { expect, test } from "vitest";
import { publicEntry } from "./public.js";
import { storedSnapshots } from "../content/snapshots.js";

test("maps stored block envelopes and drops hidden blocks from public entries", () => {
  const snapshotRow = (id: string) => ({
    created_at: 1,
    entry_id: "e1",
    fields_json: "{}",
    id,
    revision: 1,
    role: "editor",
    schema_version: 1,
    seo_json: null,
    slug: null,
    title: "Home",
    updated_at: 1,
    updated_by: "editor",
  });
  const blockRow = (key: string, overrides = {}) => ({
    anchor: null,
    block_key: key,
    block_type: "note",
    class_name: null,
    created_at: 1,
    data_json: "{}",
    hidden: 0,
    position: 1,
    schema_version: 1,
    settings_json: "{}",
    snapshot_id: "p1",
    updated_at: 1,
    ...overrides,
  });
  const snapshots = storedSnapshots(
    [snapshotRow("p1")],
    [
      blockRow("b1", { anchor: "pricing", class_name: "wide", settings_json: '{"tone":"dark"}' }),
      blockRow("b2", { hidden: 1, position: 2 }),
    ],
  );
  const snapshot = snapshots.get("p1");
  assert(snapshot);
  const blocks = snapshot.blocks;
  expect(blocks[0]).toEqual({
    anchor: "pricing",
    className: "wide",
    data: {},
    hidden: false,
    key: "b1",
    position: 1,
    schemaVersion: 1,
    settings: { tone: "dark" },
    type: "note",
  });
  expect(blocks[1]).toMatchObject({ hidden: true, key: "b2", settings: {} });
  expect(blocks[1]).not.toHaveProperty("anchor");
  const published = {
    ...snapshot,
    createdAt: unixMilliseconds(snapshot.createdAt),
    updatedAt: unixMilliseconds(snapshot.updatedAt),
    entryId: contentEntryId(snapshot.entryId),
    id: contentSnapshotId(snapshot.id),
    state: "published" as const,
  };
  const projected = publicEntry({
    draft: { ...published, state: "draft" },
    id: contentEntryId("e1"),
    model: { key: contentModelKey("home"), kind: "page", path: "/" },
    published,
  });
  expect(projected.published?.blocks.map((block) => block.key)).toEqual(["b1"]);
  expect(projected.draft.blocks.map((block) => block.key)).toEqual(["b1"]);
});
