import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test } from "vitest";
import { act } from "react";
import { revealControl } from "../../../shared/lib/index.js";
import { FieldLayout, layoutHasProblems } from "./index.js";

const fields = { first: {}, second: {}, extra: {} };
const layout = {
  mode: "tabs" as const,
  groups: [
    { key: "two", label: "Second tab", fields: ["second"] },
    { key: "one", label: "First tab", description: "First description", fields: ["first"] },
  ],
};
const renderField = (key: string) => <input aria-label={key} key={key} defaultValue={key} />;

test("orders tabs and unlisted fields, keeps controls mounted and reveals exact panels", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <FieldLayout
      fields={fields}
      layout={layout}
      renderField={renderField}
      errors={{ first: { message: "Invalid" } }}
    />,
  );
  const first = container.querySelector<HTMLInputElement>('[aria-label="first"]')!;
  expect(first).not.toBeVisible();
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.trim())).toEqual([
    "Second tab",
    "First tab Has problems",
  ]);
  expect(screen.getByRole("textbox", { name: "extra" })).toBeVisible();
  await user.type(screen.getByRole("textbox", { name: "second" }), " edited");
  await user.click(screen.getByRole("tab", { name: "First tab Has problems" }));
  await user.type(first, " edited");
  await user.click(screen.getByRole("tab", { name: "Second tab" }));
  act(() => revealControl(first));
  expect(screen.getByRole("textbox", { name: "first" })).toBe(first);
  expect(first).toHaveValue("first edited");
  expect(first).toBeVisible();
  expect(container.querySelector('[aria-label="second"]')).toHaveValue("second edited");
  await user.click(screen.getByRole("tab", { name: "First tab Has problems" }));
  await user.keyboard("{Home}");
  expect(screen.getByRole("tab", { name: "Second tab" })).toHaveFocus();
  await user.keyboard("{End}");
  expect(screen.getByRole("tab", { name: "First tab Has problems" })).toHaveFocus();
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("tab", { name: "Second tab" })).toHaveFocus();
});

test("sections and default layout retain order and independent instances", async () => {
  const { rerender } = render(<FieldLayout fields={fields} renderField={renderField} />);
  expect(screen.getAllByRole("textbox").map((el) => el.getAttribute("aria-label"))).toEqual([
    "first",
    "second",
    "extra",
  ]);
  rerender(
    <FieldLayout
      fields={fields}
      layout={{ ...layout, mode: "sections" }}
      renderField={renderField}
    />,
  );
  expect(screen.getAllByRole("textbox").map((el) => el.getAttribute("aria-label"))).toEqual([
    "second",
    "first",
    "extra",
  ]);
  expect(screen.getByRole("region", { name: "First tab" })).toHaveTextContent("First description");
});

test("hidden blocks ignore publication-only problems while retaining draft problems", () => {
  expect(layoutHasProblems({ child: { type: "publication", message: "Required" } }, true)).toBe(
    false,
  );
  expect(layoutHasProblems({ child: { type: "server", message: "Invalid" } }, true)).toBe(true);
});
