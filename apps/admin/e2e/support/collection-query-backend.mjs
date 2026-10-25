// Real HTTP API + migrated SQLite/local D1. Only the authenticated actor is a test fixture.
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import { defineCollection, defineConfig } from "../../../../packages/config/dist/index.js";
import {
  field,
  NODE_LIST_QUERY_LIMITS,
  CLOUDFLARE_LIST_QUERY_LIMITS,
} from "../../../../packages/content/dist/index.js";
import {
  ContentUseCases,
  ContentLinkUseCases,
  contentModelRoute,
  applyPreparedConfigurationSynchronization,
  prepareConfigurationSynchronization,
} from "../../../../packages/application/dist/index.js";
import { createLaceApp } from "../../../../packages/server/dist/index.js";
import {
  NodeContentRepository,
  migrateNodeDatabase,
  openNodeDatabase,
} from "../../../../packages/platform-node/dist/index.js";
import { D1ContentRepository } from "../../../../packages/platform-cloudflare/dist/index.js";
import { openLocalD1 } from "../../../../packages/platform-cloudflare/src/d1-test-harness.mjs";

export async function startCollectionQueryBackend(kind) {
  const directory = await mkdtemp(resolve(tmpdir(), "lace-cq-browser-"));
  const limits = kind === "d1" ? CLOUDFLARE_LIST_QUERY_LIMITS : NODE_LIST_QUERY_LIMITS;
  const config = await defineConfig({
    content: [
      defineCollection({
        key: "posts",
        label: "Posts",
        route: "/posts/:slug",
        version: 1,
        fields: {
          title: field.text({ label: "Custom title" }),
          summary: field.textarea({ label: "Description" }),
          orderText: field.textarea({ label: "Hidden order" }),
          year: field.number({ label: "Year" }),
          featured: field.boolean({ label: "Featured" }),
          category: field.select({ label: "Category", options: ["news", "events"] }),
        },
        listFields: ["title", "year", "featured"],
        listOptions: {
          sortableFields: ["title", "year", "orderText"],
          filterableFields: ["summary", "year", "featured", "category"],
          searchableFields: ["summary"],
        },
      }),
      defineCollection({ key: "legacy", label: "Legacy", route: "/legacy/:slug", version: 1 }),
    ],
  });
  let repository, dispose;
  const resolveModel = (key) => {
    const model = config.runtime.content.find((model) => model.key === key);
    return model && contentModelRoute(model);
  };
  if (kind === "d1") {
    const local = await openLocalD1();
    repository = new D1ContentRepository(local.database, resolveModel);
    dispose = local.dispose;
  } else {
    const path = resolve(directory, "lace.sqlite");
    migrateNodeDatabase(path);
    const db = openNodeDatabase(path);
    repository = new NodeContentRepository(db.connection, resolveModel);
    dispose = () => db.connection.close();
  }
  let sequence = 0;
  const ids = { next: () => `browser-${++sequence}` };
  const clock = { now: () => Date.now() };
  await applyPreparedConfigurationSynchronization({
    clock,
    ids,
    models: config.runtime.content,
    prepared: await prepareConfigurationSynchronization({
      models: config.runtime.content,
      state: repository,
    }),
    target: repository,
  });
  const content = new ContentUseCases({
    config: config.runtime,
    content: repository,
    media: repository,
    clock,
    idGenerator: ids,
    listQueryLimits: limits,
  });
  const admin = { id: "browser-admin", role: "admin" };
  for (let i = 0; i < 55; i++)
    await content.create({
      actor: admin,
      modelKey: "posts",
      title: `Record ${String(i).padStart(3, "0")}`,
      slug: `record-${i}`,
      blocks: [],
      fields: {
        title: `Custom ${String(i).padStart(3, "0")}`,
        summary: `Москва Launch Ёлка %_\\ ${i}`,
        orderText: "x".repeat(6000) + String(i).padStart(3, "0"),
        year: i,
        featured: i % 2 === 0,
        category: i % 2 === 0 ? "news" : "events",
      },
    });
  const requests = [];
  const responses = [];
  const app = createLaceApp({
    config,
    content,
    links: new ContentLinkUseCases(repository),
    publicContent: repository,
    actors: {
      resolve: async (request) => {
        const role =
          /cqRole=(admin|editor|viewer)/u.exec(request.headers.get("cookie") ?? "")?.[1] ??
          "viewer";
        return { id: `browser-${role}`, role };
      },
    },
    security: {
      readUserProfile: async (id) => ({
        id,
        email: `${id}@example.test`,
        name: "Query reader",
        disabled: false,
      }),
    },
    environment: { engineVersion: "test", openApiTitle: "CQ1 acceptance" },
    logger: { log() {} },
    maxBodyBytes: 1048576,
    readiness: { isReady: async () => true },
    rateLimiter: { check: async () => true },
    requestIds: ids,
  });
  const dist = resolve(import.meta.dirname, "../../dist");
  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, `http://${incoming.headers.host}`);
      if (url.pathname.startsWith("/api/")) {
        const chunks = [];
        for await (const chunk of incoming) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        const response = await app.fetch(
          new Request(url, {
            method: incoming.method,
            headers: incoming.headers,
            ...(body.length ? { body } : {}),
          }),
        );
        if (url.pathname.endsWith("/entries") && incoming.method === "GET") {
          requests.push(url.href);
          responses.push({
            url: url.href,
            status: response.status,
            body: await response.clone().json(),
          });
        }
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const file = url.pathname.startsWith("/admin/assets/")
        ? resolve(dist, url.pathname.slice(7))
        : resolve(dist, "index.html");
      if (!file.startsWith(dist + "/")) {
        outgoing.writeHead(404).end();
        return;
      }
      const type =
        {
          ".js": "text/javascript",
          ".css": "text/css",
          ".woff2": "font/woff2",
          ".html": "text/html",
        }[extname(file)] ?? "application/octet-stream";
      outgoing.writeHead(200, { "content-type": type });
      outgoing.end(await readFile(file));
    } catch (error) {
      outgoing.writeHead(500).end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    requests,
    responses,
    async mutateBoundary(action) {
      const page = [...responses]
        .reverse()
        .find(
          (response) =>
            response.body.nextCursor && !new URL(response.url).searchParams.has("limit"),
        );
      if (!page) throw new Error("No boundary page read");
      const boundary = page.body.items.at(-1);
      const loaded = await repository.load({ entryId: boundary.id });
      if (action === "delete")
        await content.delete({
          actor: admin,
          entryId: boundary.id,
          expectedRevision: loaded.draft.revision,
        });
      else
        await content.save({
          actor: admin,
          entryId: boundary.id,
          expectedRevision: loaded.draft.revision,
          title: loaded.draft.title,
          slug: loaded.draft.slug,
          blocks: loaded.draft.blocks,
          fields: { ...loaded.draft.fields, summary: "Edited unrelated field" },
        });
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await dispose();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
