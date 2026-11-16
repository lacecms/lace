import { expect, test } from "vitest";
import type { EnqueueSiteBuildInput, SiteBuildRecord } from "@lacecms/application";
import { SiteBuildUseCases, dispatcherEventId } from "@lacecms/application";
import { actorId, siteBuildId, unixMilliseconds } from "@lacecms/domain";

import { admin, editor, fixture } from "../test-support/app-harness.js";

test("admin build routes queue strict requests without running a trigger", async () => {
  const calls: EnqueueSiteBuildInput[] = [];
  const builds = new SiteBuildUseCases({
    clock: { now: () => unixMilliseconds(1) },
    builds: {
      listSiteBuilds: async () => [],
      getSiteBuild: async () => null,
      requestBuild: async (input) => {
        calls.push(input);
        return { coalesced: false, eventId: dispatcherEventId("event-1"), targetVersion: 4 };
      },
    },
  });
  const { app } = await fixture({ builds });
  const post = (path: string, body?: unknown, target = app) =>
    target.fetch(
      new Request(`https://lace.test${path}`, {
        method: "POST",
        ...(body === undefined
          ? {}
          : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
      }),
    );
  expect((await post("/api/v1/admin/builds")).status).toBe(202);
  expect((await post("/api/v1/admin/builds/failed-1/retry", {})).status).toBe(202);
  expect(calls).toMatchObject([
    { events: [{ payload: { reason: "manual" } }] },
    { events: [{ payload: { reason: "retry", retryOfBuildId: "failed-1" } }] },
  ]);
  expect((await post("/api/v1/admin/builds", { command: "echo secret" })).status).toBe(422);
  expect(calls).toHaveLength(2);
  const editorApp = (await fixture({ actor: editor, builds })).app;
  expect(
    (
      await editorApp.fetch(
        new Request("https://lace.test/api/v1/admin/builds", { method: "POST" }),
      )
    ).status,
  ).toBe(403);
  for (const path of ["/api/v1/admin/builds", "/api/v1/admin/builds/failed-1/retry"]) {
    const invalidBody = { unexpected: true };
    expect((await post(path, invalidBody, editorApp)).status).toBe(403);
    expect((await post(path, invalidBody)).status).toBe(422);
  }
  const invalidRetryId = "/api/v1/admin/builds/" + "x".repeat(500) + "/retry";
  expect((await post(invalidRetryId, {}, editorApp)).status).toBe(403);
  expect((await post(invalidRetryId, {})).status).toBe(422);
  expect(calls).toHaveLength(2);
});

test("partial build composition preserves request validation and authorization", async () => {
  const { app } = await fixture();
  const { app: viewerApp } = await fixture({ actor: { id: actorId("viewer"), role: "viewer" } });
  const path = "https://lace.test/api/v1/admin/builds";
  expect((await app.request(path, { method: "POST" })).status).toBe(500);
  expect((await viewerApp.request(path, { method: "POST" })).status).toBe(403);
});

test.each([admin, editor, { id: actorId("viewer"), role: "viewer" as const }])(
  "authenticated build reads expose source diagnostics for $role",
  async (actor) => {
    const build: SiteBuildRecord = {
      id: siteBuildId("build-1"),
      reason: "publication",
      status: "failed",
      targetVersion: 3,
      requestedBy: "admin",
      requestedAt: unixMilliseconds(1_000),
      startedAt: unixMilliseconds(2_000),
      completedAt: unixMilliseconds(3_000),
      error: "source_symlink",
      errorPath: "src/linked.astro",
    };
    const builds = new SiteBuildUseCases({
      clock: { now: () => unixMilliseconds(1) },
      builds: {
        listSiteBuilds: async () => [build],
        getSiteBuild: async (id) => (id === build.id ? build : null),
        requestBuild: async () => ({
          coalesced: false,
          eventId: dispatcherEventId("event-1"),
          targetVersion: 3,
        }),
      },
    });
    const { app } = await fixture({ actor, builds });
    const get = (path: string) => app.fetch(new Request(`https://lace.test${path}`));
    expect(await (await get("/api/v1/admin/site-builds")).json()).toMatchObject({
      items: [
        { id: "build-1", targetVersion: 3, error: "source_symlink", errorPath: "src/linked.astro" },
      ],
    });
    expect(await (await get("/api/v1/admin/site-builds/build-1")).json()).toMatchObject({
      error: "source_symlink",
      errorPath: "src/linked.astro",
    });
    expect((await get("/api/v1/admin/site-builds/missing")).status).toBe(404);
    const anonymous = (await fixture({ actor: null, builds })).app;
    expect(
      (await anonymous.fetch(new Request("https://lace.test/api/v1/admin/site-builds"))).status,
    ).toBe(401);
  },
);

test.each([admin, editor, { id: actorId("viewer"), role: "viewer" as const }])(
  "current build site is a safe read for $role",
  async (actor) => {
    const site = { id: "public-site", label: "Public site" };
    const { app } = await fixture({ actor, buildSite: site });
    const response = await app.fetch(new Request("https://lace.test/api/v1/admin/build-site"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ site });
    expect(
      (
        await app.fetch(
          new Request("https://lace.test/api/v1/admin/build-site", { method: "POST" }),
        )
      ).status,
    ).toBe(404);
  },
);

test("current build site is unknown by default and anonymous reads fail", async () => {
  const { app } = await fixture();
  expect(
    await (await app.fetch(new Request("https://lace.test/api/v1/admin/build-site"))).json(),
  ).toEqual({ site: null });
  const anonymous = (await fixture({ actor: null })).app;
  expect(
    (await anonymous.fetch(new Request("https://lace.test/api/v1/admin/build-site"))).status,
  ).toBe(401);
});
