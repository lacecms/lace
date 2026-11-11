import { field } from "@lacecms/content";
import type { ContentModelDto } from "@lacecms/contracts";
import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { expect, test } from "vitest";
import { fieldEditorServices, type DraftEditorValues } from "../../content/index.js";
import { EntryListBudget, FieldRendererProvider, useCompositeEditing } from "./index.js";

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

test("the list budget line appears only near or over the limit", () => {
  const fields = Object.fromEntries(
    ["a", "b", "c", "d", "e", "f"].map((key) => [key, field.list({ item: field.number() })]),
  );
  const model = { fields, blockDefinitions: [] } as unknown as ContentModelDto;
  function Budget({ count }: { readonly count: number }) {
    const values: Record<string, number[]> = {};
    for (let index = 0; index < count; index += 1) {
      const key = ["a", "b", "c", "d", "e", "f"][Math.floor(index / 100)]!;
      (values[key] ??= []).push(index);
    }
    const form = useForm<DraftEditorValues>({
      defaultValues: { title: "", blocks: [], fields: values },
    });
    return (
      <FieldRendererProvider services={fieldEditorServices} renderers={{}}>
        <EntryListBudget control={form.control} model={model} />
      </FieldRendererProvider>
    );
  }
  const { rerender } = render(<Budget count={12} key={12} />);
  expect(screen.queryByText(/List items/u)).toBeNull();
  rerender(<Budget count={400} key={400} />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "List items: 400 / 500 (includes nested lists and hidden blocks).",
  );
  rerender(<Budget count={501} key={501} />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "List items: 501 / 500 (includes nested lists and hidden blocks). An entry allows at most 500 list items",
  );
});
