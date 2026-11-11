import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { field } from "@lacecms/content";
import { contentEntryId, contentModelKey, contentSnapshotId } from "@lacecms/domain";
import type { ContentEntry } from "@lacecms/domain";
import { contentModelRouteSchema, contentModelSchema } from "./models.js";
import { toContentModelDto, toContentModelRouteDto } from "./model-projection.js";
import { publicRecordListSchema, publicRecordSchema } from "../delivery/public.js";
import { toPublicRecordListDto } from "../delivery/public-mappers.js";

describe("route-less collection contracts", () => {
  const source = {
    blockDefinitions: [],
    kind: "collection" as const,
    key: "testimonials",
    version: 1,
    blocks: [],
    fields: { quote: field.textarea() },
    listFields: ["quote"],
  };

  test("a collection model DTO may omit its route but then carries no path or seo", () => {
    const mapped = toContentModelDto(source);
    expect(mapped).not.toHaveProperty("route");
    expect(v.safeParse(contentModelSchema, mapped).success).toBe(true);
    expect(v.safeParse(contentModelSchema, { ...mapped, seo: {} }).success).toBe(false);
    expect(v.safeParse(contentModelSchema, { ...mapped, path: "/x" }).success).toBe(false);
  });

  test("an entry's model route DTO omits the route of a route-less collection", () => {
    const route = toContentModelRouteDto({
      key: contentModelKey("testimonials"),
      kind: "collection",
    });
    expect(route).toEqual({ key: "testimonials", kind: "collection" });
    expect(v.safeParse(contentModelRouteSchema, route).success).toBe(true);
  });

  test("public records carry a title and no path, slug or SEO", () => {
    const published = {
      blocks: [],
      createdAt: Date.UTC(2026, 10, 11),
      entryId: contentEntryId("t1"),
      fields: { quote: "Great" },
      id: contentSnapshotId("t1-p"),
      revision: 1,
      state: "published",
      title: "Ada",
      updatedAt: Date.UTC(2026, 10, 11),
      updatedBy: { id: "editor", kind: "user" },
    };
    const entry = {
      draft: { ...published, state: "draft" },
      id: contentEntryId("t1"),
      model: { key: contentModelKey("testimonials"), kind: "collection" },
      published,
    };
    const list = toPublicRecordListDto(
      {
        items: [{ entry: entry as unknown as ContentEntry, internalLinks: [], media: [] }],
        nextCursor: "next",
      },
      (id) => `https://lace.example/api/v1/public/media/${id}`,
    );
    expect(v.parse(publicRecordListSchema, list)).toEqual(list);
    expect(list.items[0]).toMatchObject({ id: "t1", modelKey: "testimonials", title: "Ada" });
    for (const key of ["path", "slug", "seo"])
      expect(v.safeParse(publicRecordSchema, { ...list.items[0], [key]: "x" }).success).toBe(false);
  });
});
