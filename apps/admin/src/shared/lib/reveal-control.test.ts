import { expect, test, vi } from "vitest";
import { REVEAL_CONTROL_EVENT, revealControl } from "./reveal-control.js";

test("asks all enclosing disclosure and tab owners to reveal a control", () => {
  document.body.innerHTML = `
    <div id="owner">
      <div role="tabpanel" hidden><input id="hidden-control" /></div>
      <div role="tabpanel"><input id="shown-control" /></div>
      <input id="loose-control" />
    </div>`;
  const listener = vi.fn();
  document.getElementById("owner")?.addEventListener(REVEAL_CONTROL_EVENT, listener);
  for (const id of ["shown-control", "loose-control", "hidden-control"])
    revealControl(document.getElementById(id) as HTMLElement);
  expect(listener).toHaveBeenCalledTimes(3);
  expect((listener.mock.calls[2]![0] as Event).target).toBe(
    document.getElementById("hidden-control"),
  );
});
