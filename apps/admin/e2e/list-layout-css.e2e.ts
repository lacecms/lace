import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
const source = new URL("../../../registry/astro/gallery/ListLayout.css", import.meta.url);
async function fixture(
  page: Page,
  width: number,
  preset = "auto",
  mode = "grid",
  wrap = true,
  count = 5,
) {
  await page.setContent(
    `<section data-lace-layout-container style="width:${width}px"><ol data-lace-layout="${mode}" data-lace-preset="${preset}" data-lace-wrap="${wrap}">${Array.from({ length: count }, (_, i) => `<li data-lace-layout-item>Card ${i}<ul><li>Nested</li></ul></li>`).join("")}</ol></section>`,
  );
  await page.addStyleTag({ content: await readFile(source, "utf8") });
  return page.locator("[data-lace-layout]");
}
test("LIST1 container thresholds are inclusive for all grid presets", async ({ page }) => {
  for (const width of [511, 512, 513, 767, 768, 769, 1023, 1024, 1025]) {
    for (const preset of [
      "auto",
      "columns-2",
      "columns-3",
      "columns-4",
      "narrow-wide",
      "wide-narrow",
      "featured-first",
    ]) {
      const list = await fixture(page, width, preset);
      const tracks = await list.evaluate((el) =>
        getComputedStyle(el).gridTemplateColumns.split(" ").map(parseFloat),
      );
      const expected =
        preset === "auto"
          ? Math.floor(width / 224)
          : width < 512
            ? 1
            : preset === "columns-4" && width >= 1024
              ? 4
              : ["columns-3", "columns-4"].includes(preset) && width >= 768
                ? 3
                : 2;
      expect(tracks.length, `${preset} at ${width}`).toBe(expected);
      if (width >= 512 && preset === "narrow-wide") expect(tracks[1]! / tracks[0]!).toBeCloseTo(2);
      if (width >= 512 && preset === "wide-narrow") expect(tracks[0]! / tracks[1]!).toBeCloseTo(2);
      const span = await list
        .locator(":scope > li")
        .first()
        .evaluate((el) => getComputedStyle(el).gridColumn);
      expect(span).toBe(preset === "featured-first" && width >= 512 ? "1 / -1" : "auto");
      const order = await list.locator(":scope > li").allTextContents();
      expect(order).toEqual(Array.from({ length: 5 }, (_, i) => `Card ${i}Nested`));
    }
  }
});
test("LIST1 empty/single/odd lists, flex wrapping, explicit height and CSS overrides", async ({
  page,
}) => {
  for (const count of [0, 1, 5])
    for (const mode of ["grid", "flex-row", "flex-column"]) {
      const list = await fixture(page, 400, "featured-first", mode, true, count);
      await expect(list.locator(":scope > li")).toHaveCount(count);
      expect(await list.evaluate((el) => getComputedStyle(el).display)).toBe(
        mode === "grid" ? "grid" : "flex",
      );
    }
  for (const mode of ["flex-row", "flex-column"])
    for (const wrap of [true, false]) {
      const list = await fixture(page, 400, "columns-4", mode, wrap);
      expect(await list.evaluate((el) => getComputedStyle(el).flexWrap)).toBe(
        wrap ? "wrap" : "nowrap",
      );
      await page.addStyleTag({ content: "[data-lace-layout-item] { flex-shrink: 0; }" });
      if (mode === "flex-column") {
        const natural = await list.boundingBox();
        expect(natural!.height).toBeGreaterThan(0);
        await list.evaluate((el) => {
          (el as HTMLElement).style.height = `${el.getBoundingClientRect().height / 2}px`;
        });
      }
      const boxes = await list
        .locator(":scope > li")
        .evaluateAll((els) =>
          els.map((el) => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })),
        );
      expect(mode === "flex-row" ? boxes[1]!.y > boxes[0]!.y : boxes[2]!.x > boxes[0]!.x).toBe(
        wrap,
      );
    }
  const list = await fixture(page, 640, "columns-3");
  expect(
    await list
      .locator("ul")
      .first()
      .evaluate((el) => getComputedStyle(el).listStyleType),
  ).toBe("circle");
  await page.addStyleTag({
    content: "[data-lace-layout] { display:grid; gap:23px; grid-template-columns: 100px 200px; }",
  });
  expect(
    await list.evaluate((el) => ({
      display: getComputedStyle(el).display,
      gap: getComputedStyle(el).gap,
      columns: getComputedStyle(el).gridTemplateColumns,
    })),
  ).toEqual({ display: "grid", gap: "23px", columns: "100px 200px" });
  await page.addStyleTag({ content: "[data-lace-layout] { display:block; }" });
  expect(await list.evaluate((el) => getComputedStyle(el).display)).toBe("block");
});
