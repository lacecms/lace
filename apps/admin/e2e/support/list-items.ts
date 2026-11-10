import { expect, type Locator, type Page } from "@playwright/test";

type Scope = Page | Locator;

/** Runs a list item's menu action by keyboard: open the item's menu, then choose the action. */
export async function itemAction(
  page: Page,
  item: string,
  action: "Duplicate" | "Move down" | "Move up" | "Remove",
  { scope = page, last = false }: { readonly scope?: Scope; readonly last?: boolean } = {},
) {
  const triggers = scope.getByRole("button", { name: `Actions for ${item}`, exact: true });
  await (last ? triggers.last() : triggers.first()).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: `${action} ${item}`, exact: true }).click();
  // A move returns focus to the moved row's menu; wait so later keys reach their target.
  const match = /^(.*) item (\d+)$/u.exec(item);
  if (match && (action === "Move down" || action === "Move up")) {
    const position = Number(match[2]) + (action === "Move down" ? 1 : -1);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label")))
      .toBe(`Actions for ${match[1]} item ${position}`);
  }
}

/** Opens a collapsed list item row with its chevron. */
export async function openItem(page: Page, item: string, scope: Scope = page) {
  await scope
    .getByRole("button", { name: `Expand ${item}`, exact: true })
    .first()
    .click();
}

/**
 * Opens every collapsed list item row, including rows revealed by opening
 * their parents, for tests that edit nested values rather than list rows.
 */
export async function openAllItems(page: Page) {
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  const collapsed = page.getByRole("button", { name: /^Expand .+ item \d+$/u });
  let lastList: ReturnType<Locator["elementHandle"]> | undefined;
  for (let opened = 0; opened < 50 && (await collapsed.count()) > 0; opened += 1) {
    const toggle = collapsed.first();
    lastList = toggle.locator("xpath=ancestor::ol[1]").elementHandle();
    await toggle.click();
  }
  // Clicking a later row can leave the first row of its list above the viewport.
  // Position the last opened list at the top so pointer interactions start onscreen.
  const list = await lastList;
  await list?.evaluate((element) => {
    element.scrollIntoView({ block: "start" });
    window.scrollBy(0, -200);
  });
}
