import { expect, test } from "vitest";
import { defineCollection, defineConfig } from "@lacecms/config";
import { CollectionQueryValidationError, ContentUseCases } from "@lacecms/application";
import { field } from "@lacecms/content";
import { actorId, unixMilliseconds } from "@lacecms/domain";
import { DeterministicClock, DeterministicIdGenerator } from "../adapters/fakes.js";
import { InMemoryContentStore } from "../store/in-memory-content-store.js";
import {
  filterParityCases,
  filterParityFields,
  filterParityFilterableFields,
  filterParityUnlistedField,
} from "./parity-cases.js";

async function applicationAccepts(): Promise<(filter: unknown) => Promise<boolean>> {
  const config = await defineConfig({
    content: [
      defineCollection({
        key: "posts",
        route: "/posts/:slug",
        version: 1,
        fields: { ...filterParityFields, [filterParityUnlistedField]: field.text() },
        listOptions: { filterableFields: [...filterParityFilterableFields] },
      }),
    ],
  });
  const store = new InMemoryContentStore();
  const useCases = new ContentUseCases({
    clock: new DeterministicClock(unixMilliseconds(1)),
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator("parity"),
    media: store,
  });
  return async (filter) => {
    try {
      await useCases.list({
        actor: { id: actorId("admin"), role: "admin" },
        filters: [filter],
        limit: 10,
        modelKey: "posts",
      });
      return true;
    } catch (error) {
      if (error instanceof CollectionQueryValidationError) return false;
      throw error;
    }
  };
}

test("the application query validation follows the filter parity table", async () => {
  const accepts = await applicationAccepts();
  const results: Record<string, boolean> = {};
  for (const entry of filterParityCases) results[entry.name] = await accepts(entry.filter);
  expect(results).toEqual(
    Object.fromEntries(filterParityCases.map((entry) => [entry.name, entry.accepted])),
  );
});

test("the filter parity table names each case once", () => {
  const names = filterParityCases.map((entry) => entry.name);
  expect(new Set(names).size).toBe(names.length);
});
