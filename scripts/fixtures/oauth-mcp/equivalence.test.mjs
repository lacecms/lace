import { expect, test } from "vitest";
import { openMcpRuntime } from "./runtime.mjs";
const data = {
  title: "Shared entry",
  slug: "shared-entry",
  fields: { author: "Writer", score: 2 },
  blocks: [],
};
const result = (value) => {
  expect(JSON.parse(value.content[0].text)).toEqual(value.structuredContent);
  return value.structuredContent;
};
for (const kind of ["SQLite", "D1"]) {
  test(`${kind}: REST and MCP share discovery, queries, projections, complete drafts and errors`, async () => {
    const f = await openMcpRuntime(kind);
    let client;
    try {
      await f.login();
      client = await f.connect(await f.authorize());
      const models = result(await client.callTool({ name: "list_content_models", arguments: {} }));
      expect(models).toEqual((await f.rest("/api/v1/admin/content-models")).body);
      const created = await f.rest("/api/v1/admin/models/posts/entries", {
        method: "POST",
        json: data,
      });
      expect(created.response.status).toBe(201);
      const id = created.body.id;
      expect(
        result(await client.callTool({ name: "get_entry", arguments: { entryId: id } })),
      ).toEqual(created.body);
      const filters = [{ field: "score", op: "range", min: 2 }];
      const query = new URLSearchParams({
        q: "Writer",
        sort: "title",
        filters: JSON.stringify(filters),
      });
      expect(
        result(
          await client.callTool({
            name: "list_entries",
            arguments: { modelKey: "posts", q: "Writer", sort: "title", filters },
          }),
        ),
      ).toEqual((await f.rest(`/api/v1/admin/models/posts/entries?${query}`)).body);
      for (const invalid of [
        [{ field: "score", op: "gte", value: 2 }],
        [{ field: "score", op: "eq", value: "bad" }],
        [{ field: "missing", op: "isSet" }],
      ]) {
        const badQuery = new URLSearchParams({ filters: JSON.stringify(invalid) });
        const rest = await f.rest(`/api/v1/admin/models/posts/entries?${badQuery}`);
        expect(rest.response.status).toBe(422);
        expect(
          result(
            await client.callTool({
              name: "list_entries",
              arguments: { modelKey: "posts", filters: invalid },
            }),
          ),
        ).toEqual(rest.body);
      }
      const mcpCreated = result(
        await client.callTool({
          name: "create_entry",
          arguments: { ...data, slug: "mcp-created", modelKey: "posts", fields: {} },
        }),
      );
      expect(mcpCreated.draft.fields).toEqual({ author: "Unknown" });
      expect((await f.rest(`/api/v1/admin/entries/${mcpCreated.id}`)).body).toEqual(mcpCreated);
      const save = { ...data, title: "Updated through MCP", entryId: id, expectedRevision: 1 };
      const saved = result(await client.callTool({ name: "save_draft", arguments: save }));
      expect((await f.rest(`/api/v1/admin/entries/${id}`)).body).toEqual(saved);
      const global = (await f.rows("select id from content_entries where model_key='settings'"))[0];
      for (const fields of [
        { unknown: "private-value" },
        { image: "missing-media" },
        { link: `entry:${global.id}` },
      ]) {
        const body = { ...data, fields, expectedRevision: saved.draft.revision };
        const rest = await f.rest(`/api/v1/admin/entries/${id}/draft`, {
          method: "PUT",
          json: body,
        });
        const mcp = await client.callTool({
          name: "save_draft",
          arguments: { ...body, entryId: id },
        });
        expect(rest.response.status, Object.keys(fields).join(",")).toBe(422);
        expect(mcp.isError).toBe(true);
        expect(result(mcp)).toEqual(rest.body);
      }
      const singleton = await f.rest("/api/v1/admin/models/home/entries", {
        method: "POST",
        json: data,
      });
      const mcpSingleton = await client.callTool({
        name: "create_entry",
        arguments: { ...data, modelKey: "home" },
      });
      expect(result(mcpSingleton)).toEqual(singleton.body);
      const tooLong = "x".repeat(models.listQueryLimits.maxSearchLength + 1);
      const restQuery = await f.rest(`/api/v1/admin/models/posts/entries?q=${tooLong}`);
      expect(
        result(
          await client.callTool({
            name: "list_entries",
            arguments: { modelKey: "posts", q: tooLong },
          }),
        ),
      ).toEqual(restQuery.body);
      if (kind === "D1") expect(Math.max(...f.measurements)).toBeLessThanOrEqual(50);
      expect(JSON.stringify(f.logs)).not.toMatch(
        /private-value|code_verifier|access_token|refresh_token/,
      );
    } finally {
      await client?.close();
      await f.close();
    }
  }, 30000);
  test(`${kind}: browser/MCP stale saves have one winner and draft edits preserve public state`, async () => {
    const f = await openMcpRuntime(kind);
    let client;
    try {
      await f.login();
      client = await f.connect(await f.authorize());
      const created = await f.rest("/api/v1/admin/models/posts/entries", {
        method: "POST",
        json: data,
      });
      const id = created.body.id;
      const published = await f.rest(`/api/v1/admin/entries/${id}/publish`, {
        method: "POST",
        json: { expectedRevision: 1 },
      });
      expect(published.response.status).toBe(200);
      // Finish any existing post-publication work before comparing draft effects.
      await f.settle();
      const baseline = await f.runtime.repository.publishedContentVersion();
      const outbox = await f.rows("select count(*) as total from outbox_events");
      const before = (await f.rest(`/api/v1/admin/entries/${id}`)).body;
      const expectedRevision = before.draft.revision;
      const [rest, mcp] = await Promise.all([
        f.rest(`/api/v1/admin/entries/${id}/draft`, {
          method: "PUT",
          json: { ...data, title: "Browser", expectedRevision },
        }),
        client.callTool({
          name: "save_draft",
          arguments: { ...data, title: "MCP", entryId: id, expectedRevision },
        }),
      ]);
      expect([rest.response.status === 200, !mcp.isError].filter(Boolean)).toHaveLength(1);
      if (rest.response.status !== 200)
        expect(rest.body.error.code).toBe("CONTENT_REVISION_CONFLICT");
      if (mcp.isError) expect(result(mcp).error.code).toBe("CONTENT_REVISION_CONFLICT");
      const after = (await f.rest(`/api/v1/admin/entries/${id}`)).body;
      expect(after.published).toEqual(before.published);
      expect(after.draft.revision).toBe(expectedRevision + 1);
      expect(await f.runtime.repository.publishedContentVersion()).toBe(baseline);
      expect(await f.rows("select count(*) as total from outbox_events")).toEqual(outbox);
    } finally {
      await client?.close();
      await f.close();
    }
  }, 30000);
}

