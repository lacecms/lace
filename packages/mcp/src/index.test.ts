// @ts-nocheck
// TODO(rf2): Type scripted MCP transport payloads, protocol results and malformed content fixtures.
import { afterEach, expect, test } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpContentHandler } from "./index.js";
import { ContentUseCases } from "@lacecms/application";
import { actorId, attenuateActor, unixMilliseconds } from "@lacecms/domain";
import { defineConfig, defineCollection, defineGlobal, definePage } from "@lacecms/config";
import { field } from "@lacecms/content";
import {
  InMemoryContentStore,
  DeterministicClock,
  DeterministicIdGenerator,
} from "@lacecms/test-utils";

const clients = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
});
const actor = (id, role, write = false) =>
  attenuateActor(
    { id: actorId(id), role },
    {
      permissions: ["content:read", ...(write ? ["content:write"] : [])],
      operations: ["discoverModels", "list", "load", ...(write ? ["create", "save"] : [])],
    },
  );
async function fixture() {
  const config = await defineConfig({
    content: [
      defineCollection({
        key: "posts",
        route: "/blog/:slug",
        version: 1,
        fields: { author: field.text({ defaultValue: "Unknown" }) },
      }),
      definePage({ key: "home", path: "/", version: 1 }),
      defineGlobal({ key: "settings", version: 1 }),
      definePage({ key: "about", path: "/about", version: 1 }),
    ],
  });
  const store = new InMemoryContentStore();
  const content = new ContentUseCases({
    config: config.runtime,
    content: store,
    media: store,
    clock: new DeterministicClock(unixMilliseconds(1800000000000)),
    idGenerator: new DeterministicIdGenerator("mcp"),
  });
  const handler = createMcpContentHandler({ content, version: "0.0.0-test" });
  const events = [];
  const connect = async (identity) => {
    const client = new Client({ name: "lace-content-test", version: "0.0.0" });
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL("https://lace.test/mcp"), {
        fetch: async (url, init) => {
          let body = init?.body;
          if (typeof body === "string") {
            const message = JSON.parse(body);
            if (message.method === "initialize") {
              message.params.protocolVersion = "2025-11-25";
              body = JSON.stringify(message);
            }
          }
          return handler.fetch(new Request(url, { ...init, body }), identity, (event) =>
            events.push(event),
          );
        },
      }),
    );
    return client;
  };
  return { store, content, connect, events };
}
const draft = { modelKey: "posts", title: "Draft from MCP", fields: {}, blocks: [] };
const payload = (result) => {
  expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
  return result.structuredContent;
};

test("SDK client discovers derived schemas and executes all five shared content tools", async () => {
  const f = await fixture();
  const client = await f.connect(actor("admin", "admin", true));
  const list = await client.listTools();
  expect(list.tools.map((t) => t.name)).toEqual([
    "list_content_models",
    "list_entries",
    "get_entry",
    "create_entry",
    "save_draft",
  ]);
  const saveSchema = list.tools.find((t) => t.name === "save_draft").inputSchema;
  expect(saveSchema.required).toContain("expectedRevision");
  expect(saveSchema.additionalProperties).toBe(false);
  const models = payload(await client.callTool({ name: "list_content_models", arguments: {} }));
  expect(models.items.map((m) => m.key)).toEqual(["posts", "home", "settings", "about"]);
  const created = payload(await client.callTool({ name: "create_entry", arguments: draft }));
  expect(created.draft.fields).toEqual({ author: "Unknown" });
  expect(created.published).toBeUndefined();
  expect(created.draft.revision).toBe(1);
  const loaded = payload(
    await client.callTool({ name: "get_entry", arguments: { entryId: created.id } }),
  );
  expect(loaded).toEqual(created);
  const saved = payload(
    await client.callTool({
      name: "save_draft",
      arguments: {
        entryId: created.id,
        title: "Updated",
        fields: { author: "Editor" },
        blocks: [],
        expectedRevision: 1,
      },
    }),
  );
  expect(saved.draft.revision).toBe(2);
  const entries = payload(
    await client.callTool({ name: "list_entries", arguments: { modelKey: "posts" } }),
  );
  expect(entries.items[0].title).toBe("Updated");
  expect(f.events.map((e) => e.tool)).toEqual([
    "list_content_models",
    "create_entry",
    "get_entry",
    "save_draft",
    "list_entries",
  ]);
  expect(JSON.stringify(f.events)).not.toContain("Draft from MCP");
});

