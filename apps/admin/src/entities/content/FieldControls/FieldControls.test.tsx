import { fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { expect, test } from "vitest";
import { itemAction } from "../../../app/testing/index.js";
import type { DraftEditorValues } from "../editor-form.js";
import type { FieldDefinition } from "../field-types.js";
import { FieldRenderer, FieldRendererProvider } from "../FieldRenderer/index.js";
import {
  calendarDateToDate,
  composeUtcDatetime,
  dateToCalendarDate,
  openableUrl,
  splitUtcDatetime,
} from "./index.js";

function Harness({
  definition,
  error,
  initial,
  readOnly = false,
}: {
  readonly definition: FieldDefinition;
  readonly error?: string;
  readonly initial?: unknown;
  readonly readOnly?: boolean;
}) {
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: { blocks: [], fields: { value: initial as never }, title: "" },
  });
  return (
    <FieldRendererProvider readOnly={readOnly} renderers={{}}>
      <fieldset disabled={readOnly}>
        <FieldRenderer
          control={form.control}
          definition={definition}
          error={error}
          fieldKey="value"
          name="fields.value"
        />
      </fieldset>
      <output data-testid="value">{JSON.stringify(form.watch("fields.value") ?? null)}</output>
    </FieldRendererProvider>
  );
}

const value = () => screen.getByTestId("value").textContent;

test("a select chooses an option and an optional select can be cleared", async () => {
  const user = userEvent.setup();
  render(
    <Harness definition={{ options: ["news", "release"], required: false, type: "select" }} />,
  );
  const trigger = screen.getByRole("combobox", { name: "Value" });
  expect(trigger).toHaveTextContent("Select an option");
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: "release" }));
  expect(value()).toBe('"release"');
  expect(trigger).toHaveTextContent("release");
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: "No selection" }));
  expect(value()).toBe("null");
});

test("a required select offers no clearing choice", async () => {
  const user = userEvent.setup();
  render(<Harness definition={{ options: ["news"], required: true, type: "select" }} />);
  screen.getByRole("combobox", { name: "Value" }).focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("option", { name: "news" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "No selection" })).not.toBeInTheDocument();
});

test("a date is picked from the calendar, shown in words, and cleared", async () => {
  const user = userEvent.setup();
  render(<Harness definition={{ required: false, type: "date" }} initial="2026-09-01" />);
  const trigger = screen.getByRole("button", { name: "Value" });
  expect(trigger).toHaveTextContent("Sep 1, 2026");
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: /September 25th, 2026/u }));
  expect(value()).toBe('"2026-09-25"');
  expect(screen.getByRole("button", { name: "Value" })).toHaveTextContent("Sep 25, 2026");
  await user.click(screen.getByRole("button", { name: "Clear Value" }));
  expect(value()).toBe("null");
  expect(screen.getByRole("button", { name: "Value" })).toHaveTextContent("Pick a date");
});

test("a datetime composes a UTC value from its date and time", async () => {
  const user = userEvent.setup();
  render(
    <Harness definition={{ required: true, type: "datetime" }} initial="2026-09-01T08:15:00Z" />,
  );
  const time = screen.getByLabelText("Value time (UTC)");
  expect(time).toHaveValue("08:15");
  expect(time).toHaveAccessibleDescription("Time is in UTC.");
  await user.click(screen.getByRole("button", { name: "Value" }));
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: /September 25th, 2026/u,
    }),
  );
  expect(value()).toBe('"2026-09-25T08:15:00.000Z"');
  fireEvent.change(time, { target: { value: "14:30" } });
  expect(value()).toBe('"2026-09-25T14:30:00.000Z"');
  expect(screen.queryByRole("button", { name: "Clear Value" })).not.toBeInTheDocument();
});

