import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { expect, test } from "vitest";
import { itemAction, openActions, openItem } from "../../../app/testing/index.js";
import { revealControl } from "../../../shared/lib/index.js";
import type { DraftEditorValues } from "../editor-form.js";
import {
  FieldRenderer,
  FieldRendererProvider,
  type FieldDefinition,
  type FieldPreviewProps,
  type FieldPreviewRegistry,
} from "./index.js";

const images: FieldDefinition = {
  item: {
    fields: {
      media: { label: "Image", required: true, type: "media" },
      alt: { label: "Alt text", required: false, type: "text" },
      caption: { label: "Caption", required: false, type: "text" },
    },
    required: false,
    type: "group",
  },
  itemLabel: "caption",
  label: "Images",
  maxItems: 50,
  minItems: 1,
  required: false,
  type: "list",
};

function Harness({
  definition = images,
  initial,
  previews,
  readOnly = false,
}: {
  readonly definition?: FieldDefinition;
  readonly initial: unknown;
  readonly previews?: FieldPreviewRegistry;
  readonly readOnly?: boolean;
}) {
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: { blocks: [], fields: {}, title: "" },
  });
  useState(() => form.reset({ blocks: [], fields: { gallery: initial as never }, title: "" }));
  return (
    <FieldRendererProvider previews={previews} readOnly={readOnly} renderers={{}}>
      <FieldRenderer
        control={form.control}
        definition={definition}
        error={undefined}
        fieldKey="gallery"
        name="fields.gallery"
      />
      <output data-testid="value">{JSON.stringify(form.watch("fields.gallery") ?? null)}</output>
      <output data-testid="dirty">{String(form.formState.isDirty)}</output>
    </FieldRendererProvider>
  );
}

function StubPreview({ value, children }: FieldPreviewProps) {
  return children(
    value === "missing"
      ? { visual: <span>No image</span> }
      : { detail: "JPEG · 640 × 479", title: `${String(value)}.jpeg`, visual: <span>Thumb</span> },
  );
}

const three = [
  { caption: "One", media: "m1" },
  { media: "m2" },
  { caption: "Three", media: "missing" },
];

