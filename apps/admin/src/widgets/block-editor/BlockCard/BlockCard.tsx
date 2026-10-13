import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  GripVerticalIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import { type ComponentProps, useEffect, useId, useRef } from "react";
import { flushSync } from "react-dom";
import { useController, useWatch, type Control } from "react-hook-form";
import { isBlockAnchor } from "@lacecms/content";
import {
  blockLevelProblems,
  FieldRenderer,
  FieldLayout,
  mediaAltPair,
  PUBLICATION_ISSUE_TYPE,
  type DraftEditorValues,
} from "../../../entities/content/index.js";
import { useMediaItem } from "../../../entities/media/index.js";
import { MissingAltWarning } from "../../../features/edit-media-metadata/index.js";
import { cn, REVEAL_CONTROL_EVENT } from "../../../shared/lib/index.js";
import { Badge } from "../../../shared/ui/Badge/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../shared/ui/DropdownMenu/index.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui/Tabs/index.js";
import {
  blockIcon,
  blockLabel,
  blockSummary,
  type BlockDefinitionDto,
} from "../block-presentation.js";
import {
  BlockSettingsPanel,
  BlockSettingsSummary,
  type BlockErrors,
} from "../BlockSettingsPanel/index.js";

/** Which tab of an expanded block card is selected. */
export type BlockTab = "content" | "settings";

type ErrorEntry = { readonly message?: string; readonly type?: string } | undefined;

const HIDDEN_PUBLICATION_NOTE = "This block is hidden, so this does not block publishing.";

/**
 * The message shown on a block control. A problem only publication reports
 * does not apply while the block is hidden, and the control says so.
 */
function controlError(
  error: BlockErrors,
  group: "data" | "settings",
  key: string,
  hidden: boolean,
): string | undefined {
  const entry = (error?.[group] as Readonly<Record<string, ErrorEntry>> | undefined)?.[key];
  if (entry?.message === undefined) return undefined;
  return hidden && entry.type === PUBLICATION_ISSUE_TYPE
    ? `${entry.message} ${HIDDEN_PUBLICATION_NOTE}`
    : entry.message;
}

function hasMessages(
  error: BlockErrors,
  group: "data" | "settings",
  keys: Readonly<Record<string, unknown>>,
): boolean {
  const entries = (error?.[group] ?? {}) as Readonly<Record<string, ErrorEntry>>;
  const has = (value: unknown): boolean =>
    value !== null &&
    typeof value === "object" &&
    (typeof (value as ErrorEntry)?.message === "string" || Object.values(value).some(has));
  return Object.keys(keys).some((key) => has(entries[key]));
}

function TabProblemMarker({ shown }: { readonly shown: boolean }) {
  return shown ? (
    <>
      <CircleAlertIcon aria-hidden className="size-3.5 text-destructive" />
      <span className="sr-only"> (has problems)</span>
    </>
  ) : undefined;
}

/**
 * One block as a sortable card: a header that stays recognizable when
 * collapsed, and the block's fields. Fields stay mounted while collapsed so
 * rich-text and media controls keep their state.
 */
