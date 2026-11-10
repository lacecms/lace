import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test } from "vitest";
import { fieldEditorServices } from "../../content/index.js";
import { FieldRendererProvider } from "../EditorContext/index.js";
import { Disclosure } from "./index.js";

test("collapsing a group keeps its contents mounted", async () => {
  const user = userEvent.setup();
  render(
    <FieldRendererProvider services={fieldEditorServices} renderers={{}}>
      <Disclosure id="group" label="Group">
        <input aria-label="Value" />
      </Disclosure>
    </FieldRendererProvider>,
  );
  const input = screen.getByRole("textbox", { name: "Value" });
  await user.click(screen.getByRole("button", { name: "Collapse Group" }));
  expect(input).toBeInTheDocument();
  expect(input).not.toBeVisible();
});
