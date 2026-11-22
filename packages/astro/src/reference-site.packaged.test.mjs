import { expect, test } from "vitest";
import {
  buildReferenceSite,
  referenceSiteExport,
} from "../../../tests/fixtures/reference-site.mjs";

test("a static route renders the three selected records through a site-owned block", async () => {
  const exported = referenceSiteExport();
  const { html } = await buildReferenceSite(exported);
  expect(html).toContain("<ol><li>Clara</li><li>Anna</li><li>Boris</li></ol>");
  const [home] = exported.entries;
  const withoutReferences = await buildReferenceSite({
    ...exported,
    entries: [{ ...home, blocks: [] }],
    records: [],
  });
  expect(withoutReferences.html).toContain("<h1>Service</h1>");
}, 30_000);
