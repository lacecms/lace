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
  placements: readonly string[] = [],
) {
  const item = (i: number) =>
    `<li data-lace-layout-item${placements[i] ? ` data-lace-placement="${placements[i]}"` : ""}>Card ${i}<ul><li>Nested</li></ul></li>`;
  await page.setContent(
    `<section data-lace-layout-container style="width:${width}px"><ol data-lace-layout="${mode}" data-lace-preset="${preset}" data-lace-wrap="${wrap}">${Array.from({ length: count }, (_, i) => item(i)).join("")}</ol></section>`,
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
      // Presets give no item a span.
      expect(span).toBe("auto");
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
      const list = await fixture(page, 400, "columns-2", mode, true, count);
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

// Grid row and column (1-based) of every direct item.
async function cells(list: ReturnType<Page["locator"]>) {
  return list.locator(":scope > li").evaluateAll((els) => {
    const tracks = getComputedStyle(els[0]!.parentElement!).gridTemplateColumns.split(" ");
    const tops = [...new Set(els.map((el) => Math.round(el.getBoundingClientRect().y)))].sort(
      (a, b) => a - b,
    );
    const left = els[0]!.parentElement!.getBoundingClientRect().x;
    const widths = tracks.map(parseFloat);
    const gap = parseFloat(getComputedStyle(els[0]!.parentElement!).columnGap) || 0;
    // Column start lines from the track sizes, so empty tracks still count.
    const starts = widths.map(
      (_, i) => left + widths.slice(0, i).reduce((sum, value) => sum + value + gap, 0),
    );
    return els.map((el) => {
      const box = el.getBoundingClientRect();
      const column = starts.findIndex((start) => Math.abs(start - box.x) < 1) + 1;
      const span = widths.filter(
        (_, i) => starts[i]! >= box.x - 1 && starts[i]! + widths[i]! <= box.right + 1,
      ).length;
      return { column, row: tops.indexOf(Math.round(box.y)) + 1, span };
    });
  });
}
test("LIST3 right column only: an end item leaves its row's first column empty", async ({
  page,
}) => {
  const list = await fixture(page, 640, "columns-2", "grid", true, 3, ["end", "auto", "auto"]);
  expect(await cells(list)).toEqual([
    { column: 2, row: 1, span: 1 },
    { column: 1, row: 2, span: 1 },
    { column: 2, row: 2, span: 1 },
  ]);
  expect(await list.locator(":scope > li").allTextContents()).toEqual(
    Array.from({ length: 3 }, (_, i) => `Card ${i}Nested`),
  );
});
test("LIST3 any item spans the row and start begins a row", async ({ page }) => {
  const full = await fixture(page, 896, "columns-3", "grid", true, 5, [
    "auto",
    "auto",
    "full",
    "auto",
    "auto",
  ]);
  expect(await cells(full)).toEqual([
    { column: 1, row: 1, span: 1 },
    { column: 2, row: 1, span: 1 },
    { column: 1, row: 2, span: 3 },
    { column: 1, row: 3, span: 1 },
    { column: 2, row: 3, span: 1 },
  ]);
  const start = await fixture(page, 896, "columns-3", "grid", true, 2, ["auto", "start"]);
  expect(await cells(start)).toEqual([
    { column: 1, row: 1, span: 1 },
    { column: 1, row: 2, span: 1 },
  ]);
  // Every preset honors placement, including auto-fill tracks.
  for (const preset of ["auto", "columns-4", "narrow-wide", "wide-narrow"]) {
    const list = await fixture(page, 1100, preset, "grid", true, 3, ["end", "full", "start"]);
    const [end, row, first] = await cells(list);
    const tracks = await list.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
    );
    expect(end, preset).toEqual({ column: tracks, row: 1, span: 1 });
    expect(row, preset).toEqual({ column: 1, row: 2, span: tracks });
    expect(first, preset).toEqual({ column: 1, row: 3, span: 1 });
  }
});
test("LIST3 placement in narrow grids and flex lists", async ({ page }) => {
  const placements = ["end", "full", "start", "auto"];
  const narrow = await fixture(page, 448, "columns-2", "grid", true, 4, placements);
  expect(await cells(narrow)).toEqual(
    placements.map((_, i) => ({ column: 1, row: i + 1, span: 1 })),
  );
  for (const mode of ["flex-row", "flex-column"]) {
    const flex = await fixture(page, 640, "columns-2", mode, true, 4, placements);
    const styles = await flex
      .locator(":scope > li")
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).gridColumn));
    expect(styles, mode).toEqual(["auto", "auto", "auto", "auto"]);
    const plain = await fixture(page, 640, "columns-2", mode, true, 4);
    const box = (l: ReturnType<Page["locator"]>) =>
      l.locator(":scope > li").evaluateAll((els) =>
        els.map((el) => {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        }),
      );
    const placed = await fixture(page, 640, "columns-2", mode, true, 4, placements);
    expect(await box(placed), mode).toEqual(await box(plain));
  }
});
