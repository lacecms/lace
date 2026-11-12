import { afterEach, expect, test } from "vitest";
import { createCloudflareWorker } from "../dist/index.js";
import { createWorkerFixture } from "./test-support/worker-harness.ts";

const cleanups = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
const workerFixture = (options = {}) =>
  createWorkerFixture(createCloudflareWorker, cleanups, options);

test("authenticated Worker destination status and impact acknowledgment contract", async () => {
  const fixture = await workerFixture();
  await fixture.signIn();
  const { internalLinkHttpContract } =
    await import("../../../tests/fixtures/internal-link-http.mjs");
  const journey = await internalLinkHttpContract(fixture.call, expect);
  const { internalLinkBuildContract } =
    await import("../../../tests/fixtures/internal-link-build.mjs");
  await internalLinkBuildContract(journey, expect);
  await fixture.settle();
}, 60_000);
