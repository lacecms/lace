// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import { field } from "@lacecms/content";
import { unixMilliseconds } from "@lacecms/domain";
import * as v from "valibot";
import { expect, test } from "vitest";
import { contentEntryListSchema } from "./entries.js";
import { toAdminContentEntryDto } from "./entry-mappers.js";
import { toContentModelDto } from "./model-projection.js";
import { contentModelListSchema } from "./models.js";
import { actor, entry } from "../test-support/rest-fixtures.js";

test("shared content projectors preserve metadata, admin attribution and list timestamps", async () => {
  const { NODE_LIST_QUERY_LIMITS } = await import("./collection-queries.js");
  const { toAdminEntryProjectionDto, toContentEntryListDto } = await import("./entry-mappers.js");
  const { toContentModelDiscoveryDto } = await import("./model-projection.js");
  const projection = { entry, updatedBy: { id: actor.id, displayName: "Editor" }, seo: false };
  expect(toAdminEntryProjectionDto(projection)).toEqual(
    toAdminContentEntryDto(entry, projection.updatedBy),
  );
  const model = {
    kind: "collection",
    key: "posts",
    route: "/posts/:slug",
    blocks: [],
    version: 1,
    fields: { nested: field.group({ fields: { items: field.list({ item: field.text() }) } }) },
  };
  const models = toContentModelDiscoveryDto({
    items: [model],
    listQueryLimits: NODE_LIST_QUERY_LIMITS,
  });
  expect(models.items).toEqual([toContentModelDto(model)]);
  expect(v.safeParse(contentModelListSchema, models).success).toBe(true);
  const page = toContentEntryListDto({
    items: [
      {
        draftRevision: 1,
        id: "entry",
        modelKey: "posts",
        listValues: { flag: false },
        status: "draft",
        title: "Title",
        updatedAt: unixMilliseconds(1),
        updatedBy: { id: "user", displayName: "Editor" },
      },
    ],
    totals: { all: 1, draft: 1, changed: 0, published: 0 },
  });
  expect(page.items[0].updatedAt).toBe("1970-01-01T00:00:00.001Z");
  expect(v.safeParse(contentEntryListSchema, page).success).toBe(true);
});
