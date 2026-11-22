import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// The acceptance gate is WCAG A and AA. Best-practice rules stay off because
// they flag intentional patterns such as portalled toasts outside landmarks.
const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Audits the settled page against WCAG A/AA and fails with each rule and element. */
export async function expectNoAccessibilityViolations(page: Page, screen: string) {
  // Callers await the specific screen before auditing. Background polling and
  // open connections are independent of the rendered accessibility tree.
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  // Colors measured mid-transition (for example a button fading back from its
  // disabled opacity) are not the settled state the audit is meant to check.
  // Infinite animations such as spinners are skipped because they never finish.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const { violations } = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  const report = violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? "unknown"}): ${violation.help}\n` +
      violation.nodes
        .map((node) => `  ${node.target.join(" ")}: ${node.failureSummary ?? ""}\n    ${node.html}`)
        .join("\n"),
  );
  expect(report, `Accessibility violations on ${screen}`).toEqual([]);
}
