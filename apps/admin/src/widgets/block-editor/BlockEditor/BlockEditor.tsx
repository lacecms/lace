import type { ContentBlockDto, ContentModelDto } from "@lacecms/contracts";
import {
  DndContext,
  type Announcements,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFieldArray, type Control, type UseFormGetValues } from "react-hook-form";
import { ulid } from "ulid";
import { BLOCK_MESSAGES, type DraftEditorValues } from "../../../entities/content/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { fieldErrorClass } from "../../../shared/ui/layout/index.js";
import { AddBlockMenu } from "../AddBlockMenu/index.js";
import { BlockCard, type BlockTab } from "../BlockCard/index.js";
import { RemovedBlockNotice } from "../RemovedBlockNotice/index.js";
import { blockLabel, defaultSettings, type BlockDefinitionDto } from "../block-presentation.js";

interface RemovedBlock {
  readonly block: ContentBlockDto;
  readonly index: number;
  readonly label: string;
}

/**
 * Authors the ordered block list. Structural actions (insert, duplicate,
 * move, remove) keep stable keys, and each one makes an earlier removal final.
 */
export function BlockEditor({
  control,
  errors,
  getValues,
  linkBase,
  model,
  readOnly = false,
}: {
  readonly control: Control<DraftEditorValues, unknown, DraftEditorValues>;
  /** Per-block errors by index, plus `root` for the block list as a whole. */
  readonly errors: Record<string, Record<string, unknown>> | undefined;
  readonly getValues: UseFormGetValues<DraftEditorValues>;
  /** The entry's absolute site URL, when the site URL and the entry path are known. */
  readonly linkBase?: string | undefined;
  readonly model: ContentModelDto;
  /** Viewers see each block's settings read only, without tabs. */
  readonly readOnly?: boolean;
}) {
  const { fields, insert, move, remove } = useFieldArray({
    control,
    name: "blocks",
    keyName: "formId",
  });
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  // Tab selection is kept by block key so it survives reorders and saves.
  const [tabs, setTabs] = useState<ReadonlyMap<string, BlockTab>>(() => new Map());
  const [announcement, setAnnouncement] = useState("");
  const [activeKey, setActiveKey] = useState<string>();
  const [focusKey, setFocusKey] = useState<string>();
  const [removed, setRemoved] = useState<RemovedBlock>();
  const list = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const definitions = model.blockDefinitions ?? [];
  const listError = errors?.root?.message as string | undefined;
  // Screen-reader announcements name blocks by label and position, never by key.
  const describe = (id: string | number, overId?: string | number) => {
    const index = fields.findIndex((block) => block.key === id);
    const target = overId === undefined ? index : fields.findIndex((block) => block.key === overId);
    const definition = definitions.find((item) => item.type === fields[index]?.type);
    const label = definition === undefined ? "Block" : `${blockLabel(definition)} block`;
    return { label, position: `position ${target + 1} of ${fields.length}` };
  };
  const announcements: Announcements = {
    onDragCancel: ({ active }) => {
      const { label, position } = describe(active.id);
      return `Reordering cancelled. ${label} returned to ${position}.`;
    },
    onDragEnd: ({ active, over }) => {
      const { label, position } = describe(active.id, over?.id ?? active.id);
      return `${label} dropped at ${position}.`;
    },
    onDragOver: ({ active, over }) => {
      if (over === null) return undefined;
      const { label, position } = describe(active.id, over.id);
      return `${label} moved to ${position}.`;
    },
    onDragStart: ({ active }) => {
      const { label, position } = describe(active.id);
      return `Picked up ${label} at ${position}.`;
    },
  };

  useEffect(() => {
    if (focusKey === undefined) return;
    const card = [...(list.current?.querySelectorAll<HTMLElement>("[data-block-key]") ?? [])].find(
      (element) => element.dataset.blockKey === focusKey,
    );
    if (card === undefined) return;
    card.focus();
    card.scrollIntoView({ block: "nearest" });
    setFocusKey(undefined);
  }, [fields, focusKey]);

  const reveal = (key: string) => {
    setActiveKey(key);
    setFocusKey(key);
    setCollapsed((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };
  const insertBlock = (index: number, block: ContentBlockDto) => {
    setRemoved(undefined);
    insert(index, block, { shouldFocus: false });
    reveal(block.key);
  };
  const insertDefinition = (index: number, definition: BlockDefinitionDto) =>
    insertBlock(index, {
      anchor: "",
      className: "",
      data: structuredClone(definition.defaultValue ?? {}) as ContentBlockDto["data"],
      hidden: false,
      key: ulid(),
      position: Math.max(0, ...fields.map((block) => block.position)) + 1_024,
      schemaVersion: definition.version,
      settings: defaultSettings(definition),
      type: definition.type,
    });
  const duplicate = (index: number) => {
    // An anchor is unique within the entry, so the copy starts without one.
    insertBlock(index + 1, {
      ...structuredClone(getValues(`blocks.${index}`)),
      anchor: "",
      key: ulid(),
      position: Math.max(0, ...fields.map((item) => item.position)) + 1_024,
    });
  };
  const moveBlock = (from: number, to: number) => {
    if (to < 0 || to >= fields.length || from === to) return;
    setRemoved(undefined);
    move(from, to);
  };
  const removeBlock = (index: number, definition: BlockDefinitionDto) => {
    const block = structuredClone(getValues(`blocks.${index}`));
    remove(index);
    setRemoved({ block, index, label: blockLabel(definition) });
  };
  const undo = () => {
    if (removed === undefined) return;
    insertBlock(Math.min(removed.index, fields.length), removed.block);
  };
  const dismiss = () => {
    setRemoved(undefined);
    addButton.current?.focus();
  };

  const notice =
    removed === undefined ? undefined : (
      <RemovedBlockNotice
        key={removed.block.key}
        label={removed.label}
        onDismiss={dismiss}
        onUndo={undo}
      />
    );
  const items: ReactNode[] = [];
  fields.forEach((block, index) => {
    if (index > 0 && definitions.length > 0) {
      items.push(
        <div
          className="group relative flex h-5 items-center justify-center"
          key={`insert-${block.formId}`}
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-px bg-border opacity-0 transition-opacity duration-(--duration-fast) ease-standard group-focus-within:opacity-100 group-hover:opacity-100"
          />
          <AddBlockMenu
            definitions={definitions}
            onChoose={(definition) => insertDefinition(index, definition)}
          >
            <Button
              aria-label={`Insert block at position ${index + 1}`}
              className="relative size-5 rounded-full border border-border bg-background opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
              size="icon-xs"
              variant="ghost"
            >
              <PlusIcon aria-hidden />
            </Button>
          </AddBlockMenu>
        </div>,
      );
    }
    if (removed?.index === index) items.push(notice);
    // A block whose type the model no longer allows still renders, with its
    // error, so the writer can see why Save is blocked and remove it.
    const allowed = definitions.find((item) => item.type === block.type);
    const definition: BlockDefinitionDto = allowed ?? {
      fields: {},
      type: block.type,
      version: block.schemaVersion,
    };
    const error =
      errors?.[index] ??
      (allowed === undefined ? { type: { message: BLOCK_MESSAGES.typeNotAllowed } } : undefined);
    items.push(
      <BlockCard
        active={activeKey === block.key}
        blockKey={block.key}
        collapsed={collapsed.has(block.key)}
        control={control}
        definition={definition}
        error={error}
        index={index}
        key={block.formId}
        linkBase={linkBase}
        onActivate={() => setActiveKey(block.key)}
        onAnnounce={setAnnouncement}
        onDuplicate={() => duplicate(index)}
        onMove={(target) => moveBlock(index, target)}
        onRemove={() => removeBlock(index, definition)}
        onTabChange={(tab) => setTabs((current) => new Map(current).set(block.key, tab))}
        onToggleCollapsed={() =>
          setCollapsed((current) => {
            const next = new Set(current);
            if (next.has(block.key)) next.delete(block.key);
            else next.add(block.key);
            return next;
          })
        }
        readOnly={readOnly}
        tab={tabs.get(block.key) ?? "content"}
        total={fields.length}
      />,
    );
  });
  if (removed !== undefined && removed.index >= fields.length) items.push(notice);

  return (
    <section aria-labelledby="blocks-title" className="mt-6 grid gap-3">
      <h2 className="m-0 text-lg font-semibold outline-hidden" id="blocks-title" tabIndex={-1}>
        Blocks
      </h2>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {listError === undefined ? undefined : (
        <p className={`${fieldErrorClass} text-xs`} role="alert">
          {listError}
        </p>
      )}
      {definitions.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">This model does not allow blocks.</p>
      ) : undefined}
      <DndContext
        accessibility={{ announcements }}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (over === null || active.id === over.id) return;
          const from = fields.findIndex((block) => block.key === active.id);
          const to = fields.findIndex((block) => block.key === over.id);
          if (from >= 0 && to >= 0) moveBlock(from, to);
        }}
        sensors={sensors}
      >
        <SortableContext
          items={fields.map((block) => block.key)}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-1" ref={list}>
            {items}
          </div>
        </SortableContext>
      </DndContext>
      {definitions.length === 0 ? undefined : (
        <div className="grid justify-items-start gap-2">
          {fields.length === 0 && removed === undefined ? (
            <p className="m-0 text-sm text-muted-foreground">No blocks yet.</p>
          ) : undefined}
          <AddBlockMenu
            definitions={definitions}
            onChoose={(definition) => insertDefinition(fields.length, definition)}
          >
            <Button ref={addButton} variant="outline">
              <PlusIcon aria-hidden />
              Add block
            </Button>
          </AddBlockMenu>
        </div>
      )}
    </section>
  );
}
