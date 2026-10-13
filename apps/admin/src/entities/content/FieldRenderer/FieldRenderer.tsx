import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { Controller, useWatch, type Control, type UseFormReturn } from "react-hook-form";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  MAX_LIST_ITEMS,
  textLength,
  validateFieldValue,
  type FieldDefinition as Descriptor,
} from "@lacecms/content";
import type { ContentModelDto } from "@lacecms/contracts";
import { GripVerticalIcon } from "lucide-react";
import { Button } from "../../../shared/ui/Button/index.js";
import { REVEAL_CONTROL_EVENT } from "../../../shared/lib/index.js";
import { fieldErrorClass } from "../../../shared/ui/layout/index.js";
import { fieldProblem, recursiveFieldErrors, type DraftEditorValues } from "../editor-form.js";
import { FieldLayout } from "../FieldLayout/index.js";
import { fieldGuidance } from "../field-guidance.js";
import { fieldLabel } from "../draft.js";
import {
  fieldControlId,
  type FieldDefinition,
  type FieldRendererRegistry,
} from "../field-types.js";
import { builtInRenderers, groupedFieldTypes } from "../FieldControls/index.js";
import {
  cleanValue,
  draftItemValue,
  duplicateItem,
  fieldStartingValue,
  moveItem,
  newItemIdentity,
  record,
  replacePath,
  snapshotBudget,
} from "../composite-values.js";

export type { FieldDefinition, FieldRendererProps, FieldRendererRegistry } from "../field-types.js";
type Form = UseFormReturn<DraftEditorValues, unknown, DraftEditorValues>;
interface ContextValue {
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly renderers: FieldRendererRegistry;
  readonly epoch?: number;
  readonly onTransientChange?: (() => void) | undefined;
  readonly transient?: Map<string, { name: string; message: string }> | undefined;
  readonly form?: Form | undefined;
  readonly model?: ContentModelDto | undefined;
}
const Context = createContext<ContextValue>({ readOnly: false, busy: false, renderers: {} });
export function FieldRendererProvider({
  children,
  readOnly = false,
  busy = false,
  renderers,
  form,
  model,
  transient,
  epoch = 0,
  onTransientChange,
}: Omit<ContextValue, "readOnly" | "busy"> & {
  readonly readOnly?: boolean;
  readonly busy?: boolean;
  readonly children: ReactNode;
}) {
  const value = useMemo(
    () => ({ readOnly, busy, renderers, form, model, transient, epoch, onTransientChange }),
    [readOnly, busy, renderers, form, model, transient, epoch, onTransientChange],
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
  const values = useWatch<Record<string, unknown>>({ control: form.control as never });
  // Notify every list about entry-wide budget changes in other fields/blocks.
  const context = useMemo(() => ({ ...value, snapshot: values }), [value, values]);
  return <Context.Provider value={context}>{children}</Context.Provider>;
}
/** Shared by nested list and block growth affordances. Always checks the prospective snapshot. */
export function useCompositeEditing() {
  const context = useContext(Context);
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
  readonly control: Control<DraftEditorValues>;
  readonly model: ContentModelDto;
}) {
  const values = useWatch<Record<string, unknown>>({
    control: control as never,
  }) as unknown as DraftEditorValues;
  const budget = snapshotBudget(model, {
    ...values,
    blocks: values.blocks ?? [],
    fields: values.fields ?? {},
  });
  return (
    <p className="text-xs text-muted-foreground" role="status">
      List items: {budget.count} / 500 (includes nested lists and hidden blocks). {budget.problem}
    </p>
  );
}
type Errors = Record<string, unknown> | undefined;
function errorMessage(error: unknown): string | undefined {
  return error !== null &&
    typeof error === "object" &&
    typeof (error as Record<string, unknown>).message === "string"
    ? ((error as Record<string, unknown>).message as string)
    : undefined;
}
function hasProblems(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    (typeof (error as Record<string, unknown>).message === "string" ||
      Object.values(error).some(hasProblems))
  );
}
function summary(definition: Descriptor, value: unknown, itemLabel?: string): string {
  if (itemLabel && record(value) && typeof value[itemLabel] === "string" && value[itemLabel].trim())
    return value[itemLabel].replace(/\s+/gu, " ").trim();
  const texts: { priority: number; text: string }[] = [];
  function visit(field: Descriptor, current: unknown) {
    if (field.type === "group" && record(current))
      Object.entries(field.fields).forEach(([key, child]) => visit(child, current[key]));
    else if (field.type === "list" && Array.isArray(current))
      current.forEach((item) => visit(field.item, item));
    else if (
      ["text", "textarea", "url", "select"].includes(field.type) &&
      typeof current === "string" &&
      current.trim()
    )
      texts.push({
        priority: field.type === "text" || field.type === "textarea" ? 0 : 2,
        text: current,
      });
    else if (field.type === "richText" && record(current)) {
      const plain = (node: unknown): string =>
        record(node)
          ? typeof node.text === "string"
            ? node.text
            : Array.isArray(node.content)
              ? node.content.map(plain).join(" ")
              : ""
          : "";
      const text = plain(current);
      if (text.trim()) texts.push({ priority: 1, text });
    } else if (field.type === "media" && typeof current === "string" && current)
      texts.push({ priority: 3, text: "Media selected" });
  }
  visit(definition, value);
  return (
    texts
      .sort((a, b) => a.priority - b.priority)[0]
      ?.text.replace(/\s+/gu, " ")
      .trim() ?? "Empty item"
  );
}

