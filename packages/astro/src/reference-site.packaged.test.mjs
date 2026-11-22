import { expect, test } from "vitest";
import { buildReferenceSite } from "../../../tests/fixtures/reference-site.mjs";

const publishedAt = "2026-09-20T00:00:00.000Z";
const content = { fields: {}, blocks: [], internalLinks: [], publishedAt };

test("a static route renders the three selected records through a site-owned block", async () => {
  const home = { ...content, id: "home", modelKey: "home", path: "/", title: "Service" };
  const exported = {
    formatVersion: 2,
    version: 1,
    records: ["Anna", "Boris", "Clara"].map((title) => ({
      ...content,
      title,
      id: title,
      modelKey: "testimonials",
    })),
    globals: [],
    media: {},
    seo: { defaults: null, models: {} },
    entries: [
      {
        ...home,
        blocks: [
          {
            key: "reviews",
            type: "selection",
            position: 0,
            schemaVersion: 1,
            data: { reviews: ["Clara", "Anna", "Boris"] },
          },
        ],
      },
    ],
  };
  const { html } = await buildReferenceSite(exported);
  expect(html).toContain("<ol><li>Clara</li><li>Anna</li><li>Boris</li></ol>");
  const withoutReferences = await buildReferenceSite({ ...exported, entries: [home], records: [] });
  expect(withoutReferences.html).toContain("<h1>Service</h1>");
}, 30_000);
