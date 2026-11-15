import { actorId, contentEntryId, contentModelKey } from "@lacecms/domain";
import {
  type RepositoryContractCase,
  entry,
  publish,
  registerContract,
  resolveRoute,
  seedMedia,
  seedModels,
  seedUser,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract(
  "reads current audit names and roles without mutating content",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts", "settings");
    await seedUser(sql, "editor", "Original", "editor@lace.test");
    await seedUser(sql, "blank", "  ", "blank@lace.test");
    const actors = [actorId("editor"), actorId("blank"), actorId("system:sync")];
    for (const id of actors) {
      const slug = id.replace(":", "-");
      await repository.create({
        entry: entry(slug, "posts", { slug, updatedAt: 1, updatedBy: { id, role: "admin" } }),
        mediaReferences: [],
      });
      await seedMedia(sql, slug);
      await sql.run("update media set created_by = ? where id = ?", id, slug);
    }
    await repository.create({
      entry: entry("settings", "settings", { updatedAt: 1 }),
      mediaReferences: [],
    });
    for (const id of ["editor", "settings"]) {
      const result = await repository.publish(publish(id, 1, 2));
      expect(result.entry?.published?.updatedBy).toEqual({ id: "editor", role: "editor" });
    }
    const entryId = contentEntryId("editor");
    const version = await repository.publishedContentVersion();
    const builds = await sql.all("select * from outbox_events order by id");

    async function assertAttribution(name: string, role: string) {
      const summaries = [
        { id: "editor", displayName: name },
        { id: "blank", displayName: "Unknown user" },
        { id: "system:sync", displayName: "System" },
      ];
      expect(await repository.describeActors(actors)).toEqual(summaries);
      const listing = await repository.list({
        modelKey: contentModelKey("posts"),
        listFields: [],
        limit: 100,
        sort: "title",
      });
      expect(listing.items.map(({ updatedBy }) => updatedBy)).toEqual([
        summaries[1],
        summaries[0],
        summaries[2],
      ]);
      const media = await repository.listMedia({ limit: 100, sort: "-createdAt" });
      expect(media.items.map(({ createdBy }) => createdBy)).toEqual(
        [...summaries].sort((a, b) => b.id.localeCompare(a.id)),
      );
      for (const summary of summaries)
        expect(
          (await repository.loadMediaCatalogItem(summary.id.replace(":", "-")))?.createdBy,
        ).toEqual(summary);

      const actor = { id: "editor", role };
      expect(await repository.loadDraft({ entryId })).toMatchObject({
        revision: 1,
        updatedBy: actor,
      });
      expect(await repository.loadPublished({ entryId })).toMatchObject({
        revision: 1,
        updatedBy: actor,
      });
      const exported = await repository.exportBuildContentPage({ limit: 100 });
      expect(exported.version).toBe(version);
      expect(exported.entries[0]?.entry.published?.updatedBy).toEqual(actor);
      expect(exported.globals?.[0]?.entry.published?.updatedBy).toEqual(actor);
      expect(await sql.all("select * from outbox_events order by id")).toEqual(builds);
    }

    await assertAttribution("Original", "editor");
    await sql.run(
      "update user set name = ?, role = ?, disabled = 1 where id = ?",
      "  Changed Name  ",
      "admin",
      "editor",
    );
    await assertAttribution("Changed Name", "admin");
    await sql.run("delete from user where id = ?", "editor");
    await assertAttribution("Unknown user", "viewer");
    expect(
      (await repository.loadDraft({ entryId: contentEntryId("system-sync") }))?.updatedBy,
    ).toEqual({ id: "system:sync", role: "viewer" });
  },
);