test("a list header names the list with its count and maximum and has no toggle", () => {
  render(<Harness initial={three} />);
  const group = screen.getByRole("group", { name: "Images" });
  expect(within(group).getByText("3 / 50")).toBeVisible();
  expect(screen.getByRole("button", { name: "Add Images item" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Actions for Images" })).toBeVisible();
  expect(screen.queryByRole("button", { name: /^(Collapse|Expand) Images$/u })).toBeNull();
  expect(group).toHaveAccessibleDescription(/Minimum 1 items for publication only/u);
});

test("the minimum is shown while unmet and stays in the description once met", async () => {
  const user = userEvent.setup();
  render(<Harness initial={[]} />);
  expect(screen.getByText("Add at least 1 items for publication only.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Add Images item" }));
  expect(screen.queryByText("Add at least 1 items for publication only.")).toBeNull();
  expect(screen.getByRole("group", { name: "Images" })).toHaveAccessibleDescription(
    /Minimum 1 items for publication only/u,
  );
});

test("group items load collapsed with summaries and open independently without dirtying", async () => {
  const user = userEvent.setup();
  render(<Harness initial={three} />);
  expect(screen.queryByRole("textbox", { name: "Caption" })).toBeNull();
  expect(screen.getByText("One")).toBeVisible();
  expect(screen.getByText("Media selected")).toBeVisible();
  await openItem(user, "Images item 2");
  expect(screen.getByRole("textbox", { name: "Caption" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Expand Images item 1" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Collapse Images item 2" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  // The opened item's group renders flat: no legend or second toggle.
  expect(screen.queryByRole("button", { name: /Collapse Images item 2 group/u })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Collapse Images item 2" }));
  expect(screen.getByTestId("dirty")).toHaveTextContent("false");
  expect(screen.getByTestId("value").textContent).not.toMatch(/open|item-/u);
});

test("item actions live in a menu with names, boundaries and no row buttons", async () => {
  const user = userEvent.setup();
  render(<Harness initial={three} />);
  expect(screen.queryByRole("button", { name: "Move up Images item 1" })).toBeNull();
  await openActions(user, "Actions for Images item 1");
  expect(await screen.findByRole("menuitem", { name: "Move up Images item 1" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  for (const action of ["Move down", "Duplicate", "Remove"])
    expect(screen.getByRole("menuitem", { name: `${action} Images item 1` })).not.toHaveAttribute(
      "aria-disabled",
    );
  await user.keyboard("{Escape}");
});

test("a full list explains why Duplicate is unavailable", async () => {
  const user = userEvent.setup();
  render(<Harness definition={{ ...images, maxItems: 3 }} initial={three} />);
  await openActions(user, "Actions for Images item 1");
  const duplicate = await screen.findByRole("menuitem", { name: "Duplicate Images item 1" });
  expect(duplicate).toHaveAttribute("aria-disabled", "true");
  expect(duplicate).toHaveAccessibleDescription("This list allows at most 3 items.");
  await user.keyboard("{Escape}");
});

test("viewers can open items but get no handle, menu or Add", async () => {
  const user = userEvent.setup();
  render(<Harness initial={three} readOnly />);
  expect(screen.queryByRole("button", { name: "Actions for Images item 1" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reorder Images item 1" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add Images item" })).toBeNull();
  await openItem(user, "Images item 1");
  expect(screen.getByRole("textbox", { name: "Caption" })).toBeDisabled();
});

test("added and duplicated items open and receive focus while others stay collapsed", async () => {
  const user = userEvent.setup();
  render(<Harness initial={three} />);
  await user.click(screen.getByRole("button", { name: "Add Images item" }));
  expect(screen.getByRole("button", { name: "Collapse Images item 4" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Expand Images item 1" })).toBeVisible();
  expect(document.activeElement?.closest("[data-item-body]")).not.toBeNull();
  await itemAction(user, "Images item 1", "Duplicate");
  expect(screen.getByRole("button", { name: "Collapse Images item 2" })).toBeVisible();
  expect(screen.getAllByRole("textbox", { name: "Caption" })[0]).toHaveValue("One");
  expect(screen.getAllByRole("textbox", { name: "Alt text" })[0]).toHaveFocus();
});

test("focus after removal moves to the next item, then the previous, then Add", async () => {
  const user = userEvent.setup();
  render(<Harness initial={three.slice(0, 2)} />);
  await itemAction(user, "Images item 1", "Remove");
  expect(screen.getByRole("button", { name: "Expand Images item 1" })).toHaveFocus();
  await itemAction(user, "Images item 1", "Remove");
  expect(screen.getByRole("button", { name: "Add Images item" })).toHaveFocus();
  expect(screen.getByTestId("value")).toHaveTextContent("[]");
});

test("open state follows an item through moves and menu moves keep focus on its row", async () => {
  const user = userEvent.setup();
  render(<Harness initial={three} />);
  await openItem(user, "Images item 1");
  await itemAction(user, "Images item 1", "Move down");
  expect(screen.getByRole("button", { name: "Collapse Images item 2" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Expand Images item 1" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Actions for Images item 2" })).toHaveFocus();
  expect(screen.getByRole("textbox", { name: "Caption" })).toHaveValue("One");
});

test("revealing a control inside a collapsed item opens it", () => {
  render(<Harness initial={three} />);
  const caption = document.getElementById("field-fields-gallery-2-caption")!;
  expect(caption).not.toBeVisible();
  revealControl(caption);
  expect(caption).toBeVisible();
});

test("collapsed rows take lines and visuals from a registered leaf preview", () => {
  render(<Harness initial={three} previews={{ media: StubPreview }} />);
  const rows = within(screen.getByRole("list", { name: "Images" })).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent(/ThumbOnem1\.jpeg/u);
  expect(rows[1]).toHaveTextContent(/Thumbm2\.jpegJPEG · 640 × 479/u);
  expect(rows[2]).toHaveTextContent(/No imageThree/u);
});

test("a preview without a title falls back to the generic media label", () => {
  render(<Harness initial={[{ media: "missing" }]} previews={{ media: StubPreview }} />);
  const row = within(screen.getByRole("list", { name: "Images" })).getByRole("listitem");
  expect(row).toHaveTextContent(/No imageMedia selected/u);
});

test("a standalone group toggles with an icon-only chevron named for the group", async () => {
  const user = userEvent.setup();
  render(
    <Harness
      definition={{
        fields: { email: { label: "Email", required: false, type: "text" } },
        label: "Contact",
        required: false,
        type: "group",
      }}
      initial={{ email: "a@b.co" }}
    />,
  );
  const toggle = screen.getByRole("button", { name: "Collapse Contact" });
  expect(toggle).not.toHaveTextContent(/Collapse/u);
  await user.click(toggle);
  expect(screen.getByRole("button", { name: "Expand Contact" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
