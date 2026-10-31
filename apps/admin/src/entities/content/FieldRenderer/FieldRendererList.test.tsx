import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { ContentModelDto } from "@lacecms/contracts";
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
  type MediaListPickerProps,
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

/** Stands in for the media picker: shows what the list supplied and confirms fixed identifiers. */
function FakeMediaListPicker({
  capacity,
  existingIds,
  label,
  limitMessage,
  onCloseAutoFocus,
  onConfirm,
  onOpenChange,
  open,
}: MediaListPickerProps) {
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) onCloseAutoFocus(new Event("focus", { cancelable: true }));
    wasOpen.current = open;
  }, [onCloseAutoFocus, open]);
  if (!open) return null;
  return (
    <div aria-label={`Add media to ${label}`} role="dialog">
      <p>{`Capacity ${capacity}`}</p>
      <p>{`Limit: ${limitMessage}`}</p>
      <p>{`Existing: ${[...existingIds].join(",")}`}</p>
      <button onClick={() => onConfirm(["d", "b"])} type="button">
        Confirm d, b
      </button>
      <button onClick={() => onOpenChange(false)} type="button">
        Cancel picking
      </button>
    </div>
  );
}

/** A list bound to a form and model, so growth checks see the entry-wide budget. */
function PickerHarness({
  definition = images,
  initial,
  filler = 0,
  readOnly = false,
}: {
  readonly definition?: FieldDefinition;
  readonly initial: unknown;
  readonly filler?: number;
  readonly readOnly?: boolean;
}) {
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: { blocks: [], fields: {}, title: "" },
  });
  const fillerList = { item: { type: "text", required: false }, maxItems: 100, type: "list" };
  const fillerCount = Math.ceil(filler / 100);
  const model = {
    fields: {
      gallery: definition,
      ...Object.fromEntries(
        Array.from({ length: fillerCount }, (_, index) => [`filler${index}`, fillerList]),
      ),
    },
  } as unknown as ContentModelDto;
  useState(() =>
    form.reset({
      blocks: [],
      fields: {
        gallery: initial as never,
        ...Object.fromEntries(
          Array.from({ length: fillerCount }, (_, index) => [
            `filler${index}`,
            Array(Math.min(100, filler - index * 100)).fill("x"),
          ]),
        ),
      },
      title: "",
    }),
  );
  return (
    <FieldRendererProvider
      form={form}
      mediaListPicker={FakeMediaListPicker}
      model={model}
      readOnly={readOnly}
      renderers={{}}
    >
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

test("Add of a gallery opens the picker and appends the selection collapsed in order", async () => {
  const user = userEvent.setup();
  render(<PickerHarness initial={[{ media: "a" }]} />);
  const add = screen.getByRole("button", { name: "Add Images item" });
  expect(add).toHaveAttribute("aria-haspopup", "dialog");
  await user.click(add);
  const dialog = screen.getByRole("dialog", { name: "Add media to Images" });
  expect(dialog).toHaveTextContent("Capacity 49");
  expect(dialog).toHaveTextContent("Existing: a");
  await user.click(within(dialog).getByRole("button", { name: "Confirm d, b" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByTestId("value")).toHaveTextContent(
    JSON.stringify([{ media: "a" }, { media: "d" }, { media: "b" }]),
  );
  expect(screen.getByTestId("dirty")).toHaveTextContent("true");
  expect(screen.getByRole("button", { name: "Expand Images item 2" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "Expand Images item 3" })).toBeVisible();
  expect(screen.getByText("Added 2 Images items.")).toHaveRole("status");
});

test("the list maximum caps the picker and names the list", async () => {
  const user = userEvent.setup();
  const initial = Array.from({ length: 47 }, (_, index) => ({ media: `m${index}` }));
  render(<PickerHarness initial={initial} />);
  await user.click(screen.getByRole("button", { name: "Add Images item" }));
  const dialog = screen.getByRole("dialog", { name: "Add media to Images" });
  expect(dialog).toHaveTextContent("Capacity 3");
  expect(dialog).toHaveTextContent("Limit: Images allows at most 50 items.");
});

test("the entry budget caps the picker and names the entry-wide limit", async () => {
  const user = userEvent.setup();
  const photos: FieldDefinition = {
    item: { required: false, type: "media" },
    label: "Photos",
    maxItems: 100,
    required: false,
    type: "list",
  };
  render(
    <PickerHarness
      definition={photos}
      filler={485}
      initial={Array.from({ length: 10 }, (_, index) => `m${index}`)}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Add Photos item" }));
  const dialog = screen.getByRole("dialog", { name: "Add media to Photos" });
  expect(dialog).toHaveTextContent("Capacity 5");
  expect(dialog).toHaveTextContent(
    "Limit: An entry allows at most 500 list items, including nested lists and hidden blocks.",
  );
});

test("nested list defaults of appended items count against the budget", async () => {
  const user = userEvent.setup();
  const projects: FieldDefinition = {
    item: {
      fields: {
        cover: { required: true, type: "media" },
        tags: {
          defaultValue: ["a", "b"],
          item: { required: false, type: "text" },
          required: false,
          type: "list",
        },
      },
      required: false,
      type: "group",
    },
    label: "Projects",
    maxItems: 100,
    required: false,
    type: "list",
  };
  render(<PickerHarness definition={projects} filler={491} initial={[]} />);
  await user.click(screen.getByRole("button", { name: "Add Projects item" }));
  expect(screen.getByRole("dialog", { name: "Add media to Projects" })).toHaveTextContent(
    "Capacity 3",
  );
});

test("a full list keeps Add disabled and never opens the picker", () => {
  const initial = Array.from({ length: 50 }, (_, index) => ({ media: `m${index}` }));
  render(<PickerHarness initial={initial} />);
  const add = screen.getByRole("button", { name: "Add Images item" });
  expect(add).toBeDisabled();
  expect(add).toHaveAccessibleDescription("This list allows at most 50 items.");
});

test("a scalar media list receives identifiers", async () => {
  const user = userEvent.setup();
  const photos: FieldDefinition = {
    item: { required: false, type: "media" },
    label: "Photos",
    required: false,
    type: "list",
  };
  render(<PickerHarness definition={photos} initial={[]} />);
  await user.click(screen.getByRole("button", { name: "Add Photos item" }));
  await user.click(screen.getByRole("button", { name: "Confirm d, b" }));
  expect(screen.getByTestId("value")).toHaveTextContent(JSON.stringify(["d", "b"]));
});

test("appended group items keep the item's defaults", async () => {
  const user = userEvent.setup();
  const cards: FieldDefinition = {
    item: {
      fields: {
        cover: { required: true, type: "media" },
        label: { defaultValue: "Untitled", required: false, type: "text" },
      },
      required: false,
      type: "group",
    },
    label: "Cards",
    required: false,
    type: "list",
  };
  render(<PickerHarness definition={cards} initial={[]} />);
  await user.click(screen.getByRole("button", { name: "Add Cards item" }));
  await user.click(screen.getByRole("button", { name: "Confirm d, b" }));
  expect(screen.getByTestId("value")).toHaveTextContent(
    JSON.stringify([
      { label: "Untitled", cover: "d" },
      { label: "Untitled", cover: "b" },
    ]),
  );
});

test("ineligible lists keep the ordinary Add even with a picker", async () => {
  const user = userEvent.setup();
  const links: FieldDefinition = {
    item: {
      fields: {
        label: { required: true, type: "text" },
        url: { required: true, type: "url" },
      },
      required: false,
      type: "group",
    },
    label: "Submenu links",
    required: false,
    type: "list",
  };
  render(<PickerHarness definition={links} initial={[{ label: "One", url: "/one" }]} />);
  const add = screen.getByRole("button", { name: "Add Submenu links item" });
  expect(add).not.toHaveAttribute("aria-haspopup");
  await user.click(add);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Collapse Submenu links item 2" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Expand Submenu links item 1" })).toBeVisible();
  expect(document.activeElement?.closest("[data-item-body]")).not.toBeNull();
  const twoMedia: FieldDefinition = {
    ...images,
    item: {
      fields: {
        front: { required: true, type: "media" },
        back: { required: true, type: "media" },
      },
      required: false,
      type: "group",
    },
    label: "Pairs",
  };
  render(<PickerHarness definition={twoMedia} initial={[]} />);
  await user.click(screen.getByRole("button", { name: "Add Pairs item" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("cancelling the picker adds nothing and returns focus to Add", async () => {
  const user = userEvent.setup();
  render(<PickerHarness initial={[{ media: "a" }]} />);
  const add = screen.getByRole("button", { name: "Add Images item" });
  await user.click(add);
  await user.click(screen.getByRole("button", { name: "Cancel picking" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(add).toHaveFocus();
  expect(screen.getByTestId("value")).toHaveTextContent(JSON.stringify([{ media: "a" }]));
  expect(screen.getByTestId("dirty")).toHaveTextContent("false");
});

test("viewers get no Add for eligible lists", () => {
  render(<PickerHarness initial={[{ media: "a" }]} readOnly />);
  expect(screen.queryByRole("button", { name: "Add Images item" })).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});
