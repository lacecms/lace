import { expect, test } from "vitest";
import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { builtInBlocks, field } from "@lacecms/content";
import type { Actor, ContentEntry } from "@lacecms/domain";
import {
  ContentLinkUseCases,
  ContentUseCases,
  encodeEntryLink,
  routeLessModelKeys,
} from "../index.js";
import type { LinkTargetQuery, LinkTargetStatus } from "../ports/links.js";
import { markRouteLessTargets } from "./route-less-links.js";

type Dependencies = ConstructorParameters<typeof ContentUseCases>[0];
type LinkPort = ConstructorParameters<typeof ContentLinkUseCases>[0];

const config = await defineConfig({
  blocks: Object.values(builtInBlocks),
  content: [
    definePage({ key: "about", path: "/about", version: 1, fields: { related: field.url() } }),
    defineCollection({ key: "posts", route: "/posts/:slug", version: 1 }),
    defineCollection({
      key: "testimonials",
      version: 1,
      fields: { quote: field.textarea({ required: true }), source: field.url() },
    }),
  ],
});
const actor = { id: "user", role: "admin" } as unknown as Actor;
const viewer = { id: "viewer", role: "viewer" } as unknown as Actor;

function routable(id: string, modelKey: string, kind: "collection" | "page"): LinkTargetStatus {
  return { id, modelKey, modelKind: kind, state: "published", title: id } as LinkTargetStatus;
}

/** Use cases over a partial content port; only the operations a test calls exist. */
function useCases(
  statuses: Readonly<Record<string, LinkTargetStatus>> = {},
  content: Record<string, unknown> = {},
) {
  const created: ContentEntry[] = [];
  let next = 0;
  const cases = new ContentUseCases({
    config: config.runtime,
    clock: { now: () => 1 },
    idGenerator: { next: () => `id-${(next += 1)}` },
    media: { loadMediaMany: async () => [] },
    content: {
      create: async ({ entry }: { readonly entry: ContentEntry }) => {
        created.push(entry);
        return { entry };
      },
      resolveLinkTargets: async (ids: readonly string[]) =>
        Object.fromEntries(
          ids.map((id) => [id, statuses[id] ?? ({ id, state: "missing" } as LinkTargetStatus)]),
        ),
      ...content,
    },
  } as unknown as Dependencies);
  return { cases, created };
}

test("lists the configured route-less collections", () => {
  expect(routeLessModelKeys(config.runtime.content)).toEqual(["testimonials"]);
});

test("route-less entries are created without a slug and reject one", async () => {
  const { cases, created } = useCases();
  const entry = await cases.create({
    actor,
    modelKey: "testimonials",
    title: "Ada",
    fields: { quote: "Great" },
    blocks: [],
  });
  expect(entry.model).toEqual({ key: "testimonials", kind: "collection" });
  expect(entry.draft).not.toHaveProperty("slug");
  await expect(
    cases.create({
      actor,
      modelKey: "testimonials",
      title: "Ada",
      slug: "ada",
      fields: {},
      blocks: [],
    }),
  ).rejects.toMatchObject({ issues: [expect.objectContaining({ code: "slug_not_allowed" })] });
  expect(created).toHaveLength(1);
});

test("an entry of a route-less collection is a non-routable link target", async () => {
  const { cases } = useCases({ t1: routable("t1", "testimonials", "collection") });
  await expect(
    cases.create({
      actor,
      modelKey: "about",
      title: "About",
      fields: { related: encodeEntryLink("t1") },
      blocks: [],
    }),
  ).rejects.toMatchObject({
    issues: [expect.objectContaining({ code: "internal_link_non_routable" })],
  });
  // A testimonial may still link to a routable page.
  const { cases: sourceCases } = useCases({ p1: routable("p1", "about", "page") });
  await expect(
    sourceCases.create({
      actor,
      modelKey: "testimonials",
      title: "Ada",
      fields: { quote: "Great", source: encodeEntryLink("p1") },
      blocks: [],
    }),
  ).resolves.toBeDefined();
});

test("marks route-less statuses non-routable and leaves others", () => {
  const statuses: Readonly<Record<string, LinkTargetStatus>> = {
    a: { ...routable("a", "testimonials", "collection"), state: "unpublished" } as LinkTargetStatus,
    b: { ...routable("b", "posts", "collection"), state: "unpublished" } as LinkTargetStatus,
    c: { id: "c", state: "missing" },
  };
  expect(markRouteLessTargets(statuses, ["testimonials"])).toEqual({
    a: { id: "a", modelKey: "testimonials", state: "non-routable" },
    b: statuses.b,
    c: statuses.c,
  });
  expect(markRouteLessTargets(statuses, [])).toBe(statuses);
});

test("the link picker excludes route-less collections", async () => {
  const queries: LinkTargetQuery[] = [];
  const links = new ContentLinkUseCases(
    {
      listLinkTargets: async (query: LinkTargetQuery) => {
        queries.push(query);
        return { items: [] };
      },
      resolveLinkTargets: async (ids: readonly string[]) =>
        Object.fromEntries(ids.map((id) => [id, routable(id, "testimonials", "collection")])),
      readLinkImpact: async () => ({}),
    } as unknown as LinkPort,
    ["testimonials"],
  );
  await links.list(viewer, { limit: 20 });
  expect(queries[0]?.excludedModelKeys).toEqual(["testimonials"]);
  expect(await links.list(viewer, { limit: 20, modelKey: "testimonials" })).toEqual({ items: [] });
  expect(queries).toHaveLength(1);
  expect(await links.resolve(viewer, ["t1"])).toEqual({
    t1: { id: "t1", modelKey: "testimonials", state: "non-routable" },
  });
});

test("publishing a route-less entry needs no slug and queues a build", async () => {
  let stored: ContentEntry | undefined;
  const calls: unknown[] = [];
  const { cases } = useCases(
    {},
    {
      create: async ({ entry }: { readonly entry: ContentEntry }) => {
        stored = entry;
        return { entry };
      },
      load: async () => stored,
      publish: async (input: unknown) => {
        calls.push(input);
        return { entry: stored, outcome: "published", targetVersion: 2 };
      },
      unpublish: async (input: unknown) => {
        calls.push(input);
        return { entry: stored, outcome: "unpublished", targetVersion: 3 };
      },
    },
  );
  await cases.create({
    actor,
    modelKey: "testimonials",
    title: "Ada",
    fields: { quote: "Great" },
    blocks: [],
  });
  const entry = stored!;
  const published = await cases.publish({ actor, entryId: entry.id, expectedRevision: 1 });
  expect(published.build).toEqual({ status: "queued", targetVersion: 2 });
  expect(calls[0]).toMatchObject({ entryId: entry.id, expectedRevision: 1 });
  stored = {
    ...entry,
    published: { ...entry.draft, id: "published-1", state: "published" },
  } as unknown as ContentEntry;
  const unpublished = await cases.unpublish({
    actor,
    entryId: entry.id,
    expectedPublishedSnapshotId: "published-1" as never,
  });
  expect(unpublished.build).toEqual({ status: "queued", targetVersion: 3 });
});
