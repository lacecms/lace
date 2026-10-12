import { expect, type Locator, type Page } from "@playwright/test";

/** Presses Tab until `target` has focus, proving it is reachable in tab order. */
export async function tabTo(page: Page, target: Locator, limit = 60) {
  for (let presses = 0; presses < limit; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      await expectVisibleFocus(page);
      return;
    }
    await page.keyboard.press("Tab");
    await expectVisibleFocus(page);
  }
  await expect(target, `not reached within ${limit} Tab presses`).toBeFocused();
}

export async function expectVisibleFocus(page: Page) {
  const indication = await page.evaluate(() => {
    const element = document.activeElement;
    if (element === null || element === document.body) return "body";
    const style = getComputedStyle(element);
    return style.outlineStyle !== "none" && style.outlineWidth !== "0px"
      ? "outline"
      : style.boxShadow !== "none"
        ? "shadow"
        : `none on ${element.tagName.toLowerCase()} ${element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40) ?? ""}`;
  });
  expect(indication).not.toMatch(/^none/u);
}
