import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { expect, test } from "vitest";
import type { DraftEditorValues } from "../../shared/editor-contract/index.js";
import { useTransientIssue } from "./transient-issues.js";

test("unmounting a conditional control clears only its form-owned issue", () => {
  const { result, rerender } = renderHook(
    ({ first, second }) => {
      const form = useForm<DraftEditorValues>({
        defaultValues: { title: "", fields: { items: [1, 2] }, blocks: [] },
      });
      useTransientIssue(form, "first", "fields.items.0", first);
      useTransientIssue(form, "second", "fields.items.1", second);
      return form;
    },
    { initialProps: { first: false, second: false } },
  );
  rerender({ first: true, second: true });
  expect(result.current.getFieldState("fields.items.0").error?.type).toBe("transient");
  expect(result.current.getValues("__transient")).toEqual({
    first: "fields.items.0",
    second: "fields.items.1",
  });
  rerender({ first: false, second: true });
  expect(result.current.getFieldState("fields.items.0").error).toBeUndefined();
  expect(result.current.getFieldState("fields.items.1").error?.type).toBe("transient");
  rerender({ first: false, second: false });
  expect(result.current.getValues("__transient")).toBeUndefined();
  expect(result.current.getFieldState("fields.items.1").error).toBeUndefined();
});

test("a reset does not let stale cleanup remove a newer issue", () => {
  const { result, rerender } = renderHook(
    ({ active }) => {
      const form = useForm<DraftEditorValues>({
        defaultValues: { title: "", fields: { items: [1] }, blocks: [] },
      });
      useTransientIssue(form, "old", "fields.items.0", active);
      return form;
    },
    { initialProps: { active: true } },
  );
  act(() => {
    result.current.reset({ title: "", fields: { items: [2] }, blocks: [] });
    result.current.setValue("__transient", { newer: "fields.items.0" });
    result.current.setError("fields.items.0", { type: "transient", message: "New issue" });
  });
  rerender({ active: false });
  expect(result.current.getValues("__transient")).toEqual({ newer: "fields.items.0" });
  expect(result.current.getFieldState("fields.items.0").error?.message).toBe("New issue");
});
