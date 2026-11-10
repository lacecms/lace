import { useLayoutEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { DraftEditorValues, DraftFieldPath } from "../../shared/editor-contract/index.js";

const message = "Enter a value or remove this item.";
type Form = UseFormReturn<DraftEditorValues, unknown, DraftEditorValues>;

/** Synchronize a mounted scalar's transient issue with the form, including after a move. */
export function useTransientIssue(
  form: Form | undefined,
  identity: string,
  name: string,
  cleared: boolean,
) {
  useLayoutEffect(() => {
    if (!form || !cleared || !/^(?:fields\.|blocks\.\d+\.(?:data|settings)\.)/u.test(name)) return;
    const path = name as DraftFieldPath;
    const current = form.getValues("__transient") ?? {};
    form.setValue("__transient", { ...current, [identity]: path });
    const previous = form.getFieldState(path).error;
    form.setError(path, {
      type: "transient",
      message,
      ...(previous && previous.type !== "transient"
        ? {
            types: {
              ...previous.types,
              priorType: previous.type,
              priorMessage: previous.message ?? "",
            },
          }
        : previous?.types
          ? { types: previous.types }
          : {}),
    });
    return () => {
      const active = form.getValues("__transient") ?? {};
      if (active[identity] !== path) return;
      const { [identity]: _removed, ...remaining } = active;
      if (Object.keys(remaining).length) form.setValue("__transient", remaining);
      else form.unregister("__transient", { keepDefaultValue: true });
      if (Object.values(remaining).includes(path)) return;
      const error = form.getFieldState(path).error;
      if (error?.type !== "transient") return;
      if (typeof error.types?.priorType === "string") {
        form.setError(path, {
          type: error.types.priorType,
          message: typeof error.types.priorMessage === "string" ? error.types.priorMessage : "",
        });
      } else form.clearErrors(path);
    };
  }, [form, identity, name, cleared]);
}
