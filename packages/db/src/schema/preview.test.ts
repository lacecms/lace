import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";
import { checkedInMigrations } from "./migrations.js";

test.each(["memory", "file"])(
  "preview schema upgrades a %s SQLite database without restricting content deletion",
  async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), "lace-preview-schema-"));
    const database = new DatabaseSync(
      mode === "file" ? join(directory, "lace.sqlite") : ":memory:",
    );
    const migrate = async (name: string) =>
      database.exec(await readFile(new URL(`../../drizzle/${name}`, import.meta.url), "utf8"));
    try {
      for (const migration of checkedInMigrations.slice(0, -1)) await migrate(migration.name);
      database.exec(`
      insert into content_models (key,kind,label,config_version,structure_hash,projection_hash,created_at,updated_at) values ('home','page','Home',1,'s','p',1,1);
      insert into content_entries (id,model_key,created_by,created_at,updated_at) values ('home','home','editor',1,1);
      insert into media (id,storage_key,filename,mime_type,size,metadata_json,status,created_by,created_at,updated_at) values ('asset','storage','file.png','image/png',1,'{}','active','editor',1,1);
      insert into user (id,name,email,created_at,updated_at) values ('editor','Editor','editor@lace.test',1,1);
      insert into session (id,token,expires_at,created_at,updated_at,user_id) values ('session','old-auth-token',100,1,1,'editor');
    `);
      await migrate(checkedInMigrations.at(-1)!.name);
      expect(database.prepare("select model_key from content_entries").get()).toEqual({
        model_key: "home",
      });
      expect(database.prepare("select count(*) as n from preview_generations").get()).toEqual({
        n: 0,
      });
      database.exec(`
      insert into preview_generations (id,entry_id,model_key,revision,path,public_version,configuration,source_commit,executor,created_by,idempotency_key,state,created_at,overall_deadline)
      values ('g','home','home',1,'/',0,'cfg','commit','executor','editor','key','preparing',1,100);
      insert into preview_current values ('home','g');
      insert into preview_execution_slot values (1,'g');
      insert into preview_media_dependencies values ('g','asset',1);
      insert into preview_sessions values ('hash','session','https://preview.test',80);
    `);
      expect(() => database.exec("insert into preview_current values ('other','g')")).toThrow(
        /foreign key/iu,
      );
      expect(() => database.exec("delete from preview_generations where id='g'")).toThrow(
        /foreign key/iu,
      );
      database.exec(
        "delete from media where id='asset'; delete from content_entries where id='home'; delete from session where id='session'",
      );
      expect(database.prepare("select * from preview_sessions").all()).toEqual([]);
      const mediaPlan = database
        .prepare(
          "explain query plan select generation_id from preview_media_dependencies where media_id=?",
        )
        .all("asset");
      expect(mediaPlan[0]?.detail).toMatch(/SEARCH .*preview_media_dependency_lookup_idx/u);
      expect(database.prepare("select media_id from preview_media_dependencies").get()).toEqual({
        media_id: "asset",
      });
      database.exec("delete from preview_execution_slot; delete from preview_generations;");
      expect(database.prepare("select * from preview_current").all()).toEqual([]);
      expect(database.prepare("select * from preview_media_dependencies").all()).toEqual([]);
      expect(database.prepare("pragma foreign_key_check").all()).toEqual([]);
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
