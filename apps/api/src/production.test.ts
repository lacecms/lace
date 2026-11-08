// @ts-nocheck
// TODO(rf2): Type legacy Node runtime fixtures, partial adapters and project configuration helpers.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { actorId, unixMilliseconds } from "@lacecms/domain";
import {
  migrateNodeDatabase,
  NodeContentRepository,
  NodeSiteBuildDispatcher,
  openNodeDatabase,
} from "@lacecms/platform-node";
import { createNodeAdminAssets } from "./server/admin-assets.js";
import { startDispatchLoop } from "./dispatch/dispatcher-loop.js";

test("serves admin bundle and client routes without exposing other paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-admin-"));
  try {
    await writeFile(join(root, "index.html"), "admin app");
    const assets = createNodeAdminAssets(root);
    const get = (path) => assets.fetch(new Request(`http://lace.test${path}`));
    expect(await (await get("/admin/builds")).text()).toBe("admin app");
    expect((await get("/other")).status).toBe(404);
    expect((await get("/admin/%2e%2e/private.txt")).status).toBe(404);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("separate dispatcher keeps polling after one build dispatch failure", async () => {
  let builds = 0;
  let media = 0;
  let errors = 0;
  const loop = startDispatchLoop({
    build: async () => {
      builds += 1;
      if (builds === 1) throw new Error("offline");
    },
    media: async () => {
      media += 1;
    },
    onError: () => {
      errors += 1;
    },
    intervalMs: 5,
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  await loop.close();
  expect(builds).toBeGreaterThan(1);
  expect(media).toBe(builds);
  expect(errors).toBe(1);
});

test("a separate worker recovers durable build work after the API connection closes", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-worker-"));
  const path = join(root, "lace.sqlite");
  try {
    migrateNodeDatabase(path);
    const api = openNodeDatabase(path);
    const apiRepository = new NodeContentRepository(api.connection, () => undefined);
    const receipt = await apiRepository.requestBuild({
      requestedAt: unixMilliseconds(1_000),
      requestedBy: { id: actorId("admin"), role: "admin" },
    });
    api.connection.close();

    const worker = openNodeDatabase(path);
    try {
      const work = new NodeContentRepository(worker.connection, () => undefined);
      const dispatcher = new NodeSiteBuildDispatcher({
        clock: { now: () => unixMilliseconds(6_000) },
        logger: { error() {} },
        trigger: { trigger: async () => ({ status: "succeeded" }) },
        work,
      });
      await dispatcher.runOnce();
      expect(await work.getSiteBuild(receipt.eventId)).toMatchObject({ status: "succeeded" });
    } finally {
      worker.connection.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
