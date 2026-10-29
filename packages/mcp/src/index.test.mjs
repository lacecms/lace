import { afterEach, expect, test } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpContentHandler } from "../dist/index.js";
import { ContentUseCases } from "@lacecms/application";
import { actorId, attenuateActor, unixMilliseconds } from "@lacecms/domain";
import { defineConfig, defineCollection, definePage } from "../../config/dist/index.js";
import { field } from "../../content/dist/index.js";
import {
  InMemoryContentStore,
  DeterministicClock,
  DeterministicIdGenerator,
} from "../../test-utils/dist/index.js";

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
  expect(models.items.map((m) => m.key)).toEqual(["home", "posts"]);
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