test("a boolean is a switch and an erroring control is marked invalid", async () => {
  const user = userEvent.setup();
  render(<Harness definition={{ required: false, type: "boolean" }} error="Must be on." />);
  const toggle = screen.getByRole("switch", { name: "Value" });
  expect(toggle).toHaveAttribute("aria-invalid", "true");
  expect(toggle).toHaveAccessibleDescription("Must be on.");
  toggle.focus();
  await user.keyboard(" ");
  expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(value()).toBe("true");
});

test("a URL field offers to open only http(s) values in a new tab", async () => {
  const user = userEvent.setup();
  render(<Harness definition={{ required: false, type: "url" }} />);
  const input = screen.getByRole("textbox", { name: "Value" });
  await user.type(input, "mailto:team@lace.test");
  expect(screen.queryByRole("link", { name: "Open Value in a new tab" })).not.toBeInTheDocument();
  await user.clear(input);
  await user.type(input, "https://lace.test/docs");
  const link = screen.getByRole("link", { name: "Open Value in a new tab" });
  expect(link).toHaveAttribute("href", "https://lace.test/docs");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

test("number and text controls convert values and view-only fields are disabled", async () => {
  const user = userEvent.setup();
  render(<Harness definition={{ required: false, type: "number" }} />);
  await user.type(screen.getByRole("spinbutton", { name: "Value" }), "42");
  expect(value()).toBe("42");

  document.body.replaceChildren();
  render(<Harness definition={{ required: false, type: "date" }} initial="2026-09-01" readOnly />);
  expect(screen.getByRole("button", { name: "Value" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Clear Value" })).not.toBeInTheDocument();
});

test("date and datetime helpers never shift days across time zones", () => {
  expect(dateToCalendarDate(calendarDateToDate("2026-01-31")!)).toBe("2026-01-31");
  expect(calendarDateToDate("31/01/2026")).toBeUndefined();
  expect(splitUtcDatetime("2026-09-25T23:59:59.999Z")).toEqual({
    date: "2026-09-25",
    time: "23:59",
  });
  expect(splitUtcDatetime(undefined)).toEqual({});
  expect(composeUtcDatetime("2026-09-25", undefined)).toBe("2026-09-25T00:00:00.000Z");
  expect(openableUrl("javascript:alert(1)")).toBeUndefined();
  expect(openableUrl("not a url")).toBeUndefined();
});

test.each([false, true])(
  "composite controls render labelled lists for every role (%s)",
  (readOnly) => {
    render(
      <Harness
        readOnly={readOnly}
        definition={{ type: "list", required: false, item: { type: "text", required: false } }}
        initial={["Saved"]}
      />,
    );
    expect(screen.getByRole("list", { name: "Value" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Value item 1" })).toHaveValue("Saved");
    if (readOnly) expect(screen.queryByRole("button", { name: "Add Value item" })).toBeNull();
    else expect(screen.getByRole("button", { name: "Add Value item" })).toBeEnabled();
    expect(value()).toBe('["Saved"]');
  },
);

test.each(["text", "textarea", "url", "number", "select"] as const)(
  "CE9A configured placeholder reaches %s without creating a value",
  (type) => {
    render(
      <Harness
        definition={
          type === "select"
            ? { type, required: false, options: ["a"], placeholder: "Prompt" }
            : { type, required: false, placeholder: "Prompt" }
        }
      />,
    );
    const control = screen.getByRole(
      type === "number" ? "spinbutton" : type === "select" ? "combobox" : "textbox",
    );
    if (type === "select") expect(control).toHaveTextContent("Prompt");
    else expect(control).toHaveAttribute("placeholder", "Prompt");
    expect(value()).toBe("null");
  },
);

test("CE9A raw counts and bounds remain readable for viewers and do not truncate", async () => {
  const user = userEvent.setup();
  const definition = {
    type: "text",
    required: true,
    placeholder: "Short",
    minLength: 2,
    maxLength: 3,
  } as const;
  const { unmount } = render(<Harness definition={definition} />);
  const input = screen.getByRole("textbox");
  expect(input).not.toHaveAttribute("required");
  expect(input).not.toHaveAttribute("maxlength");
  await user.type(input, " 😀 ");
  expect(input).toHaveValue(" 😀 ");
  expect(input).toHaveAccessibleDescription(
    "Required for publication only. When provided, enter at least 2 characters. Limit: 3 characters. 4 characters",
  );
  const counter = document.getElementById("field-fields-value-count")!;
  expect(counter.closest("[aria-live], [role=status], [role=alert]")).toBeNull();
  unmount();
  render(<Harness definition={definition} initial=" 😀 " readOnly />);
  expect(screen.getByRole("textbox")).toHaveAccessibleDescription(
    /Required for publication only.*4 characters/u,
  );
});

test("CE9A nested group/list guidance follows current values after moves", async () => {
  const user = userEvent.setup();
  render(
    <Harness
      definition={{
        type: "group",
        required: true,
        fields: {
          tags: {
            type: "list",
            required: true,
            minItems: 2,
            maxItems: 5,
            item: { type: "text", required: false, placeholder: "Tag" },
          },
          ready: { type: "boolean", required: true },
        },
      }}
      initial={{ tags: ["a", "long"] }}
    />,
  );
  expect(screen.getByRole("switch")).toHaveAccessibleDescription("Required for publication only.");
  const first = screen.getByRole("textbox", { name: "Tags item 1" });
  expect(first).toHaveAttribute("placeholder", "Tag");
  expect(first).toHaveAccessibleDescription("1 characters");
  expect(screen.getByRole("group", { name: "Tags" })).toHaveAccessibleDescription(
    /Minimum 2 items for publication only.*Limit: 5 items/u,
  );
  await itemAction(user, "Tags item 1", "Move down");
  expect(screen.getByRole("textbox", { name: "Tags item 1" })).toHaveValue("long");
  expect(screen.getByRole("textbox", { name: "Tags item 1" })).toHaveAccessibleDescription(
    "4 characters",
  );
  for (const element of document.querySelectorAll("[aria-describedby]"))
    for (const id of element.getAttribute("aria-describedby")!.split(" "))
      expect(document.getElementById(id), id).not.toBeNull();
});

const cardDefinition = {
  type: "select",
  required: false,
  options: ["a", "b"],
  label: "Composition",
  description: "Select a composition",
  presentation: {
    control: "cards",
    choices: [
      { value: "b", label: "Second", description: "Second layout" },
      { value: "a", label: "First" },
    ],
  },
} as const;
test("card selects follow option order and share errors, guidance and focus IDs", async () => {
  const user = userEvent.setup();
  render(<Harness definition={cardDefinition} error="Choose again" initial="b" />);
  const group = screen.getByRole("radiogroup", { name: "Composition" });
  expect(
    within(group)
      .getAllByRole("radio")
      .map((r) => r.getAttribute("aria-label")),
  ).toEqual(["No selection", "First", "Second"]);
  const selected = screen.getByRole("radio", { name: "Second" });
  expect(selected).toHaveAttribute("id", "field-fields-value");
  expect(selected).toHaveAttribute("aria-invalid", "true");
  expect(selected).toHaveAccessibleDescription(/Select a composition.*Choose again.*Second layout/);
  await user.click(screen.getByRole("radio", { name: "First" }));
  expect(value()).toBe('"a"');
  expect(screen.getByRole("radio", { name: "First" })).toHaveAttribute("id", "field-fields-value");
  await user.click(screen.getByRole("radio", { name: "No selection" }));
  expect(value()).toBe("null");
});
test("read-only cards expose chosen text without mutation controls", () => {
  render(<Harness definition={cardDefinition} initial="b" readOnly />);
  expect(screen.getByText("Second")).toBeVisible();
  expect(screen.getByText("Second layout")).toBeVisible();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
});
