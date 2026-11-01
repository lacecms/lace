import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { field } from "@lacecms/content";
import { expect, test } from "vitest";
import { openItem } from "../../../app/testing/index.js";
import type { DraftEditorValues } from "../editor-form.js";
import { FieldRenderer, FieldRendererProvider, type FieldDefinition } from "./index.js";

const items = field.list({
  item: field.group({
    fields: {
      kind: field.select({
        defaultValue: "image",
        label: "Kind",
        options: ["image", "video"],
        presentation: {
          control: "cards",
          choices: [
            { value: "image", label: "Image" },
            { value: "video", label: "Video" },
          ],
        },
        required: true,
      }),
      note: field.text({ label: "Image note" }),
      videoUrl: field.url({ label: "Video URL", required: true }),
      caption: field.text({ label: "Caption" }),
    },
    visibility: {
      note: { field: "kind", values: ["image"] },
      videoUrl: { field: "kind", values: ["video"] },
    },
  }),
  itemLabel: "caption",
  label: "Items",
}) as FieldDefinition;

function Harness({
  errors = [],
  initial,
  readOnly = false,
}: {
  readonly errors?: readonly (readonly [string, string, string])[];
  readonly initial: unknown;
  readonly readOnly?: boolean;
}) {
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: { blocks: [], fields: {}, title: "" },
  });
  useState(() => {
    form.reset({ blocks: [], fields: { items: initial as never }, title: "" });
    for (const [name, type, message] of errors) form.setError(name as never, { message, type });
  });
  return (
    <FieldRendererProvider form={form} readOnly={readOnly} renderers={{}}>
      <FieldRenderer
        control={form.control}
        definition={items}
        error={undefined}
        fieldKey="items"
        name="fields.items"
      />
      <output data-testid="value">{JSON.stringify(form.watch("fields.items") ?? null)}</output>
      <output data-testid="dirty">{String(form.formState.isDirty)}</output>
    </FieldRendererProvider>
  );
}

const value = () => JSON.parse(screen.getByTestId("value").textContent!) as unknown;

test("switching an item's kind shows and hides its fields without saving values away", async () => {
  const user = userEvent.setup();
  render(<Harness initial={[{ caption: "First" }]} />);
  await openItem(user, "Items item 1");
  const note = screen.getByRole("textbox", { name: "Image note" });
  expect(screen.queryByRole("textbox", { name: "Video URL" })).toBeNull();
  await user.type(note, "Wide");
  await user.click(screen.getByRole("radio", { name: /Video/u }));
  expect(screen.queryByRole("textbox", { name: "Image note" })).toBeNull();
  await user.type(screen.getByRole("textbox", { name: "Video URL" }), "https://vimeo.com/1");
  await user.click(screen.getByRole("radio", { name: /Image/u }));
  expect(screen.getByRole("textbox", { name: "Image note" })).toHaveValue("Wide");
  expect(screen.queryByRole("textbox", { name: "Video URL" })).toBeNull();
  expect(value()).toEqual([
    { caption: "First", kind: "image", note: "Wide", videoUrl: "https://vimeo.com/1" },
  ]);
  expect(screen.getByTestId("dirty")).toHaveTextContent("true");
});

test("each item evaluates its own controller", async () => {
  const user = userEvent.setup();
  render(<Harness initial={[{ kind: "image" }, { kind: "video" }]} />);
  await openItem(user, "Items item 1");
  await openItem(user, "Items item 2");
  const first = screen.getByRole("group", { name: "Items item 1" });
  const second = screen.getByRole("group", { name: "Items item 2" });
  expect(within(first).getByRole("textbox", { name: "Image note" })).toBeVisible();
  expect(within(first).queryByRole("textbox", { name: "Video URL" })).toBeNull();
  expect(within(second).getByRole("textbox", { name: "Video URL" })).toBeVisible();
  expect(within(second).queryByRole("textbox", { name: "Image note" })).toBeNull();
});

test("a publication problem on a hidden target is not shown until the target applies", async () => {
  const user = userEvent.setup();
  render(
    <Harness
      errors={[["fields.items.0.videoUrl", "publication", "Enter a value for publication."]]}
      initial={[{ caption: "First", kind: "image" }]}
    />,
  );
  expect(screen.queryByText("Has problems")).toBeNull();
  await openItem(user, "Items item 1");
  expect(screen.queryByText(/Enter a value for publication/u)).toBeNull();
  await user.click(screen.getByRole("radio", { name: /Video/u }));
  expect(screen.getByText(/Enter a value for publication/u)).toBeVisible();
});

test("a hidden target with a draft problem stays shown with its controller note", async () => {
  const user = userEvent.setup();
  render(
    <Harness
      errors={[["fields.items.0.videoUrl", "validate", "Enter a valid URL."]]}
      initial={[{ kind: "image", videoUrl: "nope" }]}
    />,
  );
  expect(screen.getAllByText("Has problems")).toHaveLength(2);
  await openItem(user, "Items item 1");
  const url = screen.getByRole("textbox", { name: "Video URL" });
  expect(url).toHaveAccessibleDescription(
    /Shown to fix a problem in a stored value\. Applies when Kind is Video\./u,
  );
  expect(screen.getByText("Enter a valid URL.")).toBeVisible();
});

test("viewers see only the applicable fields", async () => {
  const user = userEvent.setup();
  render(<Harness initial={[{ kind: "video", note: "Old" }]} readOnly />);
  await openItem(user, "Items item 1");
  expect(screen.queryByRole("textbox", { name: "Image note" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "Video URL" })).toBeVisible();
});