test("SDK calls preserve safe validation, known application, protocol and internal errors", async () => {
  const f = await fixture();
  const client = await f.connect(actor("admin", "admin", true));
  const invalid = await client.callTool({
    name: "save_draft",
    arguments: { entryId: "unknown", title: "x", fields: {}, blocks: [] },
  });
  expect(invalid.isError).toBe(true);
  expect(payload(invalid).error).toMatchObject({
    code: "VALIDATION_FAILED",
    details: { issues: [expect.objectContaining({ path: "/expectedRevision" })] },
  });
  const unknown = await client.callTool({ name: "get_entry", arguments: { entryId: "missing" } });
  expect(unknown.isError).toBe(true);
  expect(payload(unknown).error.code).toBe("NOT_FOUND");
  await expect(client.callTool({ name: "publish", arguments: {} })).rejects.toThrow();
  const created = payload(await client.callTool({ name: "create_entry", arguments: draft }));
  const stale = await client.callTool({
    name: "save_draft",
    arguments: { entryId: created.id, title: "x", fields: {}, blocks: [], expectedRevision: 0 },
  });
  expect(stale.isError).toBe(true);
  expect(payload(stale).error.code).toBe("CONTENT_REVISION_CONFLICT");
  f.content.loadAdminEntry = async () => {
    throw new Error("SQL SELECT token=private-credential");
  };
  const internal = await client.callTool({ name: "get_entry", arguments: { entryId: created.id } });
  expect(payload(internal).error).toEqual({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
  });
  expect(JSON.stringify(internal)).not.toMatch(/SELECT|private-credential/);
});

test("interleaved identities retain their own visibility and draft attribution", async () => {
  const f = await fixture();
  const admin = await f.connect(actor("writer-a", "admin", true));
  const viewer = await f.connect(actor("reader", "viewer"));
  const editor = await f.connect(actor("writer-b", "editor", true));
  const lists = await Promise.all([viewer.listTools(), admin.listTools(), editor.listTools()]);
  expect(lists.map((l) => l.tools.length)).toEqual([3, 5, 5]);
  await expect(viewer.callTool({ name: "create_entry", arguments: draft })).rejects.toThrow();
  const created = await Promise.all([
    admin.callTool({ name: "create_entry", arguments: draft }),
    editor.callTool({ name: "create_entry", arguments: draft }),
  ]);
  expect(created.map((r) => payload(r).updatedBy.id)).toEqual(["writer-a", "writer-b"]);
  for (const name of [
    "publish",
    "unpublish",
    "delete",
    "duplicate",
    "revert_draft",
    "list_media",
  ]) {
    await expect(admin.callTool({ name, arguments: {} })).rejects.toThrow();
  }
});

test("publish tool shares publication, replay and guards while lifecycle bans remain closed", async () => {
  const f = await fixture();
  const identity = attenuateActor(
    { id: actorId("publisher"), role: "admin" },
    {
      permissions: ["content:read", "content:write", "content:publish"],
      operations: ["discoverModels", "list", "load", "create", "save", "publish"],
    },
  );
  const client = await f.connect(identity);
  expect((await client.listTools()).tools.map((t) => t.name)).toEqual(
    expect.arrayContaining(["publish_entry"]),
  );
  expect((await client.listTools()).tools).toHaveLength(6);
  for (const name of ["unpublish_entry", "delete_entry", "revert_draft", "duplicate_entry"])
    await expect(client.callTool({ name, arguments: {} })).rejects.toThrow();
  const created = payload(
    await client.callTool({ name: "create_entry", arguments: { ...draft, slug: "published" } }),
  );
  const args = { entryId: created.id, expectedRevision: 1, idempotencyKey: "publication-retry" };
  const published = payload(await client.callTool({ name: "publish_entry", arguments: args }));
  expect(published.publication).toBe("published");
  expect(published.build).toMatchObject({ status: "queued" });
  expect(published.entry.published).toBeDefined();
  const version = await f.store.publishedContentVersion();
  const replay = payload(await client.callTool({ name: "publish_entry", arguments: args }));
  expect(replay).toEqual({
    ...published,
    publication: "replayed",
    build: { status: "not-dispatched" },
  });
  expect(await f.store.publishedContentVersion()).toBe(version);
  const stale = await client.callTool({
    name: "publish_entry",
    arguments: { ...args, expectedRevision: 0, idempotencyKey: "different-key" },
  });
  expect(stale.isError).toBe(true);
  expect(payload(stale).error.code).toBe("CONTENT_REVISION_CONFLICT");
  const conflict = payload(
    await client.callTool({ name: "create_entry", arguments: { ...draft, slug: "published" } }),
  );
  const blocked = await client.callTool({
    name: "publish_entry",
    arguments: { entryId: conflict.id, expectedRevision: 1 },
  });
  expect(blocked.isError).toBe(true);
  expect(payload(blocked).error.code).toBe("CONTENT_ROUTE_CONFLICT");
  for (const code of ["required", "internal_link_unavailable"]) {
    const { ContentValidationError } = await import("@lacecms/content");
    f.content.publish = async () => {
      throw new ContentValidationError([
        { code, path: ["fields", "link"], message: "Invalid destination." },
      ]);
    };
    const failure = await client.callTool({ name: "publish_entry", arguments: args });
    expect(failure.isError).toBe(true);
    expect(payload(failure).error.code).toBe("VALIDATION_FAILED");
    expect(payload(failure).error.details.issues[0]).toMatchObject({ code, path: "/fields/link" });
  }
});

