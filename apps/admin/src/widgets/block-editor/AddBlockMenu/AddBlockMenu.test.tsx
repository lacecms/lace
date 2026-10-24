import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Button } from "../../../shared/ui/Button/index.js";
import type { BlockDefinitionDto } from "../block-presentation.js";
import { AddBlockMenu } from "./index.js";

const definitions: BlockDefinitionDto[] = [
  {
    description: "Large heading with optional text, image, and action.",
    fields: {},
    label: "Hero",
    type: "hero",
    version: 1,
  },
  {
    description: "A quotation with optional attribution.",
    fields: {},
    label: "Quote",
    type: "quote",
    version: 1,
  },
  { fields: {}, type: "pricingTable", version: 1 },
];

function mount() {
  const onChoose = vi.fn();
  render(
    <AddBlockMenu definitions={definitions} onChoose={onChoose}>
      <Button>Add block</Button>
    </AddBlockMenu>,
  );
  return onChoose;
}

test("lists allowed blocks with labels and descriptions and chooses one", async () => {
  const user = userEvent.setup();
  const onChoose = mount();
  await user.click(screen.getByRole("button", { name: "Add block" }));
  const dialog = screen.getByRole("dialog", { name: "Add block" });
  expect(within(dialog).getByRole("searchbox", { name: "Filter blocks" })).toHaveFocus();
  const hero = within(dialog).getByRole("button", { name: "Hero" });
  expect(hero).toHaveAccessibleDescription("Large heading with optional text, image, and action.");
  expect(within(dialog).getByRole("button", { name: "Pricing Table" })).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Quote" }));
  expect(onChoose).toHaveBeenCalledWith(definitions[1]);
  expect(screen.queryByRole("dialog", { name: "Add block" })).not.toBeInTheDocument();
});

test("filters by description, moves with arrows, and chooses a single match with Enter", async () => {
  const user = userEvent.setup();
  const onChoose = mount();
  await user.click(screen.getByRole("button", { name: "Add block" }));
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("button", { name: "Quote" })).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("button", { name: "Pricing Table" })).toHaveFocus();
  await user.keyboard("{ArrowUp}{ArrowUp}");
  const filter = screen.getByRole("searchbox", { name: "Filter blocks" });
  expect(filter).toHaveFocus();
  await user.type(filter, "attribution");
  expect(screen.queryByRole("button", { name: "Hero" })).not.toBeInTheDocument();
  await user.keyboard("{Enter}");
  expect(onChoose).toHaveBeenCalledWith(definitions[1]);
});

test("states when no block matches and resets the filter on reopening", async () => {
  const user = userEvent.setup();
  const onChoose = mount();
  await user.click(screen.getByRole("button", { name: "Add block" }));
  await user.type(screen.getByRole("searchbox", { name: "Filter blocks" }), "gallery");
  expect(screen.getByRole("status")).toHaveTextContent("No blocks match “gallery”.");
  expect(screen.queryByRole("list", { name: "Blocks" })).not.toBeInTheDocument();
  await user.keyboard("{Enter}");
  expect(onChoose).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "Add block" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Add block" }));
  expect(screen.getByRole("searchbox", { name: "Filter blocks" })).toHaveValue("");
});

test("palette order stably retains custom types followed by Hero and CTA", async () => {
  const user = userEvent.setup();
  const definitions = ["cta", "custom", "hero", "image", "link"].map((type) => ({
    type,
    version: 1,
    fields: {},
  }));
  const choose = vi.fn();
  render(
    <AddBlockMenu definitions={definitions} onChoose={choose}>
      <Button>Add block</Button>
    </AddBlockMenu>,
  );
  await user.click(screen.getByRole("button", { name: "Add block" }));
  const dialog = screen.getByRole("dialog", { name: "Add block" });
  expect(
    within(dialog)
      .getAllByRole("button")
      .map((item) => item.textContent),
  ).toEqual(["Custom", "Image", "Link", "Hero", "Cta"]);
  expect(definitions.map((item) => item.type)).toEqual(["cta", "custom", "hero", "image", "link"]);
  await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
  expect(choose).toHaveBeenCalledWith(definitions[4]);
});
