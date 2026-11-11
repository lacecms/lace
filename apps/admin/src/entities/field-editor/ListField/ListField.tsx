import {
  type ReactNode,
  type ComponentType,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
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
import { MAX_LIST_ITEMS, validateFieldValue } from "@lacecms/content";
import {
  ArrowDownIcon,
  ArrowUpIcon,
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
import { inSentence } from "../create-label.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../shared/ui/DropdownMenu/index.js";
import { cn, REVEAL_CONTROL_EVENT } from "../../../shared/lib/index.js";
import { fieldErrorClass } from "../../../shared/ui/layout/index.js";
import type { FieldDefinition, ItemPreview } from "../field-types.js";
import { useCompositeEditing, useEditorContext } from "../EditorContext/index.js";
import {
  Chevron,
  errorMessage,
  hasProblems,
  type Errors,
  type NodeProps,
} from "../FieldNode/index.js";

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
  const {
    previews,
    services: { itemSummary: summarize, previewLeaf, rowLines },
  } = useCompositeEditing();
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

export function ListField(
  props: NodeProps & {
    readonly definition: Extract<FieldDefinition, { type: "list" }>;
    readonly renderValue: ComponentType<NodeProps>;
  },
) {
  const {
    definition,
    name,
    fieldKey,
    value,
    onChange,
    onBlur,
    errors,
    onErrors,
    renderValue: ValueNode,
  } = props;
  const services = useEditorContext().services;
  // Indicators count only problems the items' rules make reachable; moves keep every error.
  const shownErrors = services.applicableValueErrors(definition, value, errors) as
    | Errors
    | undefined;
  const {
    readOnly,
    busy,
    growthProblem,
    epoch,
    mediaListPicker: MediaListPicker,
  } = useCompositeEditing();
  const list = Array.isArray(value) ? value : [];
  const [ids, setIds] = useState(() => list.map(services.newItemIdentity));
  // Group items start collapsed; open rows follow their identity through moves.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const lastEpoch = useRef(epoch);
  useLayoutEffect(() => {
    if (lastEpoch.current !== epoch) {
      lastEpoch.current = epoch;
      setIds(list.map(services.newItemIdentity));
      setOpen(new Set());
      setPending(false);
    }
  }, [epoch, list]);
  // External reset/normalization can change length. Reorders always update tokens explicitly.
  const tokens = list.map((_, i) => ids[i] ?? services.newItemIdentity());
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
  const label = services.fieldLabel(fieldKey, definition.label);
  const id = services.fieldControlId(name as `fields.${string}`);
  const collapsible = definition.item.type === "group";
  const maximum = definition.maxItems ?? MAX_LIST_ITEMS;
  const initial = services.draftItemValue(definition.item);
  const addProblem =
    list.length >= maximum
      ? `This list allows at most ${maximum} items.`
      : growthProblem(name, [...list, initial ?? services.fieldStartingValue(definition.item, {})]);
  const createProblem = growthProblem(name, []);
  // Eligible media lists add from the picker in multiple mode instead of one starting item.
  const mediaTarget = MediaListPicker ? services.mediaListTarget(definition.item) : undefined;
  // Options of the media field's controller that hide it get their own Add, such as Video.
  const mediaChoices = mediaTarget ? services.mediaListChoices(definition.item, mediaTarget) : [];
  // Kept after closing, so the picker keeps its props while it closes.
  const [picking, setPicking] = useState<{
    readonly capacity: number;
    readonly existingIds: ReadonlySet<string>;
    readonly limitMessage: string;
  }>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickedFocus = useRef<string | undefined>(undefined);
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
  const openPicker = () => {
    if (!mediaTarget) return;
    const { capacity, cause } = services.mediaListCapacity({
      fits: (next) => !growthProblem(name, next),
      item: definition.item,
      list,
      maximum,
      target: mediaTarget,
    });
    if (capacity === 0) return;
    const over = services.mediaListItems(
      definition.item,
      mediaTarget,
      Array(capacity + 1).fill("media"),
    );
    setPicking({
      capacity,
      existingIds: services.mediaIdsInList(mediaTarget, list),
      limitMessage:
        cause === "list"
          ? `${label} allows at most ${maximum} items.`
          : (growthProblem(name, [...list, ...over]) ?? `${label} cannot take more items.`),
    });
    setPickerOpen(true);
  };
  const insertMany = (mediaIds: readonly string[]) => {
    if (!mediaTarget || mediaIds.length === 0) return;
    const values = services.mediaListItems(definition.item, mediaTarget, mediaIds);
    const next = [...list, ...values];
    if (next.length > maximum || growthProblem(name, next)) return;
    const added = values.map(() => services.newItemIdentity());
    // New rows stay collapsed; focus reaches the first one once the picker has closed.
    change(next, [...tokens, ...added], errors);
    setPending(false);
    pickedFocus.current = added[0];
    setAnnouncement(
      values.length === 1
        ? `Added ${label} item ${list.length + 1}.`
        : `Added ${values.length} ${label} items.`,
    );
  };
  const insert = (nextValue: unknown) => {
    if (addProblem || growthProblem(name, [...list, nextValue])) return;
    const token = services.newItemIdentity();
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
      services.moveItem(list, from, to),
      services.moveItem(tokens, from, to),
      remapErrors(services.moveItem(errorItems, from, to)),
    );
    setFocusToken(tokens[from]!, target);
    setAnnouncement(`${label} item moved to position ${to + 1} of ${list.length}.`);
  };
  let pendingProblem: string | undefined = "Enter a value.";
  if (pendingValue !== undefined && pendingValue !== null)
    pendingProblem = services.fieldProblem(definition.item, pendingValue);
  const guidance = services.fieldGuidance(definition);
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
        {hasProblems(shownErrors) ? (
          <span className="text-xs text-destructive">Has problems</span>
        ) : null}
        <span className="flex-1" />
        {present && !readOnly ? (
          <>
            <Button
              aria-describedby={addProblem ? `${id}:limit` : undefined}
              aria-label={`Add ${label} item`}
              {...(mediaTarget ? { "aria-haspopup": "dialog" as const } : {})}
              disabled={busy || !!addProblem}
              onClick={() => {
                if (mediaTarget) openPicker();
                else if (initial !== undefined) insert(initial);
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
            {mediaChoices.map((choice) => (
              <Button
                aria-describedby={addProblem ? `${id}:limit` : undefined}
                aria-label={`Add ${choice.label} item to ${label}`}
                disabled={busy || !!addProblem || !!growthProblem(name, [...list, choice.item])}
                key={choice.value}
                onClick={() => insert(choice.item)}
                size="sm"
                variant="outline"
              >
                <PlusIcon aria-hidden />
                Add {choice.label}
              </Button>
            ))}
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
              !readOnly && !hasProblems(shownErrors) && "sr-only",
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
              Create {inSentence(label)}
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
                        : growthProblem(name, services.duplicateItem(list, index));
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
                                      const nextToken = services.newItemIdentity();
                                      const nextIds = [...tokens];
                                      nextIds.splice(index + 1, 0, nextToken);
                                      const nextErrors = [...errorItems];
                                      nextErrors.splice(index + 1, 0, undefined);
                                      change(
                                        services.duplicateItem(list, index),
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
                        problems={hasProblems(shownErrors?.[index])}
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
          {MediaListPicker && mediaTarget && !readOnly ? (
            <MediaListPicker
              capacity={picking?.capacity ?? 1}
              existingIds={picking?.existingIds ?? new Set()}
              label={label}
              limitMessage={picking?.limitMessage ?? ""}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                const token = pickedFocus.current;
                pickedFocus.current = undefined;
                if (token === undefined) addRef.current?.focus();
                else setFocusToken(token);
              }}
              onConfirm={(mediaIds) => {
                insertMany(mediaIds);
                setPickerOpen(false);
              }}
              onOpenChange={setPickerOpen}
              open={pickerOpen}
            />
          ) : null}
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
                          services.cleanValue(pendingValue, definition.item),
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
