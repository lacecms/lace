import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { fieldEditorServices } from "../../content/index.js";
import { FieldRendererProvider, useCompositeEditing } from "./index.js";

test("unbound editor exposes read-only state and no growth problem", () => {
  function Consumer() {
    const editor = useCompositeEditing();
    return (
      <span>
        {String(editor.readOnly)} {String(editor.growthProblem("fields.tags", []))}
      </span>
    );
  }
  render(
    <FieldRendererProvider services={fieldEditorServices} renderers={{}} readOnly>
      <Consumer />
    </FieldRendererProvider>,
  );
  expect(screen.getByText("true undefined")).toBeVisible();
});
