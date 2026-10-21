import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";
import { ChoiceCards } from "./index.js";

function Harness({ disabled = false }: { readonly disabled?: boolean }) {
  const [value, setValue] = useState<string>();
  return (
    <>
      <button>Before</button>
      <ChoiceCards
        choices={[
          { value: "", label: "No selection" },
          { value: "a", label: "First", description: "Text card" },
          {
            value: "b",
            label: "Second",
            diagram: { cells: [{ x: 0, y: 0, width: 12, height: 12 }] },
          },
        ]}
        describedBy={undefined}
        disabled={disabled}
        id="cards"
        invalid={false}
        label="Composition"
        onBlur={() => {}}
        onChange={setValue}
        value={value ?? ""}
      />
      <button>After</button>
    </>
  );
}
test("cards support text, diagrams and one native tab stop with wrapping arrows, Home, End and Space", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.tab();
  expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();
  await user.tab();
  const empty = screen.getByRole("radio", { name: "No selection" });
  expect(empty).toHaveFocus();
  await user.keyboard("{ArrowLeft}");
  const second = screen.getByRole("radio", { name: "Second" });
  expect(second).toBeChecked();
  expect(second).toHaveFocus();
  await user.keyboard("{ArrowRight}");
  expect(empty).toBeChecked();
  await user.keyboard("{End}");
  expect(second).toBeChecked();
  await user.keyboard("{Home}");
  expect(empty).toBeChecked();
  await user.keyboard("{ArrowDown} ");
  expect(screen.getByRole("radio", { name: "First" })).toBeChecked();
  await user.keyboard("{ArrowUp}");
  expect(empty).toBeChecked();
  await user.tab();
  expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  expect(screen.getByText("Text card")).toBeVisible();
  expect(document.querySelector('[aria-hidden="true"]')).not.toBeNull();
});
test("disabled cards cannot mutate", async () => {
  const user = userEvent.setup();
  render(<Harness disabled />);
  await user.click(screen.getByRole("radio", { name: "Second" }));
  expect(screen.getByRole("radio", { name: "No selection" })).toBeChecked();
});
