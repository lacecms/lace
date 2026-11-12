import { expect, test } from "vitest";
import { defineCollection, defineConfig } from "@lacecms/config";
import { builtInBlocks, field } from "@lacecms/content";
import * as platform from "../dist/index.js";
import { openNodeTestRuntime } from "./test-support/node-runtime-harness.ts";

import { internalLinkHttpContract } from "../../../tests/fixtures/internal-link-http.mjs";
test("Node HTTP destination status and impact acknowledgment contract", async () => {
  const layout = { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["note"] }] };
  const config = await defineConfig({
    blocks: [builtInBlocks.cta],
    content: [
      defineCollection({
        key: "notes",
        route: "/notes/:slug",
        version: 1,
        fields: { note: field.text() },
        blocks: ["cta"],
        layout,
      }),
    ],
  });
  const { request } = await openNodeTestRuntime(platform, {
    config,
    actor: { id: "ce9b-admin", role: "admin" },
    sync: true,
  });
  const journey = await internalLinkHttpContract(async (path, init) => {
    const response = await request(path, {
      method: init.method,
      headers: init.headers,
      ...(init.json === undefined ? {} : { body: JSON.stringify(init.json) }),
    });
    return { response, body: response.status === 204 ? undefined : await response.json() };
  }, expect);
  const { internalLinkBuildContract } =
    await import("../../../tests/fixtures/internal-link-build.mjs");
  await internalLinkBuildContract(journey, expect);
}, 60_000);
