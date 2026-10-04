import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import {
  assertSafeRichText,
  existingSiteExport,
  hostileText,
  safeHref,
} from "../scripts/existing-site-acceptance.mjs";
import { upgradeMetadata } from "../scripts/template-upgrade-acceptance.mjs";

test("the existing-site export adds hostile text and a chosen link without changing its source", async () => {
  const source = JSON.parse(
    await readFile(
      new URL("../apps/site/src/fixtures/published-export.json", import.meta.url),
      "utf8",
    ),
  );
  const before = JSON.stringify(source);
  const exported = existingSiteExport(source, "javascript:alert(1)");
  expect(JSON.stringify(source)).toBe(before);
  expect(exported.entries.map((item) => item.path)).toEqual(["/", "/articles/first-post"]);
  const text = JSON.stringify(exported.entries[1].entry.published.blocks);
  expect(text).toContain(JSON.stringify(hostileText).slice(1, -1));
  expect(text).toContain("javascript:alert(1)");
  expect(JSON.stringify(existingSiteExport(source))).toContain(safeHref);
});

test("safe rich-text output escapes hostile text and keeps only the safe link", () => {
  const escaped = `<p>&lt;script&gt;window.laceXss=1&lt;/script&gt;&lt;img src=x onerror="laceXss()"&gt;</p><a href="${safeHref}">Safe link</a>`;
  expect(() => assertSafeRichText(escaped)).not.toThrow();
  expect(() => assertSafeRichText(`${escaped}<script>window.laceXss=1</script>`)).toThrow(
    "rendered as markup",
  );
  expect(() => assertSafeRichText(`${escaped}<img src=x onerror="x()">`)).toThrow(
    "rendered as markup",
  );
  expect(() => assertSafeRichText(`${escaped}<a href="javascript:x">x</a>`)).toThrow("safe URL");
  expect(() => assertSafeRichText(`<a href="${safeHref}">x</a>`)).toThrow("escaped text");
});

test("only conflict review and recovery records count as upgrade metadata", () => {
  expect(upgradeMetadata(".lace/conflicts/0.13.0/index.json")).toBe(true);
  expect(upgradeMetadata(".lace/upgrade/latest.json")).toBe(true);
  expect(upgradeMetadata(".lace/manifest.json")).toBe(false);
  expect(upgradeMetadata("docker-compose.yml")).toBe(false);
});
