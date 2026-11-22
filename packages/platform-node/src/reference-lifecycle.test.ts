import { expect, test } from "vitest";
import {
  assertReferenceLifecycleRest,
  referenceLifecycleConfig,
  admin,
  viewer,
} from "@lacecms/test-utils";
import * as platform from "./index.js";
import { openNodeTestRuntime } from "./test-support/node-runtime-harness.js";

test("Node REST exposes reference targets, verified cycle evidence and reviewed removal", async () => {
  let actor = admin;
  const runtime = await openNodeTestRuntime(platform, {
    config: await referenceLifecycleConfig(),
    actors: { resolve: async () => actor },
    sync: true,
  });
  await assertReferenceLifecycleRest(
    {
      request: runtime.request,
      raceRequest: runtime.request,
      asViewer: async (run) => {
        actor = viewer;
        try {
          await run();
        } finally {
          actor = admin;
        }
      },
    },
    expect,
  );
});
