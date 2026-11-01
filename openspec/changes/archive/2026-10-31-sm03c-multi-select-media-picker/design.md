## Context

See proposal.md for motivation. Current admin structure that shapes the
approach:

- `widgets/media-library/MediaPickerDialog` is a Radix `Dialog` whose body
  (`PickerBody`) mounts only while open. It owns the local query state, the
  infinite media list (`adminQueryKeys.mediaList`), the toolbar, the drop zone
  and an upload queue (`useMediaUploads`), and renders `MediaGrid` in
  `mode="choose"`. Choosing calls `onChoose(item)`; the caller closes it.
- `MediaGrid` renders one `<button>` per tile; `choose` mode marks the current
  item with `aria-current` and a check, and describes each tile by its alt
  text.
- `UploadQueue` (`features/upload-media`) shows a Use action on confirmed rows
  when given `onChoose`. `useMediaUploads` keeps an ordered array of entries
  whose `state` becomes `uploaded` with the `item` DTO on confirmation.
- `entities/content/FieldRenderer` renders every list through `ListNode`. Its
  header Add inserts `draftItemValue(definition.item)` (declared default or
  draft-valid starting value) or opens an inline pending scalar editor. The
  list header shows `count / maximum`; `addProblem` combines the list maximum
  with `growthProblem(name, candidate)`, which runs `snapshotBudget` over the
  whole prospective form (model fields plus all block data, hidden blocks
  included) against `MAX_SNAPSHOT_LIST_ITEMS = 500`.
- Entities may not import widgets. Media-aware controls reach the generic
  renderer through `FieldRendererProvider` registries (`renderers`,
  `previews`) supplied by `pages/entry/EntryPage`, the only provider call
  site (entries, pages and globals).

## Goals / Non-Goals

**Goals:**

- One picker implementation for both modes, so filters, tag filter, paging,
  uploads and states stay identical.
- Eligibility, item construction and capacity as pure, unit-tested helpers in
  `entities/content`, independent of React and of the media widget.
- No new dependency, no API or contract change, no extra network requests
  beyond what the rows already perform.

**Non-Goals:**

- Seeding the media detail cache from picker DTOs. Each appended row's
  preview performs its usual single-item read, exactly as when a draft with
  that many items loads.
- A general "bulk add" extension point for other field types.

## Decisions

### D1. Extend `MediaPickerDialog` with a discriminated `selection` prop

`MediaPickerDialog` keeps its single-mode props and gains an optional
`selection` object; when present the dialog is in multiple mode:

```ts
interface MediaPickerSelection {
  readonly targetLabel: string;            // "Images"
  readonly capacity: number;               // ≥ 1
  readonly limitMessage: string;           // cause named by the editor
  readonly existingIds: ReadonlySet<string>;
  readonly onConfirm: (items: readonly MediaMetadataDto[]) => void;
}
```

`currentId`/`onChoose` are not used in multiple mode (typed as a union so a
caller cannot pass both). `PickerBody` holds the selection as an ordered
array of `MediaMetadataDto` plus a derived `Map<id, position>`; it is local
state and therefore empty on every opening, because the body unmounts on
close. The footer (status, Clear selection, Cancel, "Add N images") renders
outside the scrolling body so it stays visible.

*Alternative rejected:* a separate `MediaMultiPickerDialog`. It would
duplicate the query, toolbar, upload and state handling that SM3B just
aligned between library and picker.

### D2. `MediaGrid` gains a `select` mode

`mode="select"` renders tiles as `aria-pressed` toggle buttons with the
filename as name, alt text and notes in `aria-describedby`, a check and the
one-based position badge when selected, and an "Already in <target>" note for
`existingIds`. At capacity, unselected tiles get `aria-disabled="true"`, stay
in tab order, ignore activation and are described by the limit message. A
native `disabled` attribute is avoided so keyboard users can still reach and
hear why. Enter and Space both toggle (native button behavior); focus stays
on the tile.

### D3. Uploads join the selection by observing the queue

`PickerBody` keeps a ref of upload keys already seen as `uploaded`. An effect
over `uploads.uploads` appends each newly uploaded entry's `item` to the
selection while capacity remains and records keys that did not fit, so their
rows can say "Selection limit reached". Confirmations batched into one render
are taken in queue order. `UploadQueue` gains an optional `selection` prop
(`isSelected(item)`, `onToggle(item)`, `blockedReason(item)`), rendering a
pressed "Select <filename>" toggle instead of Use. `useMediaUploads` itself is
unchanged.

