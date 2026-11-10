import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from "react";
import { useWatch, type Control, type UseFormReturn } from "react-hook-form";
import type { ContentModelDto } from "@lacecms/contracts";
import type {
  DraftEditorValues,
  FieldEditorServices,
} from "../../../shared/editor-contract/index.js";
import type {
  FieldPreviewRegistry,
  FieldRendererRegistry,
  MediaListPickerProps,
} from "../field-types.js";

type Form = UseFormReturn<DraftEditorValues, unknown, DraftEditorValues>;
interface ContextValue {
  readonly services: FieldEditorServices;
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly renderers: FieldRendererRegistry;
  readonly previews?: FieldPreviewRegistry | undefined;
  /** Adds several items to eligible media lists at once; without it they use the ordinary Add. */
  readonly mediaListPicker?: ComponentType<MediaListPickerProps> | undefined;
  readonly epoch?: number;
  readonly form?: Form | undefined;
  readonly model?: ContentModelDto | undefined;
}
const Context = createContext<ContextValue | undefined>(undefined);
export function useEditorContext(): ContextValue {
  const context = useContext(Context);
  if (!context) throw new Error("FieldRendererProvider is required");
  return context;
}
export function FieldRendererProvider({
  children,
  services,
  readOnly = false,
  busy = false,
  renderers,
  previews,
  mediaListPicker,
  editor,
}: Omit<ContextValue, "readOnly" | "busy" | "form" | "model" | "epoch"> & {
  readonly editor?:
    | {
        readonly form: Form;
        readonly model?: ContentModelDto | undefined;
        readonly editorEpoch?: number;
      }
    | undefined;
  readonly readOnly?: boolean;
  readonly busy?: boolean;
  readonly children: ReactNode;
}) {
  const form = editor?.form;
  const model = editor?.model;
  const epoch = editor?.editorEpoch ?? 0;
  const value = useMemo(
    () => ({
      services,
      readOnly,
      busy,
      renderers,
      previews,
      mediaListPicker,
      form,
      model,
      epoch,
    }),
    [services, readOnly, busy, renderers, previews, mediaListPicker, form, model, epoch],
  );
  return form ? (
    <BoundContext value={value} form={form}>
      {children}
    </BoundContext>
  ) : (
    <Context.Provider value={value}>{children}</Context.Provider>
  );
}
function BoundContext({
  value,
  form,
  children,
}: {
  readonly value: ContextValue;
  readonly form: Form;
  readonly children: ReactNode;
}) {
  useWatch({ control: form.control, name: ["fields", "blocks"] });
  const values = form.getValues();
  // Notify every list about entry-wide budget changes in other fields/blocks.
  const context = useMemo(() => ({ ...value, snapshot: values }), [value, values]);
  return <Context.Provider value={context}>{children}</Context.Provider>;
}
/** Shared by nested list and block growth affordances. Always checks the prospective snapshot. */
export function useCompositeEditing() {
  const context = useEditorContext();
  const { replacePath, snapshotBudget } = context.services;
  return {
    ...context,
    growthProblem: (name: string, next: unknown): string | undefined => {
      if (!context.form || !context.model) return undefined;
      const values = context.form.getValues();
      const candidate = replacePath(values, name.split("."), next) as DraftEditorValues;
      return snapshotBudget(context.model, candidate).problem;
    },
  };
}
export function EntryListBudget({
  control,
  model,
}: {
  readonly control: Control<DraftEditorValues, unknown, DraftEditorValues>;
  readonly model: ContentModelDto;
}) {
  const { snapshotBudget } = useEditorContext().services;
  const [fields, blocks] = useWatch({ control, name: ["fields", "blocks"] });
  const budget = snapshotBudget(model, {
    title: "",
    blocks: blocks ?? [],
    fields: fields ?? {},
  });
  return (
    <p className="text-xs text-muted-foreground" role="status">
      List items: {budget.count} / 500 (includes nested lists and hidden blocks). {budget.problem}
    </p>
  );
}