export function BlockCard({
  active,
  busy = false,
  duplicateProblem,
  blockKey,
  collapsed,
  control,
  definition,
  error,
  index,
  linkBase,
  onActivate,
  onDuplicate,
  onMove,
  onRemove,
  onAnnounce,
  onTabChange,
  onToggleCollapsed,
  readOnly = false,
  tab = "content",
  total,
}: {
  readonly active: boolean;
  readonly busy?: boolean;
  readonly duplicateProblem?: string | undefined;
  readonly blockKey: string;
  readonly collapsed: boolean;
  readonly control: Control<DraftEditorValues, unknown, DraftEditorValues>;
  readonly definition: BlockDefinitionDto;
  readonly error: BlockErrors;
  readonly index: number;
  /** The entry's absolute site URL, when the site URL and the entry path are known. */
  readonly linkBase?: string | undefined;
  readonly onActivate: () => void;
  /** Receives a polite status message, such as a block being hidden from the menu. */
  readonly onAnnounce?: (message: string) => void;
  readonly onDuplicate: () => void;
  readonly onMove: (target: number) => void;
  readonly onRemove: () => void;
  readonly onTabChange?: (tab: BlockTab) => void;
  readonly onToggleCollapsed: () => void;
  /** Viewers see the content and a read-only Settings section without tabs. */
  readonly readOnly?: boolean;
  readonly tab?: BlockTab;
  readonly total: number;
}) {
  const id = useId();
  const sortable = useSortable({ id: blockKey, disabled: readOnly || busy });
  // Duplicate and Remove move focus elsewhere. They run once the menu has
  // closed, so its focus trap and focus return cannot take focus back.
  const afterClose = useRef<() => void>(undefined);
  const article = useRef<HTMLElement | null>(null);
  const data = useWatch({ control, name: `blocks.${index}.data` });
  const anchor = useWatch({ control, name: `blocks.${index}.anchor` });
  const className = useWatch({ control, name: `blocks.${index}.className` });
  const hiddenField = useController({ control, name: `blocks.${index}.hidden` }).field;
  const hiddenOnSite = hiddenField.value === true;
  const label = blockLabel(definition);
  const Icon = blockIcon(definition.type);
  // A block with an error stays open so the error is never hidden.
  const hasError = error !== undefined && Object.keys(error).length > 0;
  const bodyHidden = collapsed && !hasError;
  // Problems that belong to no visible control are shown in the card itself.
  const settings = definition.settings ?? {};
  const problems = blockLevelProblems(error, definition.fields, settings);
  const mediaKey = mediaAltPair(definition.fields);
  const contentProblems = hasMessages(error, "data", definition.fields);
  const settingsProblems =
    error?.anchor !== undefined ||
    error?.className !== undefined ||
    hasMessages(error, "settings", settings);
  // The summary asks for a control in the unselected tab; show it before focus moves.
  const tabChange = useRef(onTabChange);
  tabChange.current = onTabChange;
  useEffect(() => {
    const element = article.current;
    if (element === null) return;
    const reveal = (event: Event) => {
      const panel = (event.target as HTMLElement).closest<HTMLElement>("[data-block-tab]");
      const next = panel?.dataset.blockTab;
      if (next !== "content" && next !== "settings") return;
      flushSync(() => tabChange.current?.(next));
    };
    element.addEventListener(REVEAL_CONTROL_EVENT, reveal);
    return () => element.removeEventListener(REVEAL_CONTROL_EVENT, reveal);
  }, []);
  const contentFields = (
    <FieldLayout
      fields={definition.fields}
      layout={definition.layout}
      errors={error?.data}
      hiddenBlock={hiddenOnSite}
      label="Block content"
      renderField={(fieldKey) => {
        const fieldDefinition = definition.fields[fieldKey]!;
        return fieldKey === "alt" && mediaKey !== undefined ? (
          <InheritedAltField
            alt={data?.alt}
            control={control}
            definition={fieldDefinition}
            error={controlError(error, "data", fieldKey, hiddenOnSite)}
            key={fieldKey}
            media={data?.[mediaKey]}
            name={`blocks.${index}.data.${fieldKey}`}
          />
        ) : (
          <FieldRenderer
            control={control}
            definition={fieldDefinition}
            error={controlError(error, "data", fieldKey, hiddenOnSite)}
            fieldKey={fieldKey}
            key={fieldKey}
            name={`blocks.${index}.data.${fieldKey}`}
          />
        );
      }}
    />
  );
  return (
    <article
      aria-describedby={problems.length === 0 ? undefined : `${id}-problems`}
      aria-labelledby={hiddenOnSite ? `${id}-title ${id}-hidden` : `${id}-title`}
      className={cn(
        "grid gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-xs transition-[border-color,box-shadow] duration-(--duration-fast) ease-standard outline-hidden",
        hiddenOnSite && "border-dashed bg-muted/40",
        active && "border-primary ring-2 ring-ring/30",
        hasError && "border-destructive",
        sortable.isDragging && "relative z-10 shadow-md",
      )}
      data-invalid={hasError ? "true" : undefined}
      data-active={active ? "true" : undefined}
      data-block-key={blockKey}
      onFocusCapture={onActivate}
      onPointerDownCapture={onActivate}
      ref={(element) => {
        article.current = element;
        sortable.setNodeRef(element);
      }}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      tabIndex={-1}
    >
      <header className="flex min-w-0 items-center gap-2">
        {!readOnly ? (
          <Button
            disabled={busy}
            aria-label={`Reorder ${label} block`}
            className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            size="icon-sm"
            variant="ghost"
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVerticalIcon aria-hidden />
          </Button>
        ) : null}
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="grid min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="m-0 truncate text-sm font-semibold" id={`${id}-title`}>
              {label}
            </h3>
            {hiddenOnSite ? (
              <Badge id={`${id}-hidden`} variant="outline">
                <EyeOffIcon aria-hidden />
                Hidden
              </Badge>
            ) : undefined}
          </div>
          <p className="m-0 flex min-w-0 gap-2 text-xs text-muted-foreground">
            <span className="truncate">{blockSummary(definition, data)}</span>
            {isBlockAnchor(anchor) ? (
              <span className="shrink-0 font-mono">{`#${anchor}`}</span>
            ) : undefined}
          </p>
        </div>
        {hasError ? (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-destructive">
            <CircleAlertIcon aria-hidden className="size-3.5" />
            Has problems
          </span>
        ) : (
          <Button
            aria-controls={`${id}-fields`}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${label} block`}
            onClick={onToggleCollapsed}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronDownIcon
              aria-hidden
              className={cn(
                "transition-transform duration-(--duration-fast) ease-standard",
                collapsed && "-rotate-90",
              )}
            />
          </Button>
        )}
        {!readOnly ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                disabled={busy}
                aria-label={`Actions for ${label} block`}
                size="icon-sm"
                variant="ghost"
              >
                <MoreHorizontalIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(event) => {
                const action = afterClose.current;
                if (action === undefined) return;
                afterClose.current = undefined;
                event.preventDefault();
                action();
              }}
            >
              <DropdownMenuItem disabled={busy || index === 0} onSelect={() => onMove(index - 1)}>
                <ArrowUpIcon aria-hidden />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={busy || index === total - 1}
                onSelect={() => onMove(index + 1)}
              >
                <ArrowDownIcon aria-hidden />
                Move down
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={busy || !!duplicateProblem}
                title={duplicateProblem}
                onSelect={() => {
                  afterClose.current = onDuplicate;
                }}
              >
                <CopyIcon aria-hidden />
                Duplicate
              </DropdownMenuItem>
              {readOnly ? undefined : (
                <DropdownMenuItem
                  disabled={busy}
                  onSelect={() => {
                    if (busy || readOnly) return;
                    hiddenField.onChange(!hiddenOnSite);
                    onAnnounce?.(
                      `${label} block ${index + 1} ${hiddenOnSite ? "shown on" : "hidden from"} the site.`,
                    );
                  }}
                >
                  {hiddenOnSite ? <EyeIcon aria-hidden /> : <EyeOffIcon aria-hidden />}
                  {hiddenOnSite ? "Show block" : "Hide block"}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={busy}
                onSelect={() => {
                  afterClose.current = onRemove;
                }}
                variant="destructive"
              >
                <Trash2Icon aria-hidden />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>
      {problems.length === 0 ? undefined : (
        <div id={`${id}-problems`} role="alert">
          <ul className="m-0 grid list-none gap-1 p-0 text-xs text-destructive">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-3" hidden={bodyHidden} id={`${id}-fields`}>
        {readOnly ? (
          <>
            {contentFields}
            <BlockSettingsSummary
              anchor={anchor}
              className={className}
              control={control}
              definition={definition}
              hidden={hiddenOnSite}
              index={index}
            />
          </>
        ) : (
          <Tabs onValueChange={(next) => onTabChange?.(next as BlockTab)} value={tab}>
            <TabsList aria-label={`${label} block sections`}>
              <TabsTrigger value="content">
                Content
                <TabProblemMarker shown={contentProblems} />
              </TabsTrigger>
              <TabsTrigger value="settings">
                Settings
                <TabProblemMarker shown={settingsProblems} />
              </TabsTrigger>
            </TabsList>
            {/* Both panels stay mounted so rich-text and media controls keep their state.
                They hold focusable controls, so the panels themselves are not tab stops. */}
            <TabsContent
              className="grid gap-3 outline-hidden"
              data-block-tab="content"
              forceMount
              hidden={tab !== "content"}
              tabIndex={-1}
              value="content"
            >
              {contentFields}
              {Object.keys(definition.fields).length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">
                  This block has no content fields.
                </p>
              ) : undefined}
            </TabsContent>
            <TabsContent
              className="outline-hidden"
              data-block-tab="settings"
              forceMount
              hidden={tab !== "settings"}
              tabIndex={-1}
              value="settings"
            >
              <fieldset className="min-w-0 border-0 p-0" disabled={busy}>
                <BlockSettingsPanel
                  control={control}
                  definition={definition}
                  error={error}
                  index={index}
                  linkBase={linkBase}
                  settingsError={(key) => controlError(error, "settings", key, hiddenOnSite)}
                />
              </fieldset>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </article>
  );
}

/**
 * The `alt` field of a block whose alt text overrides its media item's: the
 * inherited text as placeholder, or a warning when neither the block nor the
 * media item has alt text. Neither is shown while the item is unresolved.
 */
function InheritedAltField({
  alt,
  media,
  ...field
}: Omit<ComponentProps<typeof FieldRenderer>, "fieldKey" | "notice" | "placeholder"> & {
  readonly alt: unknown;
  readonly media: unknown;
}) {
  const item = useMediaItem(typeof media === "string" ? media : undefined).data;
  const inherited = item?.alt;
  const missing =
    item !== undefined && inherited === undefined && (typeof alt !== "string" || alt.trim() === "");
  return (
    <FieldRenderer
      {...field}
      fieldKey="alt"
      notice={
        missing ? (
          <MissingAltWarning>
            This image has no alt text and will be presented as decorative. Add alt text here or to
            the media item.
          </MissingAltWarning>
        ) : undefined
      }
      placeholder={inherited === undefined ? undefined : `Uses media alt: ${inherited}`}
    />
  );
}
