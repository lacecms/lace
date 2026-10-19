import { render, screen, within, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { field } from "@lacecms/content";
import type { ContentModelDto } from "@lacecms/contracts";
import { expect, test, vi } from "vitest";
import {
  FieldRenderer,
  FieldRendererProvider,
  EntryListBudget,
  createDraftResolver,
  withoutClearedValues,
  type DraftEditorValues,
  validationProblems,
} from "../../../entities/content/index.js";
import { itemAction, listAction, openActions, openItem } from "../../../app/testing/index.js";
import { EntryValidationSummary } from "../EntryValidationSummary/index.js";
const links = field.list({
  label: "Links",
  itemLabel: "title",
  item: field.group({
    fields: {
      title: field.text({ label: "Link title" }),
      url: field.url({ label: "Address" }),
      children: field.list({ label: "Children", item: field.text() }),
    },
  }),
});
const model = {
  key: "home",
  kind: "page",
  path: "/",
  version: 1,
  blocks: [],
  fields: { links, numbers: field.list({ label: "Numbers", item: field.number({ min: 10 }) }) },
} satisfies ContentModelDto;
function Harness({
  readOnly = false,
  initial = [
    { title: "One", url: "/one", children: ["child"] },
    { title: "Two", url: "/two" },
  ],
  onSave = vi.fn(),
}: {
  readonly readOnly?: boolean;
  readonly initial?: unknown[];
  readonly onSave?: (values: DraftEditorValues) => void;
}) {
  const transient = useRef(new Map<string, { name: string; message: string }>());
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: { title: "Title", blocks: [], fields: { links: initial, numbers: [] } },
    resolver: createDraftResolver(model, () => [...transient.current.values()]),
    shouldFocusError: false,
    reValidateMode: "onSubmit",
  });
  const values = form.watch();
  const problems = validationProblems({ model, blocks: [], errors: form.formState.errors });
  return (
    <FieldRendererProvider
      form={form}
      model={model}
      readOnly={readOnly}
      renderers={{}}
      transient={transient.current}
    >
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => onSave(withoutClearedValues(values)))}
      >
        {problems.length ? <EntryValidationSummary problems={problems} /> : null}
        <EntryListBudget control={form.control as never} model={model} />
        {Object.entries(model.fields).map(([key, definition]) => (
          <FieldRenderer
            control={form.control}
            definition={definition}
            error={undefined}
            fieldKey={key}
            key={key}
            name={`fields.${key}`}
          />
        ))}
        <button
          onClick={() =>
            form.setError("fields.links.0.url" as never, {
              message: "Server rejected this URL",
              type: "server",
            })
          }
          type="button"
        >
          Server issue
        </button>
        <button
          type="button"
          onClick={() =>
            form.setError("fields.links.0.children.0" as never, {
              message: "Nested child rejected",
              type: "server",
            })
          }
        >
          Nested issue
        </button>
        <button type="submit">Save</button>
        <output data-testid="values">{JSON.stringify(values.fields)}</output>
      </form>
    </FieldRendererProvider>
  );
}
test("duplicates detach nested lists, moves preserve DOM identity and removal retains the other item", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await openItem(user, "Links item 1");
  await openItem(user, "Links item 2");
  const first = screen.getAllByRole("textbox", { name: "Link title" })[0]!;
  await itemAction(user, "Links item 1", "Duplicate");
  const titles = screen.getAllByRole("textbox", { name: "Link title" });
  await user.clear(titles[1]!);
  await user.type(titles[1]!, "Copy");
  expect(first).toHaveValue("One");
  await itemAction(user, "Links item 1", "Move down");
  expect(screen.getAllByRole("textbox", { name: "Link title" })[1]).toBe(first);
  await itemAction(user, "Links item 1", "Remove");
  expect(screen.getAllByRole("textbox", { name: "Link title" })[0]).toBe(first);
  expect(screen.getByTestId("values")).not.toHaveTextContent("item-");
});
test("collapsed nested problems reveal exact controls and server errors follow moves", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await openItem(user, "Links item 1");
  await openItem(user, "Links item 2");
  await user.click(screen.getByRole("button", { name: "Server issue" }));
  await itemAction(user, "Links item 1", "Move down");
  expect(screen.getAllByRole("textbox", { name: "Address" })[1]).toHaveAccessibleDescription(
    "Server rejected this URL",
  );
  await user.click(screen.getByRole("button", { name: "Collapse Links item 2" }));
  const link = screen.getByRole("link", { name: /Address in Item 2 in Links/u });
  await user.click(link);
  expect(screen.getAllByRole("textbox", { name: "Address" })[1]).toHaveFocus();
});
test("scalar insertion validates before committing and a cleared scalar item blocks saving", async () => {
  const user = userEvent.setup();
  const saved = vi.fn();
  render(<Harness onSave={saved} />);
  await user.click(screen.getByRole("button", { name: "Add Numbers item" }));
  await user.type(screen.getByRole("spinbutton", { name: "New Numbers item" }), "5");
  expect(screen.getByRole("button", { name: "Add item" })).toBeDisabled();
  await user.clear(screen.getByRole("spinbutton", { name: "New Numbers item" }));
  await user.type(screen.getByRole("spinbutton", { name: "New Numbers item" }), "15");
  await user.click(screen.getByRole("button", { name: "Add item" }));
  const input = screen.getByRole("spinbutton", { name: "Numbers item 1" });
  await user.clear(input);
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(saved).not.toHaveBeenCalled();
  expect(screen.getAllByText("Enter a value or remove this item.").length).toBeGreaterThan(0);
  await user.type(input, "20");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(saved.mock.calls[0]![0].fields.numbers).toEqual([20]);
});
test("viewers can inspect disclosures without mutation actions or enabled leaf controls", async () => {
  const user = userEvent.setup();
  render(<Harness readOnly />);
  expect(screen.queryByRole("button", { name: "Add Links item" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Actions for Links item 1" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reorder Links item 1" })).toBeNull();
  await openItem(user, "Links item 1");
  const first = screen.getAllByRole("textbox", { name: "Link title" })[0]!;
  expect(first).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Collapse Links item 1" }));
  expect(first).not.toBeVisible();
  await openItem(user, "Links item 1");
  expect(first).toBeVisible();
});
test("per-list maximum blocks copies without preventing recovery", async () => {
  const user = userEvent.setup();
  render(<Harness initial={Array.from({ length: 100 }, () => ({ title: "Same" }))} />);
  expect(screen.getByRole("button", { name: "Add Links item" })).toBeDisabled();
  await openActions(user, "Actions for Links item 1");
  expect(await screen.findByRole("menuitem", { name: "Duplicate Links item 1" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await user.keyboard("{Escape}");
  await itemAction(user, "Links item 1", "Remove");
  expect(screen.getByRole("button", { name: "Add Links item" })).toBeEnabled();
  expect(within(screen.getByRole("list", { name: "Links" })).getAllByRole("listitem")).toHaveLength(
    99,
  );
}, 15000);

test("nested list array errors survive group traversal and reveal the scalar", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await openItem(user, "Links item 1");
  await user.click(screen.getByRole("button", { name: "Nested issue" }));
  expect(screen.getByRole("textbox", { name: "Children item 1" })).toHaveAccessibleDescription(
    "5 characters Nested child rejected",
  );
  await user.click(screen.getByRole("button", { name: "Collapse Links item 1" }));
  await user.click(screen.getByRole("link", { name: /Item 1 in Children in Item 1 in Links/u }));
  expect(screen.getByRole("textbox", { name: "Children item 1" })).toHaveFocus();
});

test("removing an item recomputes a local list maximum without retaining a stale summary", async () => {
  const user = userEvent.setup();
  render(<Harness initial={Array.from({ length: 101 }, () => ({ title: "Same" }))} />);
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("link", { name: "Links" })).toBeVisible();
  await itemAction(user, "Links item 1", "Remove");
  expect(screen.queryByRole("link", { name: "Links" })).toBeNull();
}, 15000);

test("explicit empty containers round-trip and group items are removed without clearing array slots", async () => {
  const user = userEvent.setup();
  const saved = vi.fn();
  render(<Harness initial={[]} onSave={saved} />);
  await listAction(user, "Links", "Clear Links");
  await user.click(screen.getByRole("button", { name: "Create Links" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(saved.mock.calls[0]![0].fields.links).toEqual([]);
  await user.click(screen.getByRole("button", { name: "Add Links item" }));
  expect(screen.queryByRole("button", { name: "Clear Links item 1" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Create Children" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(saved.mock.calls[1]![0].fields.links).toEqual([{ children: [] }]);
});
