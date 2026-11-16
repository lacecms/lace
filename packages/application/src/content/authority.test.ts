import { NODE_LIST_QUERY_LIMITS as TEST_LIST_QUERY_LIMITS } from "@lacecms/content";
import { expect, test } from "vitest";
import {
  attenuateActor,
  hasPermission,
  auditActor,
  permissionsFor,
  actorId,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import type { Actor, ActorId, ContentEntry, Permission, Role } from "@lacecms/domain";
import type { ContentOperation } from "./authority.js";
import type {
  CreateContentEntryInput,
  DeleteContentEntryInput,
  SaveCompleteDraftInput,
} from "../ports/content.js";
import { defineConfig } from "@lacecms/config";
import { contentPort } from "../test-support/content-port.js";
import {
  ContentUseCases,
  ContentLinkUseCases,
  canContentOperation,
  authorizeContentOperation,
  delegatedContentOperations,
} from "../index.js";

const grant = (
  role: Role = "admin",
  permissions: readonly Permission[] = ["content:read", "content:write"],
  operations: readonly string[] = delegatedContentOperations,
) => attenuateActor({ id: actorId("user"), role }, { permissions, operations });

test("delegated authority is immutable, role-intersected and can only narrow another ceiling", () => {
  const permissions: Permission[] = ["content:read", "content:write"];
  const operations = [...delegatedContentOperations];
  const actor = attenuateActor({ id: actorId("user"), role: "admin" }, { permissions, operations });
  permissions.push("content:publish");
  operations.push("delete");
  expect(hasPermission(actor, "content:publish")).toBe(false);
  if (!actor.authority) throw new Error("Expected delegated authority");
  expect(() =>
    Reflect.apply(Array.prototype.push, actor.authority?.permissions, ["content:publish"]),
  ).toThrow();
  expect(() =>
    Reflect.apply(Array.prototype.push, actor.authority?.operations, ["delete"]),
  ).toThrow();
  expect(hasPermission(grant("viewer"), "content:write")).toBe(false);
  const narrowed = attenuateActor(actor, {
    permissions: ["content:read", "content:publish"],
    operations: ["load", "publish"],
  });
  expect(narrowed.authority).toEqual({
    permissions: ["content:read"],
    operations: ["load", "publish"],
  });
  expect(auditActor(actor)).toEqual({ id: "user", role: "admin" });
});

test("shared operation policy preserves browser roles and denies unregistered/delegated lifecycle operations", () => {
  for (const role of ["viewer", "editor", "admin"] as const) {
    const actor = { id: actorId("browser"), role };
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
  expect(canContentOperation(hostileCeiling, "publish")).toBe(true);
  expect(canContentOperation(grant(), "publish")).toBe(false);
  expect(canContentOperation(grant("editor", ["content:publish"], ["publish"]), "publish")).toBe(
    false,
  );
  for (const op of [
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
    expect(() => authorizeContentOperation(hostileCeiling, op as ContentOperation)).toThrow(
      expect.objectContaining({ code: "AUTHORIZATION_DENIED" }),
    );
  }
});

async function protectedPorts() {
  const calls: PropertyKey[] = [];
  const trap = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(_target, key) {
        calls.push(key);
        throw new Error("Port accessed before authorization");
      },
    });
  const missing = () => {
    throw new Error("Unexpected port call");
  };
  const content = trap(contentPort({}));
  const media = trap({ loadMedia: missing, loadMediaMany: missing });
  const links = trap({
    resolveLinkTargets: missing,
    listLinkTargets: missing,
    readLinkImpact: missing,
  });
  const config = await defineConfig({ content: [] });
  const cases = new ContentUseCases({
    listQueryLimits: TEST_LIST_QUERY_LIMITS,
    content,
    media,
    config: config.runtime,
    clock: { now: () => unixMilliseconds(1) },
    idGenerator: { next: missing },
  });
  return { calls, cases, links: new ContentLinkUseCases(links) };
}

function deniedOperations(
  cases: ContentUseCases,
  actor: Actor,
  entryId: ReturnType<typeof contentEntryId>,
) {
  return [
    () => cases.publish({ actor, entryId, expectedRevision: 1 }),
    () =>
      cases.unpublish({
        actor,
        entryId,
        expectedPublishedSnapshotId: contentSnapshotId("snapshot"),
      }),
    () => cases.delete({ actor, entryId, expectedRevision: 1 }),
    () => cases.revertDraft({ actor, entryId, expectedRevision: 1 }),
    () => cases.duplicate({ actor, entryId }),
    () => cases.detachMedia({ actor, entryId, mediaId: mediaId("media") }),
    () => cases.describeActor({ actor, actorId: actor.id }),
    () => cases.loadDraft({ actor, entryId }),
    () => cases.loadPublished({ actor, entryId }),
  ];
}

test("direct delegated content calls deny before any content/media port access, including both deletion states", async () => {
  const { calls, cases, links } = await protectedPorts();
  const actor = grant();
  for (const entryId of [contentEntryId("unpublished-entry"), contentEntryId("published-entry")])
    for (const run of deniedOperations(cases, actor, entryId))
      await expect(run()).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  const readOnly = grant("admin", ["content:read"]);
  await expect(
    cases.create({ actor: readOnly, modelKey: "posts", title: "Entry", fields: {}, blocks: [] }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  await expect(
    cases.save({
      actor: readOnly,
      entryId: contentEntryId("entry"),
      expectedRevision: 1,
      title: "Entry",
      fields: {},
      blocks: [],
    }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  for (const run of [
    () => links.resolve(actor, []),
    () => links.list(actor, { limit: 1 }),
    () => links.impact(actor, { targetId: "entry", action: "delete", limit: 1 }),
  ])
    expect(run).toThrow(expect.objectContaining({ code: "AUTHORIZATION_DENIED" }));
  expect(calls).toEqual([]);
});

test("even publication ceilings cannot grant destructive or other lifecycle operations", async () => {
  const { cases } = await protectedPorts();
  for (const role of ["admin", "editor", "viewer"] as const) {
    for (const permissions of [
      ["content:read"],
      ["content:read", "content:write"],
      ["content:read", "content:write", "content:publish"],
    ] as Permission[][]) {
      const actor = grant(role, permissions, [
        ...delegatedContentOperations,
        "unpublish",
        "delete",
        "revertDraft",
        "duplicate",
      ]);
      const entryId = contentEntryId("entry");
      for (const run of [
        () =>
          cases.unpublish({
            actor,
            entryId,
            expectedPublishedSnapshotId: contentSnapshotId("snapshot"),
          }),
        () => cases.delete({ actor, entryId, expectedRevision: 1 }),
        () => cases.revertDraft({ actor, entryId, expectedRevision: 1 }),
        () => cases.duplicate({ actor, entryId }),
      ])
        await expect(run()).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }
  }
});

test("browser deletion keeps unpublished-versus-published permission checks", async () => {
  const config = await defineConfig({ content: [] });
  for (const published of [false, true]) {
    const deleted: DeleteContentEntryInput[] = [];
    const owner: Actor = { id: actorId("editor"), role: "editor" };
    const snapshot = {
      id: contentSnapshotId("draft"),
      entryId: contentEntryId("entry"),
      revision: 1,
      state: "draft" as const,
      title: "Entry",
      fields: {},
      blocks: [],
      createdAt: unixMilliseconds(1),
      updatedAt: unixMilliseconds(1),
      updatedBy: owner,
    };
    const entry: ContentEntry = {
      id: contentEntryId("entry"),
      model: { kind: "collection", key: contentModelKey("posts") },
      draft: snapshot,
      ...(published
        ? {
            published: {
              ...snapshot,
              id: contentSnapshotId("snapshot"),
              state: "published" as const,
            },
          }
        : {}),
    };
    const cases = new ContentUseCases({
      listQueryLimits: TEST_LIST_QUERY_LIMITS,
      config: config.runtime,
      clock: { now: () => unixMilliseconds(1) },
      idGenerator: {
        next: () => {
          throw new Error("Unexpected id");
        },
      },
      media: {
        loadMedia: () => {
          throw new Error("Unexpected media");
        },
        loadMediaMany: () => {
          throw new Error("Unexpected media");
        },
      },
      content: contentPort({
        load: async () => entry,
        delete: async (input) => {
          deleted.push(input);
          return { status: "deleted" };
        },
      }),
    });
    if (published)
      await expect(
        cases.delete({
          actor: { id: actorId("editor"), role: "editor" },
          entryId: contentEntryId("entry"),
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    else
      await cases.delete({
        actor: { id: actorId("editor"), role: "editor" },
        entryId: contentEntryId("entry"),
        expectedRevision: 1,
      });
    await cases.delete({
      actor: { id: actorId("admin"), role: "admin" },
      entryId: contentEntryId("entry"),
      expectedRevision: 1,
    });
    expect(deleted).toHaveLength(published ? 1 : 2);
    expect(deleted.at(-1)?.expectedPublishedSnapshotId).toBe(published ? "snapshot" : undefined);
  }
});

test("delegated writes store audit identity without reusable authority", async () => {
  const { defineConfig, defineCollection } = await import("@lacecms/config");
  const config = await defineConfig({
    content: [defineCollection({ key: "posts", version: 1, route: "/posts/:slug", fields: {} })],
  });
  let sequence = 0;
  let stored: ContentEntry | undefined;
  const writes: (CreateContentEntryInput | SaveCompleteDraftInput)[] = [];
  const cases = new ContentUseCases({
    listQueryLimits: TEST_LIST_QUERY_LIMITS,
    config: config.runtime,
    clock: { now: () => unixMilliseconds(1) },
    idGenerator: { next: () => `id-${++sequence}` },
    media: {
      loadMedia: () => {
        throw new Error("Unexpected loadMedia");
      },
      loadMediaMany: async () => [],
    },
    content: contentPort({
      create: async (input) => {
        stored = input.entry;
        writes.push(input);
        return { entry: stored, status: "created" };
      },
      load: async () => stored ?? null,
      saveCompleteDraft: async (input) => {
        writes.push(input);
        return stored ? { entry: stored, status: "saved" } : { status: "saved" };
      },
    }),
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
  expect(writes[0]).toMatchObject({
    entry: { draft: { updatedBy: { id: "user", role: "admin" } } },
  });
  expect(JSON.stringify(writes[0])).not.toContain("authority");
  await cases.save({
    actor,
    entryId: entry.id,
    expectedRevision: 1,
    title: "Changed",
    fields: {},
    blocks: [],
  });
  expect(writes[1]).toMatchObject({ mutation: { updatedBy: { id: "user", role: "admin" } } });
  expect(actor.authority).toBeDefined();
});

test("model discovery and admin projections share normalized metadata, defaults and bounded safe attribution", async () => {
  const { defineConfig, defineCollection, definePage } = await import("@lacecms/config");
  const { field, builtInBlocks } = await import("@lacecms/content");
  const { NODE_LIST_QUERY_LIMITS, CLOUDFLARE_LIST_QUERY_LIMITS } = await import("../index.js");
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
    const lookups: (readonly ActorId[])[] = [];
    let stored: ContentEntry | undefined;
    let next = 0;
    const cases = new ContentUseCases({
      config: config.runtime,
      listQueryLimits: limits,
      clock: { now: () => unixMilliseconds(1) },
      idGenerator: { next: () => `projection-${++next}` },
      media: {
        loadMedia: () => {
          throw new Error("Unexpected loadMedia");
        },
        loadMediaMany: async () => [],
      },
      content: contentPort({
        create: async ({ entry }) => {
          stored = entry;
          return { entry, status: "created" };
        },
        load: async ({ entryId }) => (entryId === stored?.id ? stored : null),
        describeActors: async (ids) => {
          lookups.push(ids);
          return ids.map((id) => ({ id, displayName: "Ada", email: "private@lace.test" }));
        },
      }),
    });
    const actor = grant();
    const discovery = cases.discoverModels({ actor });
    expect(discovery.listQueryLimits).toEqual(limits);
    const discovered = discovery.items.find((model) => model.key === "posts");
    if (!discovered) throw new Error("Expected posts discovery");
    expect(discovered.blockDefinitions.map((b) => b.type)).toEqual(["quote"]);
    expect(discovered.blockDefinitions[0]).not.toHaveProperty("validate");
    const author = discovered.fields.author;
    if (!author) throw new Error("Expected author metadata");
    expect(author.defaultValue).toBe("Ada");
    expect(discovered).not.toHaveProperty("structure");
    Reflect.set(author, "defaultValue", "changed-copy");
    expect(
      cases.discoverModels({ actor }).items.find((model) => model.key === "posts")?.fields.author
        ?.defaultValue,
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
    if (!loaded) throw new Error("Expected loaded entry");
    expect(loaded.entry.draft.fields.author).toBe("Ada");
    expect(loaded.seo).toBe(true);
    expect(loaded.updatedBy).toEqual({ id: "user", displayName: "Ada" });
    expect(lookups).toEqual([["user"], ["user"]]);
    expect(await cases.loadAdminEntry({ actor, entryId: contentEntryId("missing") })).toBeNull();
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
