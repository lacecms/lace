import { fieldEditorServices } from "../../../entities/content/index.js";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { defineBlock, field, toBlockMetadata } from "@lacecms/content";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { useForm } from "react-hook-form";
import { expect, test, vi } from "vitest";
import { type DraftEditorValues } from "../../../entities/content/index.js";
import { FieldRendererProvider } from "../../../entities/field-editor/index.js";
import type { BlockDefinitionDto } from "../block-presentation.js";
import { BlockCard } from "./index.js";

const promo = toBlockMetadata(
  defineBlock({
    fields: {
      heading: field.text({ label: "Heading", required: true }),
      hasCta: field.boolean({ label: "Has call to action" }),
      ctaUrl: field.url({ label: "Action URL", required: true }),
    },
    label: "Promo",
    type: "promo",
    version: 1,
    visibility: { ctaUrl: { field: "hasCta", values: [true] } },
  }),
) as BlockDefinitionDto;

const key = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

function Harness({
  data,
  ...props
}: Omit<ComponentProps<typeof BlockCard>, "blockKey" | "control" | "definition"> & {
  readonly data: Record<string, unknown>;
}) {
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: { blocks: [], fields: {}, title: "" },
  });
  useState(() =>
    form.reset({
      blocks: [
        {
          data: data as never,
          hidden: false,
          key,
          position: 100,
          schemaVersion: 1,
          settings: {},
          type: "promo",
        },
      ],
      fields: {},
      title: "Home",
    }),
  );
  return (
    <FieldRendererProvider services={fieldEditorServices} editor={{ form }} renderers={{}}>
      <DndContext>
        <SortableContext items={[key]}>
          <BlockCard {...props} blockKey={key} control={form.control} definition={promo} />
        </SortableContext>
      </DndContext>
      <output data-testid="data">{JSON.stringify(form.watch("blocks.0.data"))}</output>
    </FieldRendererProvider>
  );
}

const base = {
  active: false,
  collapsed: false,
  error: undefined,
  index: 0,
  onActivate: vi.fn(),
  onDuplicate: vi.fn(),
  onMove: vi.fn(),
  onRemove: vi.fn(),
  onToggleCollapsed: vi.fn(),
  total: 1,
};

test("a boolean controller shows and hides block data and keeps the hidden value", async () => {
  const user = userEvent.setup();
  render(<Harness {...base} data={{ heading: "Sale" }} />);
  expect(screen.queryByRole("textbox", { name: "Action URL" })).toBeNull();
  const toggle = screen.getByRole("switch", { name: "Has call to action" });
  await user.click(toggle);
  await user.type(screen.getByRole("textbox", { name: "Action URL" }), "/buy");
  await user.click(toggle);
  expect(screen.queryByRole("textbox", { name: "Action URL" })).toBeNull();
  // Hidden controls are out of the tab order.
  toggle.focus();
  await user.tab();
  expect(document.activeElement).not.toHaveAccessibleName("Action URL");
  expect(JSON.parse(screen.getByTestId("data").textContent!)).toEqual({
    ctaUrl: "/buy",
    hasCta: false,
    heading: "Sale",
  });
});

test("a hidden publication problem does not keep a collapsed card open", () => {
  render(
    <Harness
      {...base}
      collapsed
      data={{ hasCta: false, heading: "Sale" }}
      error={{ data: { ctaUrl: { message: "Enter a value.", type: "publication" } } }}
    />,
  );
  expect(screen.getByRole("article", { name: "Promo" })).not.toHaveAttribute("data-invalid");
  expect(screen.queryByRole("textbox", { name: "Heading" })).toBeNull();
});

test("a visible publication problem still opens the card", () => {
  render(
    <Harness
      {...base}
      collapsed
      data={{ hasCta: true, heading: "Sale" }}
      error={{ data: { ctaUrl: { message: "Enter a value.", type: "publication" } } }}
    />,
  );
  expect(screen.getByRole("article", { name: "Promo" })).toHaveAttribute("data-invalid", "true");
  expect(screen.getByRole("textbox", { name: "Action URL" })).toHaveAccessibleDescription(
    /Enter a value/u,
  );
});
