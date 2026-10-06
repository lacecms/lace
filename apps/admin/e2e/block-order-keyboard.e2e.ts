import { expect, test, type Page } from "@playwright/test";
import { moveFirstHeroWithKeyboard } from "./helpers/block-order-keyboard.js";

/** Deliberately defer activation/layout, or leave ArrowDown unhandled. */
async function fixture(page: Page, responds: boolean) {
  await page.setContent(`
    <style>article { height: 300px; width: 400px; margin: 8px; }</style>
    <main>
      <article data-key="a"><button aria-label="Reorder Hero block" aria-pressed="false">Move</button></article>
      <article data-key="b"><button aria-label="Reorder Hero block" aria-pressed="false">Move</button></article>
      <article data-key="c"><button aria-label="Reorder Hero block" aria-pressed="false">Move</button></article>
    </main>
    <div id="DndLiveRegion-fixture" role="status"></div>
    <input value="private-form-sentinel">
  `);
  await page.evaluate((responds) => {
    const button = document.querySelector("button")!;
    const region = document.getElementById("DndLiveRegion-fixture")!;
    let active = false;
    let moved = false;
    document.body.dataset.moves = "0";
    button.addEventListener("keydown", (event) => {
      if (event.code !== "Space" || active) return;
      event.preventDefault();
      active = true;
      button.setAttribute("aria-pressed", "true");
      // Visible activation precedes the listener and a late card resize.
      setTimeout(() => {
        document.querySelector("article")!.style.height = "360px";
        document.addEventListener("keydown", (event) => {
          if (event.code === "ArrowDown") {
            event.preventDefault();
            document.body.dataset.moves = String(Number(document.body.dataset.moves) + 1);
            if (!responds) return;
            moved = true;
            region.textContent = "Hero block moved to position 2 of 3.";
          } else if (event.code === "Space" && moved) {
            event.preventDefault();
            document.querySelectorAll("article")[1]!.after(button.closest("article")!);
            button.setAttribute("aria-pressed", "false");
            region.textContent = "Hero block dropped at position 2 of 3.";
          }
        });
        region.textContent = "Picked up Hero block at position 1 of 3.";
      }, 80);
    });
  }, responds);
}

test("keyboard harness waits for deferred activation and layout and sends one move", async ({
  page,
}) => {
  await fixture(page, true);
  await moveFirstHeroWithKeyboard(page, page.getByRole("article"));
  await expect(page.locator("body")).toHaveAttribute("data-moves", "1");
  await expect(page.getByRole("article").first()).toHaveAttribute("data-key", "b");
});

test("keyboard harness fails with safe drag state when the move does not respond", async ({
  page,
}) => {
  await fixture(page, false);
  let failure: unknown;
  try {
    await moveFirstHeroWithKeyboard(page, page.getByRole("article"), 300);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  const message = (failure as Error).message;
  expect(message).toContain("block-order-keyboard-move: keyboard reordering did not respond");
  expect(message).toContain('"focused":true');
  expect(message).toContain('"pressed":"true"');
  expect(message).toContain('"geometry":');
  expect(message).not.toContain("private-form-sentinel");
  await expect(page.locator("body")).toHaveAttribute("data-moves", "1");
  await expect(page.getByRole("article").first()).toHaveAttribute("data-key", "a");
});
