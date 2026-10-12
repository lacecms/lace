/**
 * Bubbles from a control inside a hidden tab panel to ask the region that
 * owns the tabs to show that panel synchronously, so the control can take
 * focus right after.
 */
export const REVEAL_CONTROL_EVENT = "lace:reveal-control";

/** Asks the owner of a hidden tab panel around `element` to show it. */
export function revealControl(element: HTMLElement): void {
  const panel = element.closest<HTMLElement>('[role="tabpanel"]');
  if (panel === null || !panel.hidden) return;
  element.dispatchEvent(new Event(REVEAL_CONTROL_EVENT, { bubbles: true }));
}
