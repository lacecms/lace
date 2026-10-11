import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach } from "vitest";

// Real router transitions and query renders can exceed Testing Library's
// one-second default when the full workspace suite shares a CI runner.
configure({ asyncUtilTimeout: 5_000 });

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
// Sonner keeps notifications in a module store, so tests start without leftovers.
afterEach(() => {
  cleanup();
  toast.dismiss();
});

Object.defineProperty(window, "scrollTo", { value: () => undefined, writable: true });

// Radix primitives measure and scroll elements through browser APIs jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => undefined;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.setPointerCapture ??= () => undefined;

// ProseMirror measures the selection to scroll it into view.
const emptyRect = (): DOMRect => new DOMRect(0, 0, 0, 0);
const emptyRects = (): DOMRectList =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= emptyRect;
Range.prototype.getClientRects ??= emptyRects;
