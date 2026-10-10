import { expect, test } from "vitest";
import { sessionFor } from "../../app/testing/index.js";
import { breadcrumbsFor, navigationGroups } from "./navigation.js";

const models = [
  { key: "home", kind: "page" as const, label: "Home" },
  { key: "posts", kind: "collection" as const },
];

const labels = (groups: ReturnType<typeof navigationGroups>) =>
  groups.map((group) => [group.label, group.items.map((item) => item.label)]);

test("navigation groups follow configured models and the role matrix", () => {
  expect(labels(navigationGroups(sessionFor({ id: "user-1", role: "admin" }), models))).toEqual([
    ["Pages", ["Home"]],
    ["Collections", ["posts"]],
    ["Library", ["Media", "Builds"]],
    ["Admin", ["Users", "Settings"]],
  ]);
  for (const role of ["editor", "viewer"] as const)
    expect(labels(navigationGroups(sessionFor({ id: "user-1", role: role }), models))).toEqual([
      ["Pages", ["Home"]],
      ["Collections", ["posts"]],
      ["Library", ["Media", "Builds"]],
    ]);
  expect(labels(navigationGroups(sessionFor({ id: "user-1", role: "editor" })))).toEqual([
    ["Library", ["Media", "Builds"]],
  ]);
});

test("each administrative item follows its own permission", () => {
  const groups = (permissions: NonNullable<Parameters<typeof sessionFor>[0]["permissions"]>) =>
    labels(navigationGroups(sessionFor({ id: "u", permissions, role: "viewer" })));
  expect(groups(["content:read", "settings:manage"])).toEqual([
    ["Library", ["Media", "Builds"]],
    ["Admin", ["Settings"]],
  ]);
  expect(groups(["content:read", "users:manage"])).toEqual([
    ["Library", ["Media", "Builds"]],
    ["Admin", ["Users"]],
  ]);
  expect(groups([])).toEqual([]);
});

test("breadcrumbs locate each screen without entry identifiers", () => {
  expect(breadcrumbsFor({ params: {}, routeId: "/_protected/content" })).toEqual([
    { label: "Content" },
  ]);
  expect(breadcrumbsFor({ params: {}, routeId: "/_protected/settings" })).toEqual([
    { label: "Settings" },
  ]);
  expect(breadcrumbsFor({ params: { _splat: "nope" }, routeId: "/_protected/$" })).toEqual([
    { label: "Page not found" },
  ]);
  expect(
    breadcrumbsFor({
      models,
      params: { modelKey: "posts" },
      routeId: "/_protected/content/$modelKey",
    }),
  ).toEqual([{ label: "Content", to: "/content" }, { label: "posts" }]);
  const entryRoute = "/_protected/content/$modelKey/$entryId";
  expect(
    breadcrumbsFor({
      entryTitle: "First post",
      models,
      params: { entryId: "entry-1", modelKey: "posts" },
      routeId: entryRoute,
    }),
  ).toEqual([
    { label: "Content", to: "/content" },
    { label: "posts", params: { modelKey: "posts" }, to: "/content/$modelKey" },
    { label: "First post" },
  ]);
  const loading = breadcrumbsFor({
    params: { entryId: "entry-1", modelKey: "posts" },
    routeId: entryRoute,
  });
  expect(loading.at(-1)).toEqual({ label: "Entry" });
  expect(JSON.stringify(loading)).not.toContain("entry-1");
  expect(
    breadcrumbsFor({
      entryTitle: "Home",
      models,
      params: { entryId: "home-1", modelKey: "home" },
      routeId: entryRoute,
    }),
  ).toEqual([{ label: "Content", to: "/content" }, { label: "Home" }]);
  expect(breadcrumbsFor({ params: {}, routeId: "__root__" })).toEqual([]);
});
