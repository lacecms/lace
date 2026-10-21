## Context

See proposal.md for motivation. The block editor renders all model and block
data through one recursive renderer,
`apps/admin/src/entities/content/FieldRenderer/FieldRenderer.tsx`:

- `ValueNode` dispatches by descriptor type: `list` goes to `ListNode`,
  `group` goes to a `Disclosure` (a framed fieldset with a "Collapse <label>"
  text button), and leaves go to the registry control with shared chrome
  (label, description, guidance, counter, errors).
- `ListNode` wraps the list in a `Disclosure`. It renders each item through
  `SortableItem` (its own frame, drag handle, and Up/Down/Duplicate/Remove
  text buttons) and renders the item value through `ValueNode` again. A group
  item therefore gets a second framed `Disclosure`.
- `summary()` builds the item title synchronously from values. A media value
  is only an ID, so it yields "Media selected".
- Leaf controls come from `builtInRenderers` (`FieldControls`), overridden
  per type through `FieldRendererProvider` `renderers`. `EntryPage` is the only
  provider and passes `{ media: MediaPicker }` from `widgets/media-library`.
- Block-level alt inheritance (`InheritedAltField` in `BlockCard`) applies
  only to blocks with exactly one media field and an `alt` text field at the
  data root.
- Admin model metadata comes from the runtime configuration projection, which
  preserves declaration order. Only hashes and canonical structure are
  persisted, and hashes use key-sorted canonical JSON.

Dependency direction (`entities` ← `widgets` ← `pages`) has to stay intact:
`entities/content` cannot import the media library.

## Goals / Non-Goals

**Goals:**
- One generic list/row presentation for every list (Gallery, Navigation,
  submenus, custom blocks, model fields), driven only by descriptors.
- A single, typed extension point that lets a higher layer contribute
  item-row previews per leaf type, mirroring how it already contributes leaf
  controls.
- Keep the accessible names and announcements the existing specs and tests
  rely on.

**Non-Goals:**
- No new DSL options (`display`, `preview`, `inheritsFrom`).
- No grid layout, multi-select add, or inheritance of alt or caption
  placeholders in nested groups.
- No change to validation, budgets, saved JSON, API or public output.

## Decisions

### 1. Previews are a second registry next to renderers

`field-types.ts` gains:

```ts
export interface ItemPreview {
  readonly visual?: ReactNode;      // leading slot, e.g. thumbnail
  readonly title?: string;          // e.g. filename
  readonly detail?: string;         // e.g. "JPEG · 675×1200"
  readonly indicators?: readonly string[]; // advisory, e.g. "No alt"
}
export interface FieldPreviewProps {
  readonly definition: FieldDefinition;
  readonly value: unknown;
  /** The enclosing group item, for sibling-aware previews. */
  readonly group:
    | { readonly definition: Extract<FieldDefinition, { type: "group" }>; readonly value: unknown }
    | undefined;
  readonly children: (preview: ItemPreview) => ReactNode;
}
export type FieldPreviewRegistry = Partial<
  Record<FieldDefinition["type"], ComponentType<FieldPreviewProps>>
>;
```

`FieldRendererProvider` accepts an optional `previews` prop, stored in the
same context. A preview is a component with a render prop: it can use hooks
(the media single-item query) and hands back plain parts. `ListNode` keeps
full control of the row layout and accessibility.

Alternatives considered:
- *Preview hooks in the registry.* Rejected. Which leaf previews an item
  changes as values change (media set or cleared), so hook calls would become
  conditional.
- *Preview renders the whole row.* Rejected. Every type would duplicate the
  row layout, menu and accessible names.
- *Extending each `renderers` entry to `{ Control, Preview }`.* Rejected. It
  breaks the existing registry type for every caller and test for no gain.

### 2. Row summary composition

`summary()` is split into a pure `itemSummary(definition, value, itemLabel)`
that returns `{ primary?: string; secondary?: string; mediaSelected: boolean }`
using the existing text priority. The secondary line is the next useful
value from a different field. The row selects the preview leaf: the first
direct child of the group, in `formFieldKeys(fields, layout)` order, with a
registered preview and a present value. It then merges as the spec says:

- with text: primary = text, secondary = `preview.title ?? summary.secondary`;
- without text: primary = `preview.title ?? ("Media selected" | "Empty item")`,
  secondary = `preview.detail`.

The leading slot is `preview.visual`, otherwise the one-based position.
Scalar items do not use summaries: they render their control inline.

### 3. Open state lives in `ListNode`, keyed by item identity

A `Set<token>` of open items sits next to the existing token array. Because
it is keyed by the item identity token, it follows moves and Duplicate gets a
fresh token. It resets to empty when `epoch` changes (load, reload, discard,
conflict reload), so items start collapsed. `insert` and Duplicate add the
new token before setting `focusToken`. The existing `REVEAL_CONTROL_EVENT`
walk opens ancestors. The row element listens for it exactly like `Disclosure`
does today, so validation-summary reveal keeps working. Open state never
enters form values, so dirty comparison and copied JSON are unaffected.

