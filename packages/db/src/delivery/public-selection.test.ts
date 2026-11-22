import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { contentModelKey } from "@lacecms/domain";
import { expect, test } from "vitest";
import { checkedInMigrations } from "../schema/migrations.js";
import { publicRecordContent } from "./public.js";
import { assemblePublicPage, routedPublicContent } from "./public-page.js";
import {
  publicGlobalSelection,
  publicListSelection,
  publicPathSelection,
  publicReadStatements,
} from "./public-selection.js";
import type { PublicSelection } from "./public-selection.js";

test("public selectors fetch children only for delivered publications", async () => {
  const database = new DatabaseSync(":memory:", { enableForeignKeyConstraints: false });
  try {
    for (const { name } of checkedInMigrations)
      database.exec(await readFile(new URL(`../../drizzle/${name}`, import.meta.url), "utf8"));
    database.exec(`
      insert into content_models (key,kind,label,config_version,structure_hash,projection_hash,created_at,updated_at)
      values ('posts','collection','Posts',1,'s','p',1,1),
             ('records','collection','Records',1,'s','p',1,1), ('global','global','Global',1,'s','p',1,1);
      insert into content_entries (id,model_key,created_by,created_at,updated_at,draft_snapshot_id,published_snapshot_id)
      values ('a','posts','editor',1,1,'a-d','a-p'), ('b','posts','editor',1,1,'b-d','b-p'),
             ('c','records','editor',1,1,'c-d','c-p'), ('d','records','editor',1,1,'d-d','d-p'),
             ('g','global','editor',1,1,'g-d','g-p');
      insert into content_snapshots (id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by)
      select published_snapshot_id,id,1,id,'{}',1,2,2,'editor' from content_entries;
      insert into content_snapshots (id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by)
      select draft_snapshot_id,id,1,'draft','{"text":"draft"}',1,1,1,'editor' from content_entries;
      insert into published_routes (path,entry_id,snapshot_id,updated_at)
      values ('/blog/a','a','a-p',2),('/blog/b','b','b-p',2);
      insert into content_blocks (snapshot_id,block_key,block_type,position,schema_version,data_json,hidden,created_at,updated_at)
      values ('b-p','shown','hero',1000,1,'{}',0,2,2), ('b-p','hidden','hero',2000,1,'{}',1,2,2),
             ('b-d','draft','hero',1000,1,'{}',0,1,1);
      with recursive seq(n) as (values(1) union all select n+1 from seq where n<32)
      insert into content_blocks (snapshot_id,block_key,block_type,position,schema_version,data_json,created_at,updated_at)
      select 'a-p','large-'||n,'hero',n*1000,1,json_object('text',hex(zeroblob(1024))),2,2 from seq;
      insert into content_entry_link_references (snapshot_id,source_key,area,field_path,target_entry_id,delivered)
      values ('a-p','$fields','fields','/url','b',1), ('b-p','$fields','fields','/url','a',1),
             ('b-p','hidden','data','/url','a',0), ('b-d','$fields','fields','/url','a',1);
      insert into media (id,storage_key,filename,mime_type,size,metadata_json,status,created_by,created_at,updated_at)
      values ('shown','shown','image.png','image/png',1,'{}','active','editor',1,1),
             ('lookahead','lookahead','image.png','image/png',1,'{}','active','editor',1,1),
             ('hidden','hidden','image.png','image/png',1,'{}','active','editor',1,1);
      insert into content_media_references (snapshot_id,source_key,field_path,media_id,created_at)
      values ('b-p','shown','image','shown',2), ('a-p','large-1','image','lookahead',2),
             ('b-p','hidden','image','hidden',2);
    `);
    const query = (selection: PublicSelection) =>
      publicReadStatements(selection).map(({ sql, params }) =>
        database.prepare(sql).all(...params),
      );
    const resolveModel = (key: string) => ({
      key: contentModelKey(key),
      kind: "collection" as const,
      ...(key === "posts" ? { route: "/blog/:slug" } : {}),
    });
    const posts = { modelKey: contentModelKey("posts"), limit: 1 };
    const first = publicListSelection(posts, "public");
    const rows = query(first);
    expect(rows[0]!.map((row) => Object.keys(row))).toEqual(
      Array.from({ length: 2 }, () => [
        "id",
        "model_key",
        "published_snapshot_id",
        "published_created_at",
        "path",
      ]),
    );
    expect(rows[0]!.map((row) => row.id)).toEqual(["b", "a"]);
    expect(rows[1]!.map((row) => row.id)).toEqual(["b-p"]);
    expect(rows[2]!.map((row) => [row.snapshot_id, row.block_key])).toEqual([["b-p", "shown"]]);
    expect(rows[3]!.map((row) => [row.public_snapshot_id, row.id])).toEqual([["b-p", "shown"]]);
    const page = assemblePublicPage(first, rows, resolveModel, routedPublicContent);
    expect(page.items[0]).toMatchObject({
      path: "/blog/b",
      internalLinks: [{ targetId: "a" }],
      media: [{ id: "shown" }],
    });
    expect(page.nextCursor).toBeDefined();
    const next = publicListSelection({ ...posts, after: page.nextCursor! }, "public");
    const continued = assemblePublicPage(next, query(next), resolveModel, routedPublicContent);
    expect(continued.items[0]).toMatchObject({
      path: "/blog/a",
      internalLinks: [{ targetId: "b" }],
      media: [{ id: "lookahead" }],
    });
    expect(continued.items[0]?.entry.published?.blocks).toHaveLength(32);
    expect(continued.nextCursor).toBeUndefined();

    const records = { modelKey: contentModelKey("records"), limit: 1 };
    const recordSelection = publicListSelection(records, "public-records");
    const recordPage = assemblePublicPage(
      recordSelection,
      query(recordSelection),
      resolveModel,
      publicRecordContent,
    );
    expect(recordPage.items.map((item) => item.entry.id)).toEqual(["d"]);
    expect(recordPage.nextCursor).toBeDefined();
    expect(
      query(
        publicListSelection({ ...records, after: recordPage.nextCursor! }, "public-records"),
      )[0],
    ).toEqual([expect.objectContaining({ id: "c" })]);
    expect(query(publicListSelection(posts, "public-records"))[0]).toEqual([]);
    expect(query(publicPathSelection("/blog/b"))[0]).toEqual([
      expect.objectContaining({ id: "b" }),
    ]);
    expect(query(publicPathSelection("/missing"))[0]).toEqual([]);
    expect(query(publicGlobalSelection("global"))[0]).toEqual([
      expect.objectContaining({ id: "g" }),
    ]);
    expect(query(publicGlobalSelection("posts"))[0]).toEqual([]);
  } finally {
    database.close();
  }
});
