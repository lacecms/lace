import type { MediaFocalPointDto } from "@lacecms/contracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { FocalPointControl } from "./index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function Controlled({
  initial = null,
  onChange = vi.fn(),
}: {
  readonly initial?: MediaFocalPointDto | null;
  readonly onChange?: (point: MediaFocalPointDto | null) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <FocalPointControl
      filename="bike.png"
      mediaId="media-1"
      onChange={(point) => {
        setValue(point);
        onChange(point);
      }}
      value={value}
    />
  );
}

function imageBox() {
  const area = screen.getByRole("img", { name: "Preview of bike.png" }).parentElement!;
  vi.spyOn(area, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 400, 200));
  return area;
}

test("clicking the image places the focal point and focuses the marker", () => {
  const onChange = vi.fn();
  render(<Controlled onChange={onChange} />);
  const area = imageBox();
  fireEvent.pointerDown(area, { button: 0, clientX: 310, clientY: 70, pointerId: 1 });
  fireEvent.pointerUp(area, { button: 0, clientX: 310, clientY: 70, pointerId: 1 });
  expect(onChange).toHaveBeenLastCalledWith({ x: 0.75, y: 0.25 });
  const marker = screen.getByRole("slider", { name: "Focal point" });
  expect(marker).toHaveFocus();
  expect(marker).toHaveAttribute("aria-valuetext", "75% from left, 25% from top");
  expect(marker).toHaveAttribute("aria-valuenow", "75");
  expect(screen.getByText("Focal point: 75% from left, 25% from top")).toBeInTheDocument();
});

test("dragging follows the pointer and clamps at the image edge", () => {
  const onChange = vi.fn();
  render(<Controlled onChange={onChange} />);
  const area = imageBox();
  fireEvent.pointerDown(area, { button: 0, clientX: 110, clientY: 120, pointerId: 1 });
  fireEvent.pointerMove(area, { clientX: 210, clientY: 170, pointerId: 1 });
  fireEvent.pointerMove(area, { clientX: 900, clientY: 900, pointerId: 1 });
  fireEvent.pointerUp(area, { clientX: 900, clientY: 900, pointerId: 1 });
  fireEvent.pointerMove(area, { clientX: 20, clientY: 20, pointerId: 1 });
  expect(onChange.mock.calls.map(([point]) => point)).toEqual([
    { x: 0.25, y: 0.5 },
    { x: 0.5, y: 0.75 },
    { x: 1, y: 1 },
  ]);
});

test("a keyboard user steps the marker from the centre without scrolling", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Controlled onChange={onChange} />);
  const marker = screen.getByRole("slider", { name: "Focal point" });
  expect(marker).toHaveAttribute("aria-valuetext", "Not set, image centred");
  await user.tab();
  expect(marker).toHaveFocus();
  await user.keyboard("{ArrowRight}{ArrowRight}{Shift>}{ArrowUp}{/Shift}");
  expect(onChange).toHaveBeenLastCalledWith({ x: 0.52, y: 0.4 });
  expect(marker).toHaveAttribute("aria-valuetext", "52% from left, 40% from top");
  const keyDown = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "ArrowDown",
  });
  marker.dispatchEvent(keyDown);
  expect(keyDown.defaultPrevented).toBe(true);
});

test("reset clears the focal point", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Controlled initial={{ x: 0.2, y: 0.3 }} onChange={onChange} />);
  await user.click(screen.getByRole("button", { name: "Reset focal point" }));
  expect(onChange).toHaveBeenLastCalledWith(null);
  expect(screen.getByRole("slider", { name: "Focal point" })).toHaveAttribute(
    "aria-valuetext",
    "Not set, image centred",
  );
  expect(screen.getByRole("button", { name: "Reset focal point" })).toBeDisabled();
});

test("a read-only control shows the point and ignores input", () => {
  render(<FocalPointControl filename="bike.png" mediaId="media-1" value={{ x: 0.1, y: 0.9 }} />);
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reset focal point" })).not.toBeInTheDocument();
  expect(screen.getByText("Focal point: 10% from left, 90% from top")).toBeInTheDocument();
  const area = screen.getByRole("img", { name: "Preview of bike.png" }).parentElement!;
  expect(() => fireEvent.pointerDown(area, { button: 0, clientX: 1, clientY: 1 })).not.toThrow();
});

test("a disabled control keeps the marker out of the tab order", async () => {
  const onChange = vi.fn();
  render(
    <FocalPointControl
      disabled
      filename="bike.png"
      mediaId="media-1"
      onChange={onChange}
      value={null}
    />,
  );
  const marker = screen.getByRole("slider", { name: "Focal point" });
  expect(marker).toHaveAttribute("tabindex", "-1");
  expect(marker).toHaveAttribute("aria-disabled", "true");
  fireEvent.keyDown(marker, { key: "ArrowRight" });
  expect(onChange).not.toHaveBeenCalled();
});
