import { prepareConfigurationSynchronization } from "@lacecms/application";

import { defineCollection, defineConfig } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";

import { mediaId } from "@lacecms/domain";

import {
  type RepositoryContractCase,
  sequence,
  seedMedia,
  entry,
  publish,
  syncResolver,
  applySync,
  registerContract,
} from "../shared.js";

import { block } from "../sync/fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract(
  "placeholder-only sync preserves populated snapshots and stale guards",
  async (runtime, expect) => {
    const make = async (placeholder?: string) =>
      (
        await defineConfig({
          content: [
            defineCollection({
              key: "posts",
              route: "/posts/:slug",
              version: 1,
              fields: {
                nested: field.group({
                  fields: {
                    title: field.text(placeholder === undefined ? {} : { placeholder }),
                  },
                }),
              },
            }),
          ],
        })
      ).runtime.content;
    const original = await make();
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(original),
      nextId: sequence("guidance"),
    });
    await applySync(repository, original, 10);
    const created = entry("guidance-entry", "posts", {
      updatedAt: 15,
      slug: "guidance",
      fields: { nested: { title: "Stored" } },
    });
    await repository.create({ entry: created, mediaReferences: [] });
    await repository.publish(publish("guidance-entry", 1, 20));
    const before = await repository.load({ entryId: created.id });
    for (const [index, placeholder] of ["Title", "New title", undefined].entries()) {
      const models = await make(placeholder);
      expect(models[0]!.structureHash).toBe(original[0]!.structureHash);
      const plan = await prepareConfigurationSynchronization({ models, state: repository });
      expect(plan.plan.operations).toMatchObject([{ action: "label-update" }]);
      await applySync(repository, models, 30 + index, plan);
      expect(await repository.load({ entryId: created.id })).toEqual(before);
    }
    const models = await make("Stale");
    const plan = await prepareConfigurationSynchronization({ models, state: repository });
    await sql.run(
      "update content_models set projection_hash = ? where key = ?",
      "concurrent",
      "posts",
    );
    await expect(applySync(repository, models, 40, plan)).rejects.toMatchObject({
      code: "CONFIGURATION_SYNC_STALE",
    });
    expect(await repository.load({ entryId: created.id })).toEqual(before);
  },
);

contract(
  "layout-only sync preserves populated snapshots and stale guards",
  async (runtime, expect) => {
    const make = async (label?: string) =>
      (
        await defineConfig({
          blocks: [
            defineBlock({
              type: "layout",
              version: 1,
              fields: { title: field.text() },
              settings: { size: field.number({ defaultValue: 1 }) },
              ...(label === undefined
                ? {}
                : {
                    layout: { mode: "tabs", groups: [{ key: "main", label, fields: ["title"] }] },
                    settingsLayout: {
                      mode: "sections",
                      groups: [{ key: "style", label, fields: ["size"] }],
                    },
                  }),
            }),
          ],
          content: [
            defineCollection({
              key: "posts",
              route: "/posts/:slug",
              version: 1,
              blocks: ["layout"],
              ...(label === undefined
                ? {}
                : {
                    layout: { mode: "tabs", groups: [{ key: "main", label, fields: ["nested"] }] },
                  }),
              fields: {
                nested: field.group({
                  fields: {
                    title: field.text(),
                    photo: field.media(),
                    links: field.list({ item: field.text() }),
                  },
                  ...(label === undefined
                    ? {}
                    : {
                        layout: {
                          mode: "sections",
                          groups: [{ key: "main", label, fields: ["title", "photo", "links"] }],
                        },
                      }),
                }),
              },
            }),
          ],
        })
      ).runtime.content;
    const original = await make();
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(original),
      nextId: sequence("guidance"),
    });
    await applySync(repository, original, 10);
    await seedMedia(sql, "layout-media");
    const created = entry("guidance-entry", "posts", {
      updatedAt: 15,
      slug: "guidance",
      fields: { nested: { title: "Stored", photo: "layout-media", links: ["first", "second"] } },
      blocks: [
        { ...block("layout-key", "layout", 1000, { title: "Block" }), settings: { size: 2 } },
      ],
    });
    await repository.create({
      entry: created,
      mediaReferences: [
        { sourceKey: "$fields", fieldPath: "/nested/photo", mediaId: mediaId("layout-media") },
      ],
    });
    await repository.publish(publish("guidance-entry", 1, 20));
    const before = await repository.load({ entryId: created.id });
    const unchanged = async () => ({
      references: await sql.all("select * from content_media_references order by snapshot_id"),
      published: await sql.all("select * from published_state"),
      outbox: await sql.all("select * from outbox_events"),
    });
    const state = await unchanged();
    for (const [index, placeholder] of ["Title", "New title", undefined].entries()) {
      const models = await make(placeholder);
      expect(models[0]!.structureHash).toBe(original[0]!.structureHash);
      const plan = await prepareConfigurationSynchronization({ models, state: repository });
      expect(plan.plan.operations).toMatchObject([{ action: "label-update" }]);
      await applySync(repository, models, 30 + index, plan);
      expect(await repository.load({ entryId: created.id })).toEqual(before);
      const nextState = await unchanged();
      expect(nextState.references).toEqual(state.references);
      expect(nextState.published).toMatchObject([{ version: 3 + index }]);
      expect(nextState.outbox).toHaveLength(1);
      expect(
        JSON.parse((nextState.outbox[0] as { payload_json: string }).payload_json),
      ).toMatchObject({ reason: "configuration_sync", targetVersion: 3 + index });
      expect(
        (await prepareConfigurationSynchronization({ models, state: repository })).plan.operations,
      ).toEqual([]);
    }
    const models = await make("Stale");
    const plan = await prepareConfigurationSynchronization({ models, state: repository });
    const beforeStale = await unchanged();
    await sql.run(
      "update content_models set projection_hash = ? where key = ?",
      "concurrent",
      "posts",
    );
    await expect(applySync(repository, models, 40, plan)).rejects.toMatchObject({
      code: "CONFIGURATION_SYNC_STALE",
    });
    expect(await repository.load({ entryId: created.id })).toEqual(before);
    expect(await unchanged()).toEqual(beforeStale);
  },
);
