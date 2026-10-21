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
import { MAX_LIST_ITEMS, textLength, validateFieldValue } from "@lacecms/content";
import type { ContentModelDto } from "@lacecms/contracts";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CopyIcon,
  EraserIcon,
  GripVerticalIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { Badge } from "../../../shared/ui/Badge/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../shared/ui/DropdownMenu/index.js";
import { cn, REVEAL_CONTROL_EVENT } from "../../../shared/lib/index.js";
import { fieldErrorClass } from "../../../shared/ui/layout/index.js";
import { fieldProblem, recursiveFieldErrors, type DraftEditorValues } from "../editor-form.js";
import { FieldLayout } from "../FieldLayout/index.js";
import { fieldGuidance, fieldGuidanceParts } from "../field-guidance.js";
import { fieldLabel } from "../draft.js";
import {
  fieldControlId,
  type FieldDefinition,
  type FieldPreviewRegistry,
  type FieldRendererRegistry,
  type ItemPreview,
} from "../field-types.js";
import { builtInRenderers, groupedFieldTypes } from "../FieldControls/index.js";
import { itemSummary as summarize, previewLeaf, rowLines } from "../item-summary.js";
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

export type {
  FieldDefinition,
  FieldPreviewProps,
  FieldPreviewRegistry,
  FieldRendererProps,
  FieldRendererRegistry,
  ItemPreview,
} from "../field-types.js";
type Form = UseFormReturn<DraftEditorValues, unknown, DraftEditorValues>;
interface ContextValue {
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly renderers: FieldRendererRegistry;
  readonly previews?: FieldPreviewRegistry | undefined;
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
  previews,
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
    () => ({
      readOnly,
      busy,
      renderers,
      previews,
      form,
      model,
      transient,
      epoch,
      onTransientChange,
    }),
    [readOnly, busy, renderers, previews, form, model, transient, epoch, onTransientChange],
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

/** The disclosure toggle icon shared with block cards: pointing down while open. */
function Chevron({ open }: { readonly open: boolean }) {
  return (
    <ChevronDownIcon
      aria-hidden
      className={cn(
        "transition-transform duration-(--duration-fast) ease-standard",
        !open && "-rotate-90",
      )}
    />
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
  const { readOnly } = useCompositeEditing();
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
          aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
          onClick={() => setOpen(!open)}
          size="icon-sm"
          variant="ghost"
        >
          <Chevron open={open} />
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
        <small
          className={cn("text-muted-foreground", !readOnly && !hasProblems(error) && "sr-only")}
          id={`${id}:guidance`}
        >
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
    const content = (
      <>
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
      </>
    );
    // A list item's group is framed and collapsed by its row, so it renders flat.
    if (item)
      return (
        <div
          aria-describedby={errorMessage(errors) ? `${id}:error` : undefined}
          aria-label={label}
          className="grid min-w-0 gap-3 outline-hidden"
          id={id}
          role="group"
          tabIndex={-1}
        >
          {errorMessage(errors) ? (
            <p className={`${fieldErrorClass} text-xs`} id={`${id}:error`} role="alert">
              {errorMessage(errors)}
            </p>
          ) : null}
          {content}
        </div>
      );
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
        {content}
        {Object.hasOwn(definition, "defaultValue") ? (
          <small className="text-muted-foreground">
            Clearing uses the configured default on save.
          </small>
        ) : null}
        {clearProblem ? <small>{clearProblem}</small> : null}
      </Disclosure>
    );
  }
  const { quiet: guidance, visible: bounds } = fieldGuidanceParts(definition);
  // The publication-only note is the Required marker's tooltip unless it explains a problem.
  const quietClass = readOnly || message ? undefined : "sr-only";
  const effectivePlaceholder =
    placeholder ?? ("placeholder" in definition ? definition.placeholder : undefined);
  const counted = definition.type === "text" || definition.type === "textarea";
  const marker = definition.required ? (
    <span
      aria-hidden="true"
      className="ml-1 text-xs text-muted-foreground"
      title="Required for publication only."
    >
      Required
    </span>
  ) : null;
  const Renderer = renderers[definition.type] ?? builtInRenderers[definition.type];
  const describedBy =
    [
      definition.description ? `${id}-description` : undefined,
      guidance ? `${id}-guidance` : undefined,
      bounds ? `${id}-bounds` : undefined,
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
        <div className="flex min-w-0 items-baseline gap-1">
          <label className="text-sm font-medium" htmlFor={id}>
            {label}
          </label>
          {marker}
          {counted ? (
            // In the label row, so the count takes no line of its own.
            <span
              className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums"
              id={`${id}-count`}
            >
              {textLength(typeof value === "string" && !clearedItem ? value : "")} characters
            </span>
          ) : null}
        </div>
      )}
      {definition.description ? (
        <small className="text-xs text-muted-foreground" id={`${id}-description`}>
          {definition.description}
        </small>
      ) : null}
      {guidance ? (
        <small className={cn("text-xs text-muted-foreground", quietClass)} id={`${id}-guidance`}>
          {guidance}
        </small>
      ) : null}
      {bounds ? (
        <small className="text-xs text-muted-foreground" id={`${id}-bounds`}>
          {bounds}
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
/** A list item row: handle, summary or inline control, toggle, and actions menu. */
function ItemRow({
  id,
  label,
  children,
  readOnly,
  disabled,
  collapsible,
  open,
  onToggle,
  onReveal,
  summary,
  problems,
  menu,
}: {
  readonly id: string;
  readonly label: string;
  readonly children: ReactNode;
  readonly readOnly: boolean;
  readonly disabled: boolean;
  /** Group items collapse to a summary; scalar items show their control inline. */
  readonly collapsible: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onReveal: () => void;
  readonly summary: ReactNode;
  readonly problems: boolean;
  readonly menu: ReactNode;
}) {
  const sortable = useSortable({ id, disabled: readOnly || disabled });
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!collapsible || !element) return;
    element.addEventListener(REVEAL_CONTROL_EVENT, onReveal);
    return () => element.removeEventListener(REVEAL_CONTROL_EVENT, onReveal);
  }, [collapsible, onReveal]);
  const bodyId = `${id}-body`;
  return (
    <li
      className="grid min-w-0"
      data-item-id={id}
      ref={(element) => {
        ref.current = element;
        sortable.setNodeRef(element);
      }}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
    >
      <div className="flex min-w-0 items-center gap-2 px-1 py-1.5">
        {!readOnly ? (
          <Button
            aria-label={`Reorder ${label}`}
            className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            data-drag-handle=""
            disabled={disabled}
            size="icon-sm"
            variant="ghost"
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVerticalIcon aria-hidden />
          </Button>
        ) : null}
        {collapsible ? (
          open ? (
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
          ) : (
            // The chevron is the keyboard toggle; clicking the summary is a pointer shortcut.
            <div
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
              onClick={onToggle}
            >
              {summary}
            </div>
          )
        ) : (
          <div className="min-w-0 flex-1">{children}</div>
        )}
        {problems ? (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-destructive">
            <CircleAlertIcon aria-hidden className="size-3.5" />
            Has problems
          </span>
        ) : null}
        {collapsible ? (
          <Button
            aria-controls={bodyId}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
            onClick={onToggle}
            size="icon-sm"
            variant="ghost"
          >
            <Chevron open={open} />
          </Button>
        ) : null}
        {menu}
      </div>
      {collapsible ? (
        <div
          className={cn("grid min-w-0 gap-3 pr-3 pb-3", readOnly ? "pl-3" : "pl-10")}
          data-item-body=""
          hidden={!open}
          id={bodyId}
        >
          {children}
        </div>
      ) : null}
    </li>
  );
}

