import { expect, test } from "vitest";
import { diffContentModelStructures, prepareConfigurationSynchronization } from "../index.js";
import { posts, storedFrom, snapshot, port } from "../test-support/configuration-fixtures.js";

const routeLess = { route: undefined };

test("adding or removing a collection route is a breaking route change, not a kind change", async () => {
  const routed = await posts();
  const without = await posts(routeLess);
  expect(diffContentModelStructures(routed.structure, without.structure)).toEqual([
    {
      class: "breaking",
      kind: "route-changed",
      routeRemoved: true,
      scope: "model",
      target: "route",
    },
  ]);
  expect(diffContentModelStructures(without.structure, routed.structure)).toEqual([
    { class: "breaking", kind: "route-changed", scope: "model", target: "route" },
  ]);
});

test("adds a route to an unpublished route-less collection", async () => {
  const prepared = await prepareConfigurationSynchronization({
    models: [await posts({ version: 2 })],
    state: port(
      [storedFrom(await posts(routeLess), { publishedSnapshotCount: 0 })],
      [snapshot(1, "draft", {}), snapshot(2, "draft", {})],
    ),
  });
  expect(prepared.plan.isValid).toBe(true);
  expect(prepared.plan.diagnostics).toEqual([]);
});

test("refuses a route change of a published collection", async () => {
  for (const [before, after] of [
    [await posts(routeLess), await posts({ version: 2 })],
    [await posts(), await posts({ ...routeLess, version: 2 })],
  ] as const) {
    const prepared = await prepareConfigurationSynchronization({
      models: [after],
      state: port([storedFrom(before)], [snapshot(1, "published", {})]),
    });
    expect(prepared.plan.isValid).toBe(false);
    expect(prepared.plan.diagnostics.map((value) => value.code)).toContain(
      "ROUTE_CHANGE_HAS_PUBLISHED",
    );
  }
});

test("refuses removing a route while drafts hold slugs and names them", async () => {
  const prepared = await prepareConfigurationSynchronization({
    models: [await posts({ ...routeLess, version: 2 })],
    state: port(
      [storedFrom(await posts(), { publishedSnapshotCount: 0 })],
      [
        { ...snapshot(1, "draft", {}), slug: "first" },
        { ...snapshot(2, "draft", {}), slug: "second" },
      ],
    ),
  });
  expect(prepared.plan.isValid).toBe(false);
  expect(prepared.plan.diagnostics).toMatchObject([
    {
      code: "ROUTE_REMOVAL_HAS_SLUGS_OR_LINKS",
      affectedCount: 2,
      snapshots: [
        { entryId: "entry-1", state: "draft", title: "Title 1" },
        { entryId: "entry-2", state: "draft", title: "Title 2" },
      ],
    },
  ]);
});

test("refuses removing a route while an entry is linked internally", async () => {
  const prepared = await prepareConfigurationSynchronization({
    models: [await posts({ ...routeLess, version: 2 })],
    state: port(
      [storedFrom(await posts(), { publishedSnapshotCount: 0 })],
      [snapshot(1, "draft", {}), { ...snapshot(2, "draft", {}), incomingLinks: 1 }],
    ),
  });
  expect(prepared.plan.diagnostics).toMatchObject([
    {
      code: "ROUTE_REMOVAL_HAS_SLUGS_OR_LINKS",
      affectedCount: 1,
      snapshots: [{ entryId: "entry-2" }],
    },
  ]);
});

test("removes a route when no snapshot holds a slug or link", async () => {
  const prepared = await prepareConfigurationSynchronization({
    models: [await posts({ ...routeLess, version: 2 })],
    state: port(
      [storedFrom(await posts(), { publishedSnapshotCount: 0 })],
      [snapshot(1, "draft", {}), snapshot(2, "draft", {})],
    ),
  });
  expect(prepared.plan.isValid).toBe(true);
  expect(prepared.plan.diagnostics).toEqual([]);
});
