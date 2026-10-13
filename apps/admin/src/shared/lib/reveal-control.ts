/**
 * Bubbles from a control to synchronously expand enclosing disclosures and
 * show its block tab before focus moves to it.
 */
export const REVEAL_CONTROL_EVENT = "lace:reveal-control";

/** Asks enclosing disclosure and tab owners to reveal `element`. */
export function revealControl(element: HTMLElement): void {
  element.dispatchEvent(new Event(REVEAL_CONTROL_EVENT, { bubbles: true }));
}
