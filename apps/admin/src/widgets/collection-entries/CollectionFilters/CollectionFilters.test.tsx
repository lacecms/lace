import { fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { CollectionFilters } from "./index.js";
import {
  CLOUDFLARE_LIST_QUERY_LIMITS,
  NODE_LIST_QUERY_LIMITS,
  type ContentModelDto,
} from "@lacecms/contracts";
const model: ContentModelDto = {
  key: "posts",
  kind: "collection",
  version: 1,
  blocks: [],
  fields: {
    n: { type: "number", required: false },
    flag: { type: "boolean", required: false },
    text: { type: "text", required: false },
    date: { type: "date", required: false },
    time: { type: "datetime", required: false },
    choice: { type: "select", required: false, options: ["a", "b"] },
  },
  listOptions: { filterableFields: ["n", "flag", "text", "date", "time", "choice"] },
};
function open(fieldKey: string, cloud = false) {
  const onApply = vi.fn(),
    onClose = vi.fn();
  render(
    <CollectionFilters
      fieldKey={fieldKey}
      filters={[]}
      limits={cloud ? CLOUDFLARE_LIST_QUERY_LIMITS : NODE_LIST_QUERY_LIMITS}
      model={model}
      onApply={onApply}
      onClose={onClose}
      onRestoreFocus={vi.fn()}
    />,
  );
  return { user: userEvent.setup(), onApply, onClose };
}
test("number zero and optional bounds survive; inverted range stays editable without applying", async () => {
  const { user, onApply } = open("n");
  await user.selectOptions(screen.getByLabelText("Operator"), "range");
  await user.type(screen.getByLabelText("Minimum"), "2");
  await user.type(screen.getByLabelText("Maximum"), "0");
  await user.click(screen.getByRole("button", { name: "Apply filter" }));
  expect(onApply).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toBeInTheDocument();
  await user.clear(screen.getByLabelText("Minimum"));
  await user.click(screen.getByRole("button", { name: "Apply filter" }));
  expect(onApply).toHaveBeenCalledWith({ field: "n", op: "range", max: 0 });
});
test("boolean false is a value and existence has no operands", async () => {
  const { user, onApply } = open("flag");
  await user.click(screen.getByRole("button", { name: "Apply filter" }));
  expect(onApply).toHaveBeenCalledWith({ field: "flag", op: "eq", value: false });
  await user.selectOptions(screen.getByLabelText("Operator"), "isNotSet");
  await user.click(screen.getByRole("button", { name: "Apply filter" }));
  expect(onApply).toHaveBeenLastCalledWith({ field: "flag", op: "isNotSet" });
});
test("select OR values use checkboxes", async () => {
  const { user, onApply } = open("choice");
  await user.click(screen.getByLabelText("a"));
  await user.click(screen.getByLabelText("b"));
  await user.click(screen.getByRole("button", { name: "Apply filter" }));
  expect(onApply).toHaveBeenCalledWith({ field: "choice", op: "in", values: ["a", "b"] });
});
test("Cloudflare contains is byte-aware while equality retains 200 code units", async () => {
  const { user, onApply } = open("text", true);
  await user.type(screen.getByLabelText("Value"), "я".repeat(25));
  await user.click(screen.getByRole("button", { name: "Apply filter" }));
  expect(onApply).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("50 UTF-8 bytes");
  expect(screen.getByLabelText("Value")).toHaveValue("я".repeat(25));
  await user.selectOptions(screen.getByLabelText("Operator"), "eq");
  expect(screen.getByLabelText("Value")).toHaveAttribute("maxlength", "200");
  await user.click(screen.getByRole("button", { name: "Apply filter" }));
  expect(onApply).toHaveBeenCalledWith({ field: "text", op: "eq", value: "я".repeat(25) });
  expect(within(screen.getByRole("dialog")).getByLabelText("Field")).toBeInTheDocument();
});

test.each([
  ["date", "2026-10-25", "2026-10-25"],
  ["time", "2026-10-25T12:30", "2026-10-25T12:30:00.000Z"],
])("%s bounds are inclusive and entered in UTC", async (field, input, expected) => {
  const { user, onApply } = open(field);
  fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: input } });
  await user.click(screen.getByRole("button", { name: "Apply filter" }));
  expect(onApply).toHaveBeenCalledWith({ field, op: "range", from: expected });
});
