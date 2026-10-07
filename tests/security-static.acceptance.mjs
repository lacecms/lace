import { expect, test } from "vitest";
import { openProductRuntime } from "./support/cross-runtime-fixture.mjs";
import { apiJourney } from "../scripts/cross-runtime-api.mjs";
import { astroJourney } from "../scripts/cross-runtime-astro.mjs";

test("34B real SQLite/MinIO and local D1/R2 exports build secret-free static output", async () => {
  const results = [];
  for (const kind of ["node", "worker"]) {
    const f = await openProductRuntime(kind);
    try {
      const seed = await apiJourney(f);
      results.push(await astroJourney(f, seed));
    } finally {
      await f.close();
    }
  }
  expect(results[0]).toEqual(results[1]);
}, 240000);
