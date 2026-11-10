import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";
import { fieldEditorServices } from "../../content/index.js";
import { FieldRendererProvider } from "../FieldRenderer/index.js";
import { ListField } from "./index.js";

test("adding a scalar item preserves the existing value", async () => {
  function Harness() {
    const [value, setValue] = useState<unknown>(["first"]);
    return (
      <FieldRendererProvider services={fieldEditorServices} renderers={{}}>
        <ListField
          definition={{
            type: "list",
            label: "Tags",
            required: false,
            item: { type: "text", required: false },
          }}
          fieldKey="tags"
          name="fields.tags"
          value={value}
          onChange={setValue}
          onBlur={() => {}}
          renderValue={({ value: item }) => <span>{String(item)}</span>}
        />
        <output data-testid="value">{JSON.stringify(value)}</output>
      </FieldRendererProvider>
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Add Tags item" }));
  expect(screen.getByTestId("value")).toHaveTextContent('["first",""]');
});
