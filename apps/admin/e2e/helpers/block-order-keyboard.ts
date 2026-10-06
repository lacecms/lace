import type { Locator, Page } from "@playwright/test";

/** One real keyboard move; shared by workspace e2e and packed release acceptance. */
export async function moveFirstHeroWithKeyboard(
  page: Page,
  cards: Locator,
  timeoutMs = 10_000,
): Promise<void> {
  const handle = cards.first().getByRole("button", { name: "Reorder Hero block" });
  const liveRegion = page.locator("[id^=DndLiveRegion]").first();
  const total = await cards.count();
  let stage = "block-order-keyboard-focus";
  const waitFor = async (check: () => Promise<boolean>) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await check()) return;
      await page.waitForTimeout(50);
    }
    throw new Error("keyboard reordering did not respond");
  };
  try {
    await handle.scrollIntoViewIfNeeded();
    await handle.focus();
    await waitFor(() => handle.evaluate((node) => document.activeElement === node));
    stage = "block-order-keyboard-pick";
    await handle.press("Space");
    await waitFor(async () => (await handle.getAttribute("aria-pressed")) === "true");
    await waitFor(async () => {
      const text = await liveRegion.textContent();
      return (
        text === `Picked up Hero block at position 1 of ${total}.` ||
        text === `Hero block moved to position 1 of ${total}.`
      );
    });
    // dnd-kit starts the drag before attaching keydown via setTimeout. It also
    // measures droppable rectangles after activation; scrolling and card
    // transitions must settle before sortableKeyboardCoordinates can use them.
    stage = "block-order-keyboard-layout";
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("drag layout did not settle")), 2_000);
        let previous = "";
        let stable = 0;
        const frame = () => {
          const geometry = JSON.stringify(
            [...document.querySelectorAll("article")].map((node) => {
              const { x, y, width, height } = node.getBoundingClientRect();
              return [x, y, width, height];
            }),
          );
          stable = geometry === previous ? stable + 1 : 0;
          previous = geometry;
          if (stable >= 2) {
            clearTimeout(timer);
            resolve();
          } else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    });
    stage = "block-order-keyboard-move";
    await page.keyboard.press("ArrowDown");
    await waitFor(
      async () =>
        (await liveRegion.textContent()) === `Hero block moved to position 2 of ${total}.`,
    );
    stage = "block-order-keyboard-drop";
    await page.keyboard.press("Space");
    await waitFor(
      async () =>
        (await liveRegion.textContent()) === `Hero block dropped at position 2 of ${total}.`,
    );
    await waitFor(async () => (await handle.getAttribute("aria-pressed")) !== "true");
  } catch {
    const state = await handle.evaluate((node) => ({
      focused: document.activeElement === node,
      pressed: node.getAttribute("aria-pressed"),
    }));
    const announcement = (await liveRegion.textContent()) ?? "";
    const safeAnnouncement =
      /^(?:Picked up Hero block at|Hero block (?:moved to|dropped at)) position \d+ of \d+\.$/u.test(
        announcement,
      )
        ? announcement
        : announcement === ""
          ? "<empty>"
          : "<unexpected>";
    const geometry = await cards.evaluateAll((nodes) =>
      nodes.slice(0, 3).map((node) => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    throw new Error(
      `${stage}: keyboard reordering did not respond; ${JSON.stringify({ ...state, announcement: safeAnnouncement, geometry })}`,
    );
  }
}
