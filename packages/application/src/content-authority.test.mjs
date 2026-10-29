import { expect, test } from "vitest";
import { attenuateActor, hasPermission, auditActor, permissionsFor } from "@lacecms/domain";
import {
  ContentUseCases,
  ContentLinkUseCases,
  canContentOperation,
  authorizeContentOperation,
  delegatedContentOperations,
} from "../dist/index.js";

const grant = (
  role = "admin",
  permissions = ["content:read", "content:write"],
  operations = delegatedContentOperations,
) => attenuateActor({ id: "user", role }, { permissions, operations });

test("delegated authority is immutable, role-intersected and can only narrow another ceiling", () => {
  const permissions = ["content:read", "content:write"];
  const operations = [...delegatedContentOperations];
  const actor = attenuateActor({ id: "user", role: "admin" }, { permissions, operations });
  permissions.push("content:publish");
  operations.push("delete");
  expect(hasPermission(actor, "content:publish")).toBe(false);
  expect(() => actor.authority.permissions.push("content:publish")).toThrow();
  expect(() => actor.authority.operations.push("delete")).toThrow();
  expect(hasPermission(grant("viewer"), "content:write")).toBe(false);
  const narrowed = attenuateActor(actor, {
    permissions: ["content:read", "content:publish"],
    operations: ["load", "publish"],
  });
  expect(narrowed.authority).toEqual({ permissions: ["content:read"], operations: ["load"] });
  expect(auditActor(actor)).toEqual({ id: "user", role: "admin" });
});

test("shared operation policy preserves browser roles and denies unregistered/delegated lifecycle operations", () => {
  for (const role of ["viewer", "editor", "admin"]) {
    const actor = { id: "browser", role };
    expect(canContentOperation(actor, "load")).toBe(permissionsFor(role).includes("content:read"));
    expect(canContentOperation(actor, "save")).toBe(permissionsFor(role).includes("content:write"));
    expect(canContentOperation(actor, "publish")).toBe(
      permissionsFor(role).includes("content:publish"),
    );
  }
  expect(canContentOperation(grant(), "save")).toBe(true);
  expect(canContentOperation(grant("admin", ["content:read"]), "save")).toBe(false);
  for (const actor of [
    grant("admin", [], []),
    grant("admin", ["content:read"], []),
    grant("admin", ["content:read"], ["future-operation"]),
  ]) {
    expect(canContentOperation(actor, "load")).toBe(false);
    expect(canContentOperation(actor, "future-operation")).toBe(false);
  }
  const hostileCeiling = grant(
    "admin",
    ["content:read", "content:write", "content:publish"],
    [...delegatedContentOperations, "publish", "unpublish", "delete", "future-operation"],
  );
  for (const op of [
    "publish",
    "unpublish",
    "delete",
    "revertDraft",
    "duplicate",
    "detachMedia",
    "describeActor",
    "loadDraft",
    "loadPublished",
    "future-operation",
    "toString",
  ]) {
    expect(canContentOperation(hostileCeiling, op)).toBe(false);
    expect(() => authorizeContentOperation(hostileCeiling, op)).toThrow(
      expect.objectContaining({ code: "AUTHORIZATION_DENIED" }),
    );
  }
});

test("direct delegated content calls deny before any content/media port access, including both deletion states", async () => {
  const calls = [];
  const ports = new Proxy(
    {},
    {
      get(_target, key) {
        calls.push(key);
        throw new Error("Port accessed before authorization");
      },
    },
  );
  const cases = new ContentUseCases({ content: ports, media: ports, config: { content: [] } });
  const actor = grant();
  for (const method of [
    "publish",
    "unpublish",
    "delete",
    "revertDraft",
    "duplicate",
    "detachMedia",
    "describeActor",
    "loadDraft",
    "loadPublished",
  ]) {
    for (const entryId of ["unpublished-entry", "published-entry"]) {
      await expect(cases[method]({ actor, entryId, expectedRevision: 1 })).rejects.toMatchObject({
        code: "AUTHORIZATION_DENIED",
      });
    }
  }
  const readOnly = grant("admin", ["content:read"]);
  for (const method of ["create", "save"])
    await expect(cases[method]({ actor: readOnly, entryId: "entry" })).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
  const links = new ContentLinkUseCases(ports);
  for (const method of ["resolve", "list", "impact"])
    expect(() => links[method](actor, {})).toThrow(
      expect.objectContaining({ code: "AUTHORIZATION_DENIED" }),
    );
  expect(calls).toEqual([]);
});