/** The collapsed summary of a group item, with the leaf preview when one applies. */
function ItemSummaryLine({
  definition,
  value,
  itemLabel,
  position,
}: {
  readonly definition: FieldDefinition;
  readonly value: unknown;
  readonly itemLabel: string | undefined;
  readonly position: number;
}) {
  const { previews } = useCompositeEditing();
  const summary = summarize(definition, value, itemLabel);
  const leaf = previewLeaf(definition, value, previews);
  const Preview = leaf ? previews?.[leaf.definition.type] : undefined;
  const line = (preview: ItemPreview | undefined) => {
    const { primary, secondary } = rowLines(summary, preview);
    return (
      <>
        {preview?.visual ?? (
          <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
            {position}
          </span>
        )}
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-sm" title={primary}>
            {primary.slice(0, 80)}
          </span>
          {secondary ? (
            <span className="truncate text-xs text-muted-foreground" title={secondary}>
              {secondary}
            </span>
          ) : null}
        </span>
        {preview?.indicators?.map((indicator) => (
          <Badge className="shrink-0" key={indicator} variant="warning">
            {indicator}
          </Badge>
        ))}
      </>
    );
  };
  return Preview && leaf && definition.type === "group" ? (
    <Preview definition={leaf.definition} group={{ definition, value }} value={leaf.value}>
      {line}
    </Preview>
  ) : (
    line(undefined)
  );
}