test("tools describe conditional fields and publish their projection", async () => {
  const config = await defineConfig({
    content: [
      defineCollection({
        key: "works",
        route: "/works/:slug",
        version: 1,
        fields: {
          kind: field.select({
            options: ["image", "video"],
            required: true,
            defaultValue: "image",
          }),
          videoUrl: field.url({ required: true }),
        },
        visibility: { videoUrl: { field: "kind", values: ["video"] } },
      }),
    ],
  });
  const store = new InMemoryContentStore();
  const content = new ContentUseCases({
    config: config.runtime,
    content: store,
    media: store,
    clock: new DeterministicClock(unixMilliseconds(1800000000000)),
    idGenerator: new DeterministicIdGenerator("conditional-mcp"),
  });
  const handler = createMcpContentHandler({ content, version: "0.0.0-test" });
  const client = new Client({ name: "lace-content-test", version: "0.0.0" });
  clients.push(client);
  const identity = attenuateActor(
    { id: actorId("publisher"), role: "admin" },
    {
      permissions: ["content:read", "content:write", "content:publish"],
      operations: ["discoverModels", "list", "load", "create", "save", "publish"],
    },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL("https://lace.test/mcp"), {
      fetch: async (url, init) => {
        let body = init?.body;
        if (typeof body === "string") {
          const message = JSON.parse(body);
          if (message.method === "initialize") {
            message.params.protocolVersion = "2025-11-25";
            body = JSON.stringify(message);
          }
        }
        return handler.fetch(new Request(url, { ...init, body }), identity);
      },
    }),
  );
  const tools = Object.fromEntries(
    (await client.listTools()).tools.map((tool) => [tool.name, tool.description]),
  );
  expect(tools.list_content_models).toMatch(/visibility/u);
  expect(tools.create_entry).toMatch(/hidden fields are kept and validated as drafts/u);
  expect(tools.save_draft).toMatch(/hidden conditional fields are kept/u);
  expect(tools.publish_entry).toMatch(/never published/u);
  const models = payload(await client.callTool({ name: "list_content_models", arguments: {} }));
  expect(models.items[0].visibility).toEqual(
    content.discoverModels({ actor: identity }).items[0].visibility,
  );
  const created = payload(
    await client.callTool({
      name: "create_entry",
      arguments: {
        modelKey: "works",
        title: "Work",
        slug: "work",
        fields: { kind: "image", videoUrl: "https://example.com/left-over" },
        blocks: [],
      },
    }),
  );
  payload(
    await client.callTool({
      name: "publish_entry",
      arguments: { entryId: created.id, expectedRevision: created.draft.revision },
    }),
  );
  const read = payload(
    await client.callTool({ name: "get_entry", arguments: { entryId: created.id } }),
  );
  expect(read.draft.fields).toEqual({ kind: "image", videoUrl: "https://example.com/left-over" });
  expect(read.published.fields).toEqual({ kind: "image" });
});

test("MCP error matrix shares the classifier body without transport headers", async () => {
  const { errorMatrixCases } = await import("@lacecms/test-utils");
  const { classifyError } = await import("@lacecms/contracts");
  const f = await fixture();
  const client = await f.connect(actor("admin", "admin", true));
  for (const c of errorMatrixCases) {
    f.content.loadAdminEntry = async () => {
      throw c.create();
    };
    const result = await client.callTool({
      name: "get_entry",
      arguments: { entryId: "matrix-entry" },
    });
    expect(result.isError, c.name).toBe(true);
    expect(payload(result), c.name).toEqual(classifyError(c.create()).body);
    expect(JSON.stringify(result), c.name).not.toContain("retry-after");
  }
});