*Alternative rejected:* an `onUploaded` callback in `useMediaUploads`. It
fires inside a promise continuation, which would need extra care for
unmounted dialogs; observing state keeps the hook untouched and the logic in
the one consumer that needs it.

### D4. Eligibility and item values as pure helpers in `entities/content`

New `media-list.ts`:

- `mediaListTarget(item: FieldDefinition): { key?: string } | undefined` —
  `{}` for a `media` item; `{ key }` for a `group` whose direct fields hold
  exactly one `media` field and it is `required`; otherwise `undefined`.
- `mediaListItems(item, target, ids)` — for scalar targets the ids; for group
  targets `structuredClone` of `draftItemValue(item)` (falling back to
  `fieldStartingValue(item, {})`, as Add does today) with `[key] = id`.
- `mediaIdsInList(target, list)` — the string media values of current items,
  for `existingIds`.
- `mediaListCapacity(list, maximum, item, target, fits)` — increments `k`
  from 1 to `maximum − list.length`, asking `fits([...list, ...items(k)])`
  (the existing `growthProblem` closure) and returns `{ capacity, cause }`
  where `cause` is `"list"` when `k` reached the remaining maximum, else
  `"budget"`. A placeholder identifier stands in for media while measuring;
  `snapshotBudget` counts list lengths, not media values.

Capacity is computed only when Add is activated, not on every render: at most
100 budget walks over the form, each linear in the draft. The dialog is modal,
so the list cannot change while it is open and the computed capacity stays
valid until confirmation.

### D5. A `mediaListPicker` slot in `FieldRendererProvider`

`FieldRendererProvider` gains an optional
`mediaListPicker?: ComponentType<MediaListPickerProps>` in its context, where
`MediaListPickerProps` (declared in `entities/content/field-types.ts`) is
`{ open, onOpenChange, label, capacity, limitMessage, existingIds, onConfirm(ids), onCloseAutoFocus }`.
`widgets/media-library` exports `MediaListPicker`, a thin adapter rendering
`MediaPickerDialog` with `selection`; `EntryPage` passes it next to
`renderers` and `previews`. `ListNode` treats a list as eligible only when
`mediaListTarget` matches **and** the slot is provided; without it (unit
harnesses, future contexts without media) Add keeps today's behavior. This
preserves the entities → widgets dependency direction checked by
`scripts/check-boundaries.mjs`.

*Alternative rejected:* importing the picker into `entities/content` or
moving `ListNode` to a widget; both break the layer rules.

### D6. Bulk insert in `ListNode`

`insertMany(values)` performs one `change([...list, ...values],
[...tokens, ...newTokens], errors)`, leaves `open` untouched (new rows start
collapsed), sets focus to the first new token with target `control`
(`rowFocusTarget` skips the hidden body, so a collapsed group row focuses its
toggle and a scalar media row its Replace action) and announces "Added N
<label> items." (one item keeps "Added <label> item <position>."). It re-runs
`growthProblem` on the final array and appends nothing if it fails, as a
guard. Cancel returns focus to Add through `onCloseAutoFocus`; confirm
prevents that default so the row focus wins.

The limit messages come from the editor: the list cause reuses the existing
"<Label> allows at most <max> items." wording, the budget cause the existing
entry-wide sentence from `snapshotBudget`.

## Risks / Trade-offs

- [Many appended rows trigger one detail read each] → Same cost as loading a
  saved gallery of that size; reads are cached by React Query and shared with
  other media controls. Seeding is a non-goal because the detail DTO also
  carries usage the picker list does not have.
- [Capacity loop cost on large drafts] → Bounded by 100 iterations and run
  only on Add; measured in a unit test with a 500-element draft. If profiling
  shows a problem, a single-pass cost-per-item calculation can replace the
  loop without spec change.
- [A selected item is deleted by someone else before confirmation] → The row
  shows the existing "no longer exists" state after appending and the server
  rejects publication as today; no special handling.
- [Concurrent uploads confirmed in one render lose strict completion order] →
  Queue order is used, which is the order the user dropped them; acceptable
  and documented in the design only.
- [Behavior change for the gallery's Add] → Writers no longer get an empty
  gallery item; an empty item was never publishable (media is required), so
  no valid workflow is lost. Duplicate still inserts a copy.

## Migration Plan

Admin-only release. No data, API or template migration; rollback is a revert
of the admin bundle.