test("browser deletion keeps unpublished-versus-published permission checks", async () => {
  for (const published of [false, true]) {
    const deleted = [];
    const cases = new ContentUseCases({
      clock: { now: () => 1 },
      content: {
        load: async () => ({
          id: "entry",
          model: { kind: "collection", key: "posts" },
          ...(published ? { published: { id: "snapshot" } } : {}),
        }),
        delete: async (input) => {
          deleted.push(input);
        },
      },
    });
    if (published)
      await expect(
        cases.delete({
          actor: { id: "editor", role: "editor" },
          entryId: "entry",
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    else
      await cases.delete({
        actor: { id: "editor", role: "editor" },
        entryId: "entry",
        expectedRevision: 1,
      });
    await cases.delete({
      actor: { id: "admin", role: "admin" },
      entryId: "entry",
      expectedRevision: 1,
    });
    expect(deleted).toHaveLength(published ? 1 : 2);
    expect(deleted.at(-1).expectedPublishedSnapshotId).toBe(published ? "snapshot" : undefined);
  }
});

test("delegated writes store audit identity without reusable authority", async () => {
  const { defineConfig, defineCollection } = await import("@lacecms/config");
  const config = await defineConfig({
    content: [defineCollection({ key: "posts", version: 1, route: "/posts/:slug", fields: {} })],
  });
  let sequence = 0;
  let stored;
  const writes = [];
  const cases = new ContentUseCases({
    config: config.runtime,
    clock: { now: () => 1 },
    idGenerator: { next: () => `id-${++sequence}` },
    media: { loadMediaMany: async () => [] },
    content: {
      create: async (input) => {
        stored = input.entry;
        writes.push(input);
        return { entry: stored };
      },
      load: async () => stored,
      saveCompleteDraft: async (input) => {
        writes.push(input);
        return { entry: stored };
      },
    },
  });
  const actor = grant();
  const entry = await cases.create({
    actor,
    modelKey: "posts",
    title: "Title",
    fields: {},
    blocks: [],
  });
  expect(entry.draft.updatedBy).toEqual({ id: "user", role: "admin" });
  expect(writes[0].entry.draft.updatedBy.authority).toBeUndefined();
  await cases.save({
    actor,
    entryId: entry.id,
    expectedRevision: 1,
    title: "Changed",
    fields: {},
    blocks: [],
  });
  expect(writes[1].mutation.updatedBy).toEqual({ id: "user", role: "admin" });
  expect(actor.authority).toBeDefined();
});

test("model discovery and admin projections share normalized metadata, defaults and bounded safe attribution", async () => {
  const { defineConfig, defineCollection, definePage } = await import("@lacecms/config");
  const { field, builtInBlocks } = await import("@lacecms/content");
  const { NODE_LIST_QUERY_LIMITS, CLOUDFLARE_LIST_QUERY_LIMITS } = await import("../dist/index.js");
  const config = await defineConfig({
    blocks: Object.values(builtInBlocks),
    content: [
      defineCollection({
        key: "posts",
        version: 1,
        route: "/posts/:slug",
        blocks: ["quote"],
        fields: { author: field.text({ defaultValue: "Ada" }), description: field.text() },
        seo: { description: "description" },
      }),
      definePage({ key: "about", version: 1, path: "/about", fields: {} }),
    ],
  });
  for (const limits of [NODE_LIST_QUERY_LIMITS, CLOUDFLARE_LIST_QUERY_LIMITS]) {
    const lookups = [];
    let stored;
    let next = 0;
    const cases = new ContentUseCases({
      config: config.runtime,
      listQueryLimits: limits,
      clock: { now: () => 1 },
      idGenerator: { next: () => `projection-${++next}` },
      media: { loadMediaMany: async () => [] },
      content: {
        create: async ({ entry }) => {
          stored = entry;
          return { entry };
        },
        load: async ({ entryId }) => (entryId === stored?.id ? stored : null),
        describeActors: async (ids) => {
          lookups.push(ids);
          return ids.map((id) => ({ id, displayName: "Ada", email: "private@lace.test" }));
        },
      },
    });
    const actor = grant();
    const discovery = cases.discoverModels({ actor });
    expect(discovery.listQueryLimits).toEqual(limits);
    const discovered = discovery.items.find((model) => model.key === "posts");
    expect(discovered.blockDefinitions.map((b) => b.type)).toEqual(["quote"]);
    expect(discovered.blockDefinitions[0].validate).toBeUndefined();
    expect(discovered.fields.author.defaultValue).toBe("Ada");
    expect(discovered.structure).toBeUndefined();
    discovered.fields.author.defaultValue = "changed-copy";
    expect(
      cases.discoverModels({ actor }).items.find((model) => model.key === "posts").fields.author
        .defaultValue,
    ).toBe("Ada");
    const entry = await cases.create({
      actor,
      modelKey: "posts",
      title: "Title",
      blocks: [],
      fields: {},
    });
    const loaded = await cases.loadAdminEntry({ actor, entryId: entry.id });
    expect(loaded).toEqual(await cases.projectAdminEntry({ actor, entry }));
    expect(loaded.entry.draft.fields.author).toBe("Ada");
    expect(loaded.seo).toBe(true);
    expect(loaded.updatedBy).toEqual({ id: "user", displayName: "Ada" });
    expect(lookups).toEqual([["user"], ["user"]]);
    expect(await cases.loadAdminEntry({ actor, entryId: "missing" })).toBeNull();
    const blocked = grant("admin", [], []);
    expect(() => cases.discoverModels({ actor: blocked })).toThrow(
      expect.objectContaining({ code: "AUTHORIZATION_DENIED" }),
    );
    await expect(cases.loadAdminEntry({ actor: blocked, entryId: entry.id })).rejects.toMatchObject(
      { code: "AUTHORIZATION_DENIED" },
    );
    await expect(cases.projectAdminEntry({ actor: blocked, entry })).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(lookups).toHaveLength(2);
  }
});
