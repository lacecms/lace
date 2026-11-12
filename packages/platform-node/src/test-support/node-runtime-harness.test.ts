import { existsSync } from "node:fs";
import { expect, test } from "vitest";
import { defineConfig, definePage } from "@lacecms/config";
import { actorId } from "@lacecms/domain";
import * as platform from "../index.js";
import { createTestActorResolver, openNodeTestRuntime } from "./node-runtime-harness.js";

const admin = { id: actorId("integration-admin"), role: "admin" } as const;

test("refuses to construct the test actor resolver outside Vitest", () => {
  const original = [...process.argv];
  process.argv.splice(0, process.argv.length, "node", "production.js");
  try {
    expect(() => createTestActorResolver(admin)).toThrow("available only in the Vitest runtime");
  } finally {
    process.argv.splice(0, process.argv.length, ...original);
  }
});

test("opens a synced runtime that answers as the test actor and closes idempotently", async () => {
  const config = await defineConfig({
    content: [
      definePage({ key: "zebra", path: "/zebra", version: 1, fields: {} }),
      definePage({ key: "home", path: "/", version: 1, fields: {} }),
    ],
  });
  const harness = await openNodeTestRuntime(platform, { config, actor: admin, sync: true });
  const response = await harness.request("/api/v1/admin/content-models");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ items: [{ key: "zebra" }, { key: "home" }] });
  await harness.close();
  await harness.close();
  expect(existsSync(harness.directory)).toBe(false);
});
