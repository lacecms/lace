import { expect, test } from "vitest";
import { resolve } from "node:path";
import { openProductRuntime } from "./support/cross-runtime-fixture.mjs";
import { apiJourney } from "../scripts/cross-runtime-api.mjs";
import { astroJourney } from "../scripts/cross-runtime-astro.mjs";
import { browserJourney } from "../scripts/cross-runtime-browser.mjs";

test("34A both real compositions satisfy shared API, Astro and browser expectations", async () => {
  const results = [];
  for (const kind of ["node", "worker"]) {
    const f = await openProductRuntime(kind);
    try {
      const seed = await apiJourney(f);
      const astro = await astroJourney(f, seed);
      await browserJourney(f, resolve("."));
      results.push({ canonical: seed.canonical, astro });
    } finally {
      await f.close();
    }
  }
  expect(results[0]).toEqual(results[1]);
}, 360000);