/** Disclosures register a synchronous reveal listener while keeping descendants mounted. */
function Disclosure({
  children,
  label,
  id,
  description,
  guidance,
  required,
  error,
  suffix,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly id: string;
  readonly description?: string | undefined;
  readonly guidance?: string | undefined;
  readonly required?: boolean;
  readonly error?: unknown;
  readonly suffix?: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    const element = ref.current;
    const reveal = () => flushSync(() => setOpen(true));
    element?.addEventListener(REVEAL_CONTROL_EVENT, reveal);
    return () => element?.removeEventListener(REVEAL_CONTROL_EVENT, reveal);
  }, []);
  return (
    <fieldset
      aria-describedby={
        [
          description ? `${id}:description` : undefined,
          guidance ? `${id}:guidance` : undefined,
          errorMessage(error) ? `${id}:error` : undefined,
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
      className="grid min-w-0 gap-2 rounded-md border border-border p-3"
      id={id}
      ref={ref}
      tabIndex={-1}
    >
      <legend className="px-1 text-sm font-medium">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-xs text-muted-foreground">
            Required
          </span>
        ) : null}
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-controls={`${id}:body`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          size="sm"
          variant="ghost"
        >
          {open ? "Collapse" : "Expand"} {label}
        </Button>
        {suffix}
        {hasProblems(error) ? <span className="text-xs text-destructive">Has problems</span> : null}
      </div>
      {description ? (
        <small className="text-muted-foreground" id={`${id}:description`}>
          {description}
        </small>
      ) : null}
      {guidance ? (
        <small className="text-muted-foreground" id={`${id}:guidance`}>
          {guidance}
        </small>
      ) : null}
      {errorMessage(error) ? (
        <p className={fieldErrorClass} id={`${id}:error`} role="alert">
          {errorMessage(error)}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-3" hidden={!open} id={`${id}:body`}>
        {children}
      </div>
    </fieldset>
  );
}
interface NodeProps {
  readonly definition: FieldDefinition;
  readonly name: string;
  readonly fieldKey: string;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly onBlur: () => void;
  readonly errors?: Errors;
  readonly onErrors?: ((errors: Errors) => void) | undefined;
  readonly item?: boolean;
  readonly annotation?: string | undefined;
  readonly notice?: ReactNode;
  readonly placeholder?: string | undefined;
}
function ValueNode(props: NodeProps) {
  const {
    definition,
    name,
    fieldKey,
    value,
    onChange,
    onBlur,
    errors,
    onErrors,
    item = false,
    annotation,
    notice,
    placeholder,
  } = props;
  const { readOnly, busy, renderers, growthProblem, transient, epoch, form, onTransientChange } =
    useCompositeEditing();
  const id = fieldControlId(name as `fields.${string}`);
  const label = item ? fieldKey : fieldLabel(fieldKey, definition.label);
  const [clearedItem, setClearedItem] = useState(false);
  useEffect(() => {
    setClearedItem(false);
  }, [epoch]);
  const identity = useId();
  useLayoutEffect(() => {
    if (clearedItem)
      transient?.set(identity, { name, message: "Enter a value or remove this item." });
    else transient?.delete(identity);
    onTransientChange?.();
    return () => {
      transient?.delete(identity);
      onTransientChange?.();
    };
  }, [clearedItem, identity, name, transient, onTransientChange]);
  const error = clearedItem ? "Enter a value or remove this item." : errorMessage(errors);
  const blockIndex = /^blocks\.(\d+)\./u.exec(name)?.[1];
  const hidden =
    blockIndex !== undefined && form?.getValues(`blocks.${Number(blockIndex)}.hidden`) === true;
  const message =
    error && errors?.type === "publication"
      ? hidden && !error.includes("This block is hidden")
        ? `${error} This block is hidden, so this does not block publishing.`
        : hidden
          ? error
          : `${error} Required for publication only.`
      : error;
  if (definition.type === "list") return <ListNode {...props} definition={definition} />;
  if (definition.type === "group") {
    const present = record(value);
    const candidate = fieldStartingValue(definition, {});
    const createProblem = growthProblem(name, candidate);
    const clearProblem = growthProblem(name, null);
    return (
      <Disclosure
        description={definition.description}
        guidance={fieldGuidance(definition)}
        required={definition.required}
        error={errors}
        id={id}
        label={label}
        suffix={
          !readOnly && !item && present ? (
            <Button
              disabled={busy || !!clearProblem}
              onClick={() => onChange(undefined)}
              size="sm"
              variant="ghost"
            >
              Clear {label}
            </Button>
          ) : undefined
        }
      >
        {!present ? (
          <>
            <p className="text-sm text-muted-foreground">
              Not set{definition.required ? " · Required for publication" : ""}
            </p>
            {!readOnly ? (
              <Button
                disabled={busy || !!createProblem}
                onClick={() => onChange(candidate)}
                size="sm"
                variant="outline"
              >
                Create {label}
              </Button>
            ) : null}
            {createProblem ? <small>{createProblem}</small> : null}
          </>
        ) : (
          <FieldLayout
            fields={definition.fields}
            layout={definition.layout}
            label={label}
            errors={errors}
            hiddenBlock={hidden}
            renderField={(key) => {
              const child = definition.fields[key]!;
              return (
                <ValueNode
                  definition={child}
                  errors={
                    errors?.[key] !== null && typeof errors?.[key] === "object"
                      ? (errors[key] as Errors)
                      : undefined
                  }
                  fieldKey={key}
                  key={key}
                  name={`${name}.${key}`}
                  onBlur={onBlur}
                  onChange={(next) => {
                    const copy = { ...value };
                    copy[key] = next === undefined ? null : next;
                    onChange(copy);
                  }}
                  onErrors={onErrors ? (next) => onErrors({ ...errors, [key]: next }) : undefined}
                  value={value[key] === null ? undefined : value[key]}
                />
              );
            }}
          />
        )}
        {Object.hasOwn(definition, "defaultValue") ? (
          <small className="text-muted-foreground">
            Clearing uses the configured default on save.
          </small>
        ) : null}
        {clearProblem ? <small>{clearProblem}</small> : null}
      </Disclosure>
    );
  }
  const guidance = fieldGuidance(definition);
  const effectivePlaceholder =
    placeholder ?? ("placeholder" in definition ? definition.placeholder : undefined);
  const counted = definition.type === "text" || definition.type === "textarea";
  const marker = definition.required ? (
    <span aria-hidden="true" className="ml-1 text-xs text-muted-foreground">
      Required
    </span>
  ) : null;
  const Renderer = renderers[definition.type] ?? builtInRenderers[definition.type];
  const describedBy =
    [
      definition.description ? `${id}-description` : undefined,
      guidance ? `${id}-guidance` : undefined,
      counted ? `${id}-count` : undefined,
      annotation ? `${id}-annotation` : undefined,
      placeholder ? `${id}-placeholder` : undefined,
      !readOnly && notice ? `${id}-notice` : undefined,
      message ? `${id}-error` : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <fieldset className="grid min-w-0 gap-1.5 border-0 p-0" disabled={readOnly || busy}>
      {groupedFieldTypes.has(definition.type) ? (
        <span className="text-sm font-medium">
          {label}
          {marker}
        </span>
      ) : (
        <div className="flex items-baseline gap-1">
          <label className="text-sm font-medium" htmlFor={id}>
            {label}
          </label>
          {marker}
        </div>
      )}
      {definition.description ? (
        <small className="text-xs text-muted-foreground" id={`${id}-description`}>
          {definition.description}
        </small>
      ) : null}
      {guidance ? (
        <small className="text-xs text-muted-foreground" id={`${id}-guidance`}>
          {guidance}
        </small>
      ) : null}
      {annotation ? (
        <small className="text-xs text-muted-foreground" id={`${id}-annotation`}>
          {annotation}
        </small>
      ) : null}
      <Renderer
        definition={definition}
        describedBy={describedBy}
        fieldKey={fieldKey}
        id={id}
        invalid={!!message}
        label={label}
        onBlur={onBlur}
        onChange={(next) => {
          if (readOnly || busy) return;
          if (item && (next === undefined || next === null)) {
            // Empty string is a real scalar item when valid; absent slots never enter arrays.
            if (
              (definition.type === "text" || definition.type === "textarea") &&
              !fieldProblem(definition, "")
            ) {
              setClearedItem(false);
              onChange("");
              return;
            }
            setClearedItem(true);
            onErrors?.({
              ...errors,
              message: "Enter a value or remove this item.",
              type: "validate",
            });
            return;
          }
          setClearedItem(false);
          onErrors?.(undefined);
          onChange(next);
        }}
        placeholder={effectivePlaceholder}
        readOnly={readOnly || busy}
        value={clearedItem ? undefined : value}
      />
      {counted ? (
        <p className="m-0 text-xs text-muted-foreground" id={`${id}-count`}>
          {textLength(typeof value === "string" && !clearedItem ? value : "")} characters
        </p>
      ) : null}
      {placeholder ? (
        <span className="sr-only" id={`${id}-placeholder`}>
          {placeholder}
        </span>
      ) : null}
      {!readOnly && notice ? <div id={`${id}-notice`}>{notice}</div> : null}
      {message ? (
        <p className={`${fieldErrorClass} text-xs`} id={`${id}-error`} role="alert">
          {message}
        </p>
      ) : null}
    </fieldset>
  );
}
function SortableItem({
  id,
  label,
  children,
  readOnly,
  disabled,
  header,
}: {
  readonly id: string;
  readonly label: string;
  readonly children: ReactNode;
  readonly readOnly: boolean;
  readonly disabled: boolean;
  readonly header: ReactNode;
}) {
  const sortable = useSortable({ id, disabled: readOnly || disabled });
  return (
    <li
      className="grid min-w-0 gap-2 rounded-md border border-border p-2"
      data-item-id={id}
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
    >
      <div className="flex flex-wrap items-center gap-1">
        {!readOnly ? (
          <Button
            aria-label={`Reorder ${label}`}
            disabled={disabled}
            size="icon-sm"
            variant="ghost"
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVerticalIcon aria-hidden />
          </Button>
        ) : null}
        {header}
      </div>
      {children}
    </li>
  );
}
function ListNode(
  props: NodeProps & { readonly definition: Extract<FieldDefinition, { type: "list" }> },
) {
  const { definition, name, fieldKey, value, onChange, onBlur, errors, onErrors } = props;
  const { readOnly, busy, growthProblem, epoch } = useCompositeEditing();
  const list = Array.isArray(value) ? value : [];
  const [ids, setIds] = useState(() => list.map(newItemIdentity));
  const lastEpoch = useRef(epoch);
  useLayoutEffect(() => {
    if (lastEpoch.current !== epoch) {
      lastEpoch.current = epoch;
      setIds(list.map(newItemIdentity));
      setPending(false);
    }
  }, [epoch, list]);
  // External reset/normalization can change length. Reorders always update tokens explicitly.
  const tokens = list.map((_, i) => ids[i] ?? newItemIdentity());
  useLayoutEffect(() => {
    if (tokens.length !== ids.length) setIds(tokens);
  });
  const [pending, setPending] = useState(false);
  const [pendingValue, setPendingValue] = useState<unknown>();
  const [announcement, setAnnouncement] = useState("");
  const [focusToken, setFocusToken] = useState<string>();
  const container = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!focusToken) return;
    const row = [
      ...(container.current?.querySelectorAll<HTMLElement>("[data-item-id]") ?? []),
    ].find((element) => element.dataset.itemId === focusToken);
    const control = row?.querySelector<HTMLElement>(
      'input,textarea,[contenteditable="true"],button',
    );
    (control ?? addRef.current)?.focus();
    setFocusToken(undefined);
  }, [focusToken, tokens]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const label = fieldLabel(fieldKey, definition.label);
  const id = fieldControlId(name as `fields.${string}`);
  const initial = draftItemValue(definition.item);
  const addProblem =
    list.length >= (definition.maxItems ?? MAX_LIST_ITEMS)
      ? `This list allows at most ${definition.maxItems ?? MAX_LIST_ITEMS} items.`
      : growthProblem(name, [...list, initial ?? fieldStartingValue(definition.item, {})]);
  const createProblem = growthProblem(name, []);
  const clearProblem = growthProblem(name, null);
  const change = (next: unknown[], nextIds: string[], nextErrors: Errors) => {
    if (readOnly || busy) return;
    setIds(nextIds);
    onErrors?.(nextErrors);
    onChange(next);
  };
  const errorItems = tokens.map((_, index) => errors?.[index]);
  const remapErrors = (entries: unknown[]): Errors => {
    const next = { ...errors };
    Object.keys(next)
      .filter((key) => /^\d+$/u.test(key))
      .forEach((key) => delete next[key]);
    entries.forEach((error, index) => {
      if (error) next[index] = error;
    });
    return next;
  };
  const insert = (nextValue: unknown) => {
    if (addProblem || growthProblem(name, [...list, nextValue])) return;
    const token = newItemIdentity();
    change([...list, structuredClone(nextValue)], [...tokens, token], errors);
    setPending(false);
    setPendingValue(undefined);
    setFocusToken(token);
    setAnnouncement(`Added ${label} item ${list.length + 1}.`);
  };
  const move = (from: number, to: number) => {
    if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return;
    change(
      moveItem(list, from, to),
      moveItem(tokens, from, to),
      remapErrors(moveItem(errorItems, from, to)),
    );
    setFocusToken(tokens[from]);
    setAnnouncement(`${label} item moved to position ${to + 1} of ${list.length}.`);
  };
  let pendingProblem: string | undefined = "Enter a value.";
  if (pendingValue !== undefined && pendingValue !== null)
    pendingProblem = fieldProblem(definition.item, pendingValue);
  return (
    <Disclosure
      description={definition.description}
      guidance={fieldGuidance(definition)}
      required={definition.required}
      error={errors}
      id={id}
      label={label}
      suffix={
        <small>
          {list.length} / {definition.maxItems ?? MAX_LIST_ITEMS} items
          {definition.minItems ? ` · Minimum ${definition.minItems} for publication` : ""}
        </small>
      }
    >
      <div className="grid min-w-0 gap-2" ref={container}>
        <p className="sr-only" role="status">
          {announcement}
        </p>
        {value === undefined || value === null ? (
          <>
            <p>Not set{definition.required ? " · Required for publication" : ""}</p>
            {!readOnly ? (
              <Button
                disabled={busy || !!createProblem}
                onClick={() => onChange([])}
                size="sm"
                variant="outline"
              >
                Create {label}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <DndContext
              accessibility={{
                announcements: {
                  onDragStart: ({ active }) =>
                    `Picked up ${label} item ${tokens.indexOf(String(active.id)) + 1}.`,
                  onDragOver: ({ over }) =>
                    over
                      ? `${label} position ${tokens.indexOf(String(over.id)) + 1} of ${list.length}.`
                      : undefined,
                  onDragEnd: ({ over }) =>
                    `${label} dropped at position ${tokens.indexOf(String(over?.id)) + 1}.`,
                  onDragCancel: () => `Reordering ${label} cancelled.`,
                },
              }}
              collisionDetection={closestCenter}
              onDragEnd={({ active, over }) => {
                if (over) move(tokens.indexOf(String(active.id)), tokens.indexOf(String(over.id)));
              }}
              sensors={sensors}
            >
              <SortableContext items={tokens} strategy={verticalListSortingStrategy}>
                <ol aria-label={label} className="m-0 grid min-w-0 list-none gap-3 p-0">
                  {list.map((itemValue, index) => {
                    const token = tokens[index]!;
                    const itemName = `${label} item ${index + 1}`;
                    const itemSummary = summary(definition.item, itemValue, definition.itemLabel);
                    const duplicateProblem =
                      list.length >= (definition.maxItems ?? MAX_LIST_ITEMS)
                        ? addProblem
                        : growthProblem(name, duplicateItem(list, index));
                    return (
                      <SortableItem
                        disabled={busy}
                        id={token}
                        key={token}
                        label={itemName}
                        readOnly={readOnly}
                        header={
                          <>
                            <span className="min-w-0 flex-1 truncate text-sm" title={itemSummary}>
                              {index + 1}. {itemSummary.slice(0, 80)}
                            </span>
                            {!readOnly ? (
                              <>
                                <Button
                                  aria-label={`Move up ${itemName}`}
                                  disabled={busy || index === 0}
                                  onClick={() => move(index, index - 1)}
                                  size="sm"
                                  variant="ghost"
                                >
                                  Up
                                </Button>
                                <Button
                                  aria-label={`Move down ${itemName}`}
                                  disabled={busy || index === list.length - 1}
                                  onClick={() => move(index, index + 1)}
                                  size="sm"
                                  variant="ghost"
                                >
                                  Down
                                </Button>
                                <Button
                                  aria-describedby={
                                    duplicateProblem ? `${id}:${token}-limit` : undefined
                                  }
                                  aria-label={`Duplicate ${itemName}`}
                                  disabled={busy || !!duplicateProblem}
                                  onClick={() => {
                                    const nextToken = newItemIdentity();
                                    const nextIds = [...tokens];
                                    nextIds.splice(index + 1, 0, nextToken);
                                    const nextErrors = [...errorItems];
                                    nextErrors.splice(index + 1, 0, undefined);
                                    change(
                                      duplicateItem(list, index),
                                      nextIds,
                                      remapErrors(nextErrors),
                                    );
                                    setFocusToken(nextToken);
                                    setAnnouncement(`Duplicated ${itemName}.`);
                                  }}
                                  size="sm"
                                  variant="ghost"
                                >
                                  Duplicate
                                </Button>
                                <Button
                                  aria-label={`Remove ${itemName}`}
                                  disabled={busy}
                                  onClick={() => {
                                    change(
                                      list.filter((_, i) => i !== index),
                                      tokens.filter((_, i) => i !== index),
                                      remapErrors(errorItems.filter((_, i) => i !== index)),
                                    );
                                    setFocusToken(tokens[index + 1] ?? tokens[index - 1] ?? "add");
                                    setAnnouncement(`Removed ${itemName}.`);
                                  }}
                                  size="sm"
                                  variant="ghost"
                                >
                                  Remove
                                </Button>
                                {duplicateProblem ? (
                                  <small
                                    className="basis-full text-muted-foreground"
                                    id={`${id}:${token}-limit`}
                                  >
                                    {duplicateProblem}
                                  </small>
                                ) : null}
                              </>
                            ) : null}
                          </>
                        }
                      >
                        <ValueNode
                          definition={definition.item}
                          errors={
                            errors?.[index] !== null && typeof errors?.[index] === "object"
                              ? (errors[index] as Errors)
                              : undefined
                          }
                          fieldKey={`${label} item ${index + 1}`}
                          item
                          name={`${name}.${index}`}
                          onBlur={onBlur}
                          onChange={(next) => {
                            const copy = [...list];
                            copy[index] = next;
                            onChange(copy);
                          }}
                          onErrors={
                            onErrors ? (next) => onErrors({ ...errors, [index]: next }) : undefined
                          }
                          value={itemValue}
                        />
                      </SortableItem>
                    );
                  })}
                </ol>
              </SortableContext>
            </DndContext>
            {!list.length ? <p className="text-sm text-muted-foreground">No items.</p> : null}
            {!readOnly ? (
              <>
                <Button
                  aria-describedby={addProblem ? `${id}:limit` : undefined}
                  disabled={busy || !!addProblem}
                  onClick={() => {
                    if (initial !== undefined) insert(initial);
                    else {
                      setPending(true);
                      setPendingValue(undefined);
                    }
                  }}
                  ref={addRef}
                  size="sm"
                  variant="outline"
                >
                  Add {label} item
                </Button>
                {pending ? (
                  <div className="grid gap-2 rounded border border-border p-2">
                    <ValueNode
                      definition={definition.item}
                      fieldKey={`New ${label} item`}
                      name={`${name}.new`}
                      onBlur={() => {}}
                      onChange={setPendingValue}
                      value={pendingValue}
                    />
                    <Button
                      disabled={
                        busy || !!pendingProblem || !!growthProblem(name, [...list, pendingValue])
                      }
                      onClick={() => {
                        if (!pendingProblem)
                          insert(
                            validateFieldValue(
                              definition.item,
                              cleanValue(pendingValue, definition.item),
                              [],
                              "draft",
                            ),
                          );
                      }}
                      size="sm"
                    >
                      Add item
                    </Button>
                    <Button
                      onClick={() => {
                        setPending(false);
                        setPendingValue(undefined);
                        addRef.current?.focus();
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : null}
                <Button
                  aria-describedby={clearProblem ? `${id}:clear-limit` : undefined}
                  disabled={busy || !!clearProblem}
                  onClick={() => onChange(undefined)}
                  size="sm"
                  variant="ghost"
                >
                  Clear {label}
                </Button>
                {Object.hasOwn(definition, "defaultValue") ? (
                  <small>Clearing uses the configured default on save.</small>
                ) : null}
              </>
            ) : null}
          </>
        )}
        {createProblem ? <small>{createProblem}</small> : null}
        {clearProblem ? <small id={`${id}:clear-limit`}>{clearProblem}</small> : null}
        {addProblem ? (
          <small className="text-muted-foreground" id={`${id}:limit`}>
            {addProblem}
          </small>
        ) : null}
        {list.length < (definition.minItems ?? 0) ? (
          <small className="text-muted-foreground">
            Add at least {definition.minItems} items for publication only.
          </small>
        ) : null}
      </div>
    </Disclosure>
  );
}

/** One root controller owns a composite; nested controls compose ordinary JSON values. */
export function FieldRenderer({
  control,
  name,
  error,
  ...props
}: {
  readonly control: Control<DraftEditorValues, unknown, DraftEditorValues>;
  readonly name: `blocks.${number}.${"data" | "settings"}.${string}` | `fields.${string}`;
  readonly error: string | undefined;
  readonly definition: FieldDefinition;
  readonly fieldKey: string;
  readonly annotation?: string | undefined;
  readonly notice?: ReactNode;
  readonly placeholder?: string | undefined;
}) {
  const { form } = useContext(Context);
  const applyErrors = (next: unknown) => {
    if (!form) return;
    form.clearErrors(name as never);
    const visit = (value: unknown, path: string) => {
      if (value === null || typeof value !== "object") return;
      const entries = value as Record<string, unknown>;
      if (typeof entries.message === "string")
        form.setError(path as never, {
          message: entries.message,
          type: typeof entries.type === "string" ? entries.type : "server",
        });
      Object.entries(value).forEach(([key, child]) => {
        if (key !== "ref" && child !== null && typeof child === "object")
          visit(child, `${path}.${key}`);
      });
    };
    visit(next, name);
  };
  const retainedErrors = (value: unknown): Record<string, unknown> => {
    if (value === null || typeof value !== "object") return {};
    const entries = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(entries).flatMap(([key, child]) => {
        if (key === "ref" || ((key === "message" || key === "type") && entries.type === "validate"))
          return [];
        return [[key, child !== null && typeof child === "object" ? retainedErrors(child) : child]];
      }),
    );
  };
  const mergeErrors = (
    local: Record<string, unknown>,
    retained: Record<string, unknown>,
  ): Record<string, unknown> => {
    const result = { ...local };
    for (const [key, value] of Object.entries(retained)) {
      if (value !== null && typeof value === "object")
        result[key] = mergeErrors(
          typeof result[key] === "object" && result[key] !== null
            ? (result[key] as Record<string, unknown>)
            : {},
          value as Record<string, unknown>,
        );
      else result[key] = value;
    }
    return result;
  };
  return (
    <Controller
      control={control}
      name={name as never}
      render={({ field, fieldState }) => (
        <ValueNode
          {...props}
          errors={
            error
              ? ({ ...fieldState.error, message: error } as Errors)
              : (fieldState.error as unknown as Errors)
          }
          name={name}
          onBlur={field.onBlur}
          onChange={(next) => {
            field.onChange(next === undefined ? null : next);
            if (form && hasProblems(fieldState.error)) {
              const retained = retainedErrors(form.getFieldState(name as never).error);
              applyErrors(mergeErrors(recursiveFieldErrors(props.definition, next), retained));
            }
          }}
          onErrors={form ? applyErrors : undefined}
          value={field.value === null ? undefined : field.value}
        />
      )}
    />
  );
}