for (const kind of ["SQLite", "D1"]) {
  test(`${kind}: delegated publication matches REST results, guards and coalesced builds`, async () => {
    const f = await openMcpRuntime(kind);
    let client;
    try {
      await f.login();
      client = await f.connect(await f.authorize(true, true));
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toHaveLength(6);
      expect(names).toContain("publish_entry");
      for (const name of ["unpublish_entry", "delete_entry", "revert_draft", "duplicate_entry"])
        await expect(client.callTool({ name, arguments: {} })).rejects.toThrow();
      const created = (
        await f.rest("/api/v1/admin/models/posts/entries", { method: "POST", json: data })
      ).body;
      const args = {
        entryId: created.id,
        expectedRevision: 1,
        idempotencyKey: "shared-publication",
      };
      const published = result(await client.callTool({ name: "publish_entry", arguments: args }));
      expect(published.publication).toBe("published");
      const publicEntry = await f.runtime.repository.loadPublic("/blog/shared-entry");
      expect(publicEntry.entry.published.title).toBe(data.title);
      expect(publicEntry.entry.published.id).toBe(published.entry.published.id);
      expect(published.entry).toEqual((await f.rest(`/api/v1/admin/entries/${created.id}`)).body);
      const replay = result(await client.callTool({ name: "publish_entry", arguments: args }));
      const restReplay = await f.rest(`/api/v1/admin/entries/${created.id}/publish`, {
        method: "POST",
        json: { expectedRevision: 1 },
        headers: { "Idempotency-Key": args.idempotencyKey },
      });
      expect(restReplay.response.status).toBe(200);
      expect(replay).toEqual(restReplay.body);
      expect(replay.publication).toBe("replayed");
      const second = (
        await f.rest("/api/v1/admin/models/posts/entries", {
          method: "POST",
          json: { ...data, slug: "second" },
        })
      ).body;
      expect(
        result(
          await client.callTool({
            name: "publish_entry",
            arguments: { entryId: second.id, expectedRevision: 1 },
          }),
        ).publication,
      ).toBe("published");
      expect(
        await f.rows(
          "select id from outbox_events where type='site.build.requested' and processed_at is null",
        ),
      ).toHaveLength(1);
      const version = await f.runtime.repository.publishedContentVersion();
      const duplicate = (
        await f.rest("/api/v1/admin/models/posts/entries", { method: "POST", json: data })
      ).body;
      const target = (
        await f.rest("/api/v1/admin/models/posts/entries", {
          method: "POST",
          json: { ...data, slug: "target" },
        })
      ).body;
      const linked = (
        await f.rest("/api/v1/admin/models/posts/entries", {
          method: "POST",
          json: { ...data, slug: "linked", fields: { link: `entry:${target.id}` } },
        })
      ).body;
      const invalid = (
        await f.rest("/api/v1/admin/models/required/entries", {
          method: "POST",
          json: { title: "Incomplete draft", slug: "incomplete", fields: {}, blocks: [] },
        })
      ).body;
      for (const [entry, revision] of [
        [created, 0],
        [duplicate, 1],
        [linked, 1],
        [invalid, 1],
      ]) {
        const rest = await f.rest(`/api/v1/admin/entries/${entry.id}/publish`, {
          method: "POST",
          json: { expectedRevision: revision },
        });
        const mcp = await client.callTool({
          name: "publish_entry",
          arguments: { entryId: entry.id, expectedRevision: revision },
        });
        expect(rest.response.status).toBeGreaterThanOrEqual(400);
        expect(mcp.isError).toBe(true);
        expect(result(mcp)).toEqual(rest.body);
        expect(await f.runtime.repository.publishedContentVersion()).toBe(version);
      }
      expect(
        await f.rows(
          "select id from outbox_events where type='site.build.requested' and processed_at is null",
        ),
      ).toHaveLength(1);
      expect(JSON.stringify(f.logs)).not.toMatch(/access_token|refresh_token|code_verifier/);
    } finally {
      await client?.close();
      await f.close();
    }
  }, 30000);
}