Rejected: an accordion with one open item. It closes items with errors during
reveal and makes multi-item comparison harder, and the mockup does not depend
on it.

### 4. Group-as-item renders flat, standalone groups keep a disclosure

`ValueNode` already receives `item`. For `item && type === "group"` it renders
`FieldLayout` directly, without `Disclosure`. `Disclosure` itself replaces the
text button with an icon `Button` (`ChevronDownIcon`, rotated when open), the
same icon the block card uses. Its `aria-label` keeps "Collapse <label>" /
"Expand <label>", so names stay stable. Lists stop using `Disclosure` and
render a header row: label, `count / max`, Add and a list `DropdownMenu`
(Clear).

### 5. Actions menu uses the shared DropdownMenu

Item actions move into `shared/ui/DropdownMenu` (Radix). Items keep their
current `aria-label`s ("Move up Images item 1", …), so most e2e locators work
after one extra click on the menu trigger, which is named
"Actions for <list> item <n>". A disabled Duplicate shows its limit
explanation as menu-item text and references it through `aria-describedby`.
For Remove and moves, `onCloseAutoFocus` is prevented when `focusToken` is
set, so the existing focus rules win over Radix's return-to-trigger. Drag
stays on the handle. dnd-kit's keyboard sensor is unchanged.

### 6. Stable helper text: counter in the label row, required note as tooltip

The leaf label row becomes a flex row: label and Required marker on the left,
the `N characters` count right-aligned (`ml-auto`). The count keeps its id, so
`aria-describedby` is unchanged. The "Required for publication only." element
stays in the DOM with its id and is `sr-only` unless the field has a problem or
the editor is read-only; the Required marker gets the same text as `title`.
List minimum guidance follows the same rule, plus visible while the list is
below its minimum.

Rejected: revealing helper text with `:focus-within`. The text appears on
mousedown and moves the pressed control before mouseup, so the click is lost
(reproduced with Replace in `media-metadata.e2e.ts`). Leaving focus hides it
again and shifts controls below the pointer. Reserving the space with
`invisible` avoids the shift but gives up the compaction.

### 7. Compact media control and media preview in the media library

`SelectedMedia` drops the card frame: a 56px (`size-14`) thumbnail, filename
plus status badge, facts, alt line, Replace, and a `DropdownMenu` with
Remove. `MediaPicker` keeps the empty state and the dialog. A new
`MediaItemPreview` (`widgets/media-library`) uses the same `useMediaItem` /
detail query to return `{ visual: <MediaThumbnail size-8/>, title: filename,
detail: facts, indicators }`. It adds "No alt" when `group.definition` has
exactly one media field and a text field keyed `alt`, `group.value.alt` is
blank, and the resolved item has no alt text. This is the same shape rule as
the block-level `InheritedAltField`, extracted into one shared helper
(`altOverrideShape(fields)`) in `entities/content`, so both use one
definition of the rule. Missing or unreadable items return
`{ visual: <placeholder icon/> }` and no title, so the row falls back to
"Media selected". `EntryPage` passes `previews={{ media: MediaItemPreview }}`.

### 8. Media-first declaration order

Reorder the `fields` object literals of `builtInBlocks.image` and the
`gallery` item group in `packages/content/src/index.ts`. Hashes use sorted
canonical JSON, and model metadata reaches the admin from the in-memory
projection, which preserves insertion order. A content test asserts both
the key order and hash equality against an alphabetical copy.

## Risks / Trade-offs

- [e2e and unit tests click the visible Up, Down, Duplicate, Remove and
  Collapse buttons] → Keep accessible names identical and add a small e2e
  helper `itemAction(list, n, action)` that opens the menu first. Update the
  affected suites (`composites`, `editor`, `form-layout`,
  `field-guidance`, `rich-text`, `block-order` where used).
- [Collapsed-by-default hides fields that tests type into] → Tests open the
  row first. The validation-summary reveal path is covered by an existing e2e
  scenario that must keep passing unchanged.
- [Radix focus return conflicts with list focus rules] → Prevent
  `onCloseAutoFocus` only when a focus target was set. Unit-test focus after
  Remove (next, previous, Add).
- [Required explanation is less discoverable] → The Required marker stays
  visible with the explanation as its tooltip and accessible description, and
  publication errors already append "Required for publication only."
- [Preview queries per row] → They share the TanStack query key with the
  media field and the library, so a gallery of N items does at most N cached
  single-item reads, the same as today when items are open.
- [The draft video change adds `accept` to media fields] → The compact
  control keeps passing picker props through. Whichever change lands second
  rebases its tasks.

## Migration Plan

Admin-only presentation plus a declaration-order change, with no data,
version or template migration. Rollback means reverting the commit. Existing
drafts and published content are unaffected.