/** The control that receives focus in a row: its menu, or the first visible control, body first. */
function rowFocusTarget(row: HTMLElement | undefined, target: "control" | "menu") {
  if (!row) return undefined;
  if (target === "menu") return row.querySelector<HTMLElement>("[data-item-menu]") ?? undefined;
  const focusable = (root: Element | null) =>
    [
      ...(root?.querySelectorAll<HTMLElement>('input,textarea,[contenteditable="true"],button') ??
        []),
    ].find((element) => !element.closest("[hidden]") && !element.hasAttribute("data-drag-handle"));
  return focusable(row.querySelector("[data-item-body]")) ?? focusable(row);
}

function ListNode(
  props: NodeProps & { readonly definition: Extract<FieldDefinition, { type: "list" }> },
) {
  const { definition, name, fieldKey, value, onChange, onBlur, errors, onErrors } = props;
  const { readOnly, busy, growthProblem, epoch } = useCompositeEditing();
  const list = Array.isArray(value) ? value : [];
  const [ids, setIds] = useState(() => list.map(newItemIdentity));
  // Group items start collapsed; open rows follow their identity through moves.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const lastEpoch = useRef(epoch);
  useLayoutEffect(() => {
    if (lastEpoch.current !== epoch) {
      lastEpoch.current = epoch;
      setIds(list.map(newItemIdentity));
      setOpen(new Set());
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
  const [focus, setFocus] = useState<{ token: string; target: "control" | "menu" }>();
  const setFocusToken = (token: string, target: "control" | "menu" = "control") =>
    setFocus({ token, target });
  const container = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  // Menu actions run after the menu closes, so their focus moves win over the trigger.
  const afterClose = useRef<(() => void) | undefined>(undefined);
  useLayoutEffect(() => {
    if (!focus) return;
    const row = [
      ...(container.current?.querySelectorAll<HTMLElement>("[data-item-id]") ?? []),
    ].find((element) => element.dataset.itemId === focus.token);
    (rowFocusTarget(row, focus.target) ?? addRef.current)?.focus();
    setFocus(undefined);
  }, [focus, tokens]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const label = fieldLabel(fieldKey, definition.label);
  const id = fieldControlId(name as `fields.${string}`);
  const collapsible = definition.item.type === "group";
  const maximum = definition.maxItems ?? MAX_LIST_ITEMS;
  const initial = draftItemValue(definition.item);
  const addProblem =
    list.length >= maximum
      ? `This list allows at most ${maximum} items.`
      : growthProblem(name, [...list, initial ?? fieldStartingValue(definition.item, {})]);
  const createProblem = growthProblem(name, []);
  const clearProblem = growthProblem(name, null);
  const toggle = (token: string, next?: boolean) =>
    setOpen((current) => {
      const copy = new Set(current);
      if (next ?? !copy.has(token)) copy.add(token);
      else copy.delete(token);
      return copy;
    });
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
    toggle(token, true);
    setPending(false);
    setPendingValue(undefined);
    setFocusToken(token);
    setAnnouncement(`Added ${label} item ${list.length + 1}.`);
  };
  const move = (from: number, to: number, target: "control" | "menu" = "control") => {
    if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return;
    change(
      moveItem(list, from, to),
      moveItem(tokens, from, to),
      remapErrors(moveItem(errorItems, from, to)),
    );
    setFocusToken(tokens[from]!, target);
    setAnnouncement(`${label} item moved to position ${to + 1} of ${list.length}.`);
  };
  let pendingProblem: string | undefined = "Enter a value.";
  if (pendingValue !== undefined && pendingValue !== null)
    pendingProblem = fieldProblem(definition.item, pendingValue);
  const guidance = fieldGuidance(definition);
  const present = value !== undefined && value !== null;
  return (
    <div
      aria-describedby={
        [
          definition.description ? `${id}:description` : undefined,
          guidance ? `${id}:guidance` : undefined,
          errorMessage(errors) ? `${id}:error` : undefined,
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
      aria-labelledby={`${id}:label`}
      className="grid min-w-0 gap-2 outline-hidden"
      id={id}
      ref={container}
      role="group"
      tabIndex={-1}
    >
      <p className="sr-only" role="status">
        {announcement}
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-sm font-medium" id={`${id}:label`}>
          {label}
          {definition.required ? (
            <span aria-hidden="true" className="ml-1 text-xs font-normal text-muted-foreground">
              Required
            </span>
          ) : null}
        </span>
        {present ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {list.length} / {maximum}
          </span>
        ) : null}
        {hasProblems(errors) ? (
          <span className="text-xs text-destructive">Has problems</span>
        ) : null}
        <span className="flex-1" />
        {present && !readOnly ? (
          <>
            <Button
              aria-describedby={addProblem ? `${id}:limit` : undefined}
              aria-label={`Add ${label} item`}
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
              <PlusIcon aria-hidden />
              Add
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={`Actions for ${label}`}
                  disabled={busy}
                  size="icon-sm"
                  variant="ghost"
                >
                  <MoreHorizontalIcon aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-w-64">
                <DropdownMenuItem
                  aria-describedby={clearProblem ? `${id}:clear-limit` : undefined}
                  disabled={busy || !!clearProblem}
                  onSelect={() => onChange(undefined)}
                >
                  <EraserIcon aria-hidden />
                  Clear {label}
                </DropdownMenuItem>
                {clearProblem || Object.hasOwn(definition, "defaultValue") ? (
                  <p
                    className="m-0 px-2 py-1 text-xs text-muted-foreground"
                    id={`${id}:clear-limit`}
                  >
                    {clearProblem ?? "Clearing uses the configured default on save."}
                  </p>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
        {guidance ? (
          // The header shows the maximum; the unmet minimum has its own visible note.
          <small
            className={cn(
              "basis-full text-xs text-muted-foreground",
              !readOnly && !hasProblems(errors) && "sr-only",
            )}
            id={`${id}:guidance`}
          >
            {guidance}
          </small>
        ) : null}
      </div>
      {definition.description ? (
        <small className="text-xs text-muted-foreground" id={`${id}:description`}>
          {definition.description}
        </small>
      ) : null}
      {errorMessage(errors) ? (
        <p className={`${fieldErrorClass} text-xs`} id={`${id}:error`} role="alert">
          {errorMessage(errors)}
        </p>
      ) : null}
      {!present ? (
        <>
          <p className="m-0 text-sm text-muted-foreground">
            Not set{definition.required ? " · Required for publication" : ""}
          </p>
          {!readOnly ? (
            <Button
              className="justify-self-start"
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
          {list.length ? (
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
                <ol
                  aria-label={label}
                  className="m-0 grid min-w-0 list-none divide-y divide-border rounded-md border border-border p-0"
                >
                  {list.map((itemValue, index) => {
                    const token = tokens[index]!;
                    const itemName = `${label} item ${index + 1}`;
                    const duplicateProblem =
                      list.length >= maximum
                        ? addProblem
                        : growthProblem(name, duplicateItem(list, index));
                    return (
                      <ItemRow
                        collapsible={collapsible}
                        disabled={busy}
                        id={token}
                        key={token}
                        label={itemName}
                        menu={
                          readOnly ? null : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  aria-label={`Actions for ${itemName}`}
                                  data-item-menu=""
                                  disabled={busy}
                                  size="icon-sm"
                                  variant="ghost"
                                >
                                  <MoreHorizontalIcon aria-hidden />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="max-w-64"
                                onCloseAutoFocus={(event) => {
                                  const action = afterClose.current;
                                  if (action === undefined) return;
                                  afterClose.current = undefined;
                                  event.preventDefault();
                                  action();
                                }}
                              >
                                <DropdownMenuItem
                                  aria-label={`Move up ${itemName}`}
                                  disabled={busy || index === 0}
                                  onSelect={() => {
                                    afterClose.current = () => move(index, index - 1, "menu");
                                  }}
                                >
                                  <ArrowUpIcon aria-hidden />
                                  Move up
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  aria-label={`Move down ${itemName}`}
                                  disabled={busy || index === list.length - 1}
                                  onSelect={() => {
                                    afterClose.current = () => move(index, index + 1, "menu");
                                  }}
                                >
                                  <ArrowDownIcon aria-hidden />
                                  Move down
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  aria-describedby={
                                    duplicateProblem ? `${id}:${token}-limit` : undefined
                                  }
                                  aria-label={`Duplicate ${itemName}`}
                                  disabled={busy || !!duplicateProblem}
                                  onSelect={() => {
                                    afterClose.current = () => {
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
                                      toggle(nextToken, true);
                                      setFocusToken(nextToken);
                                      setAnnouncement(`Duplicated ${itemName}.`);
                                    };
                                  }}
                                >
                                  <CopyIcon aria-hidden />
                                  Duplicate
                                </DropdownMenuItem>
                                {duplicateProblem ? (
                                  <p
                                    className="m-0 px-2 py-1 text-xs text-muted-foreground"
                                    id={`${id}:${token}-limit`}
                                  >
                                    {duplicateProblem}
                                  </p>
                                ) : null}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  aria-label={`Remove ${itemName}`}
                                  disabled={busy}
                                  onSelect={() => {
                                    afterClose.current = () => {
                                      change(
                                        list.filter((_, i) => i !== index),
                                        tokens.filter((_, i) => i !== index),
                                        remapErrors(errorItems.filter((_, i) => i !== index)),
                                      );
                                      // Without a neighbour no row matches, so focus falls back to Add.
                                      setFocusToken(tokens[index + 1] ?? tokens[index - 1] ?? "");
                                      setAnnouncement(`Removed ${itemName}.`);
                                    };
                                  }}
                                  variant="destructive"
                                >
                                  <Trash2Icon aria-hidden />
                                  Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )
                        }
                        onReveal={() => flushSync(() => toggle(token, true))}
                        onToggle={() => toggle(token)}
                        open={open.has(token)}
                        problems={hasProblems(errors?.[index])}
                        readOnly={readOnly}
                        summary={
                          <ItemSummaryLine
                            definition={definition.item}
                            itemLabel={definition.itemLabel}
                            position={index + 1}
                            value={itemValue}
                          />
                        }
                      >
                        <ValueNode
                          definition={definition.item}
                          errors={
                            errors?.[index] !== null && typeof errors?.[index] === "object"
                              ? (errors[index] as Errors)
                              : undefined
                          }
                          fieldKey={itemName}
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
                      </ItemRow>
                    );
                  })}
                </ol>
              </SortableContext>
            </DndContext>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">No items.</p>
          )}
          {pending ? (
            <div className="grid gap-2 rounded-md border border-border p-2">
              <ValueNode
                definition={definition.item}
                fieldKey={`New ${label} item`}
                name={`${name}.new`}
                onBlur={() => {}}
                onChange={setPendingValue}
                value={pendingValue}
              />
              <div className="flex gap-2">
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
            </div>
          ) : null}
        </>
      )}
      {createProblem && !present ? <small>{createProblem}</small> : null}
      {addProblem && present ? (
        <small className="text-xs text-muted-foreground" id={`${id}:limit`}>
          {addProblem}
        </small>
      ) : null}
      {present && list.length < (definition.minItems ?? 0) ? (
        <small className="text-xs text-muted-foreground">
          Add at least {definition.minItems} items for publication only.
        </small>
      ) : null}
    </div>
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
