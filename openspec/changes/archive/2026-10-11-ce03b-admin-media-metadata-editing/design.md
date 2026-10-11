## Context

See proposal.md for motivation. Current state that shapes the approach:

- CE3A delivered `PATCH /api/v1/admin/media/:mediaId` (`{alt?, caption?,
  focalPoint?}`, `null` clears, at least one key), a required strong
  `If-Match` of `updatedAt` in Unix milliseconds (`entityTagForVersion` /
  `versionFromEntityTag` in `@lacecms/contracts`), the result `{media, build}`
  with `build.status` `queued` or `not-dispatched`, and the stable error
  `MEDIA_UPDATE_CONFLICT` (409). Admin media DTOs already carry `alt`,
  `caption` and `focalPoint`. `apps/admin` has no client method for it yet.
- The details panel (`widgets/media-library/MediaDetailsPanel`) is a Radix
  sheet keyed by item ID. It renders the list item and loads the detail
  (`adminQueryKeys.mediaDetail(id)`) for usage. Deletion lives in
  `features/delete-media` and reports changes through `onChanged`, which the
  library uses to refresh its selected item, then invalidates
  `adminQueryKeys.media`.
- `SelectedMedia` (the media field card) reads the same detail query key, so a
  block card that reads it shares the cache and causes no extra request.
- `FieldRenderer` renders every field through a type-keyed control registry.
  `FieldRendererProps` has no placeholder or notice. `BlockCard` renders a
  block's fields from its portable definition and already watches the block
  data with `useWatch`.
- Built-in `image` is version 1 with `alt: field.text({ required: true })`.
  Under CE1, any change to an allowed block's definition is a `migration`
  change: with stored blocks of that type it is refused unless the block
  version rises and `migrations` cover every step (a missing step is
  `BLOCK_MIGRATION_MISSING`), and sync refuses a structural-hash change
  without a model version increase. The render core
  (`packages/render/src/blocks.ts`) refuses a block whose stored
  `schemaVersion` differs from the site definition (`block_version_mismatch`).
- Registry items record `blockVersion` and `revision`; `tests/block-sources.test.mjs`
  requires the starter, the reference site and the existing-site fixture to
  hold the registry sources byte-identically with matching lock hashes, and
  the registry `blockVersion` to equal the built-in version.

## Goals / Non-Goals

**Goals:**

- Editing alt text, caption and focal point from the details panel with the
  CE3A concurrency contract, no lost updates and no lost typing.
- A focal-point control that is fully operable with a pointer or the keyboard
  and passes the axe checks the admin already runs.
- One media description reused by blocks: the `image` alt becomes an optional
  override with visible inheritance and a non-blocking warning.

**Non-Goals:**

- No public, SDK or render behaviour beyond the `image` component's
  `alt=""` fallback; effective alt text and focal-point rendering are CE3C.
- No caption inheritance into the `image` block caption (the block caption
  stays independent until CE3C defines the public value).
- No autosave, no bulk editing, no metadata history.
- No new field DSL option to mark override fields; inheritance is derived
  from the block's shape (D4).

## Decisions

### D1. `image` version 2 with an identity migration

`builtInBlocks.image` becomes `version: 2`, `alt: field.text()` and
`migrations: { 2: (data) => data }`; its description mentions that the alt
text overrides the media alt. Keeping version 1 and only relaxing `required`
is impossible: CE1 refuses a changed definition of a block that stored
snapshots hold without a version increase and a complete migration chain.
The identity migration passes CE1 planning (the result validates against v2,
references the same media) and sync rewrites only `schema_version` (draft
revisions increase with actor `system:content-sync`, published snapshots in
sync keep pace), then bumps the published version and requests one build.

The roadmap said "needs no data migration". The data is indeed unchanged, but
architecture section 8 and the schema-evolution spec (higher authority)
require the version bump and the declared step, so this change follows them
and corrects the roadmap text.

Consequences handled here: the repository's `lace.config.ts` raises the
version of every model that allows `image` (home 3, about 2, posts 3, notes 2)
so local databases sync; the starter template's `lace.config.ts` keeps its
model versions because a new project has no baseline. The reference site's
`src/fixtures/published-export.json` moves its `image` blocks to
`schemaVersion: 2` because the render core checks it. The upgrade step for
existing projects (raise model versions, run sync, then build the site) is
recorded for CE3C's template upgrade notes.

*Alternatives:* a CE1 extension that lets a version bump made only of
relaxations skip the rewrite. Rejected: it changes the CE1 invariants (render
version check, stale-version rules) for one block. A new `image2` type.
Rejected: duplicates the starter block and leaves user content on the old
type.

### D2. Registry `image` revision 2

`registry/astro/image/item.json` gets `blockVersion: 2`, `revision: 2`, and
`ImageBlock.astro` renders `alt={data.alt ?? ""}` so the attribute is always
present (an omitted `alt` makes screen readers read the file URL). The same
bytes go to the starter template, `apps/site` and
`tests/fixtures/existing-astro-site`, whose `lace.site.json` items record
revision 2 and the new hash. The CLI's bundled registry copy is refreshed by
its build. `lace add block image` in an existing project then reports the
unchanged installed file as updatable and an edited one as a conflict, which
is the existing registry update behaviour. Generated-project snapshot
fixtures are refreshed; the template version does not change in CE3B
because no managed file changes and CE3C bumps it once for CE3.

### D3. Admin client and metadata feature slice

`AdminClient.updateMediaMetadata(mediaId, patch, expectedUpdatedAt)` sends
`PATCH` with `content-type: application/json` and
`If-Match: entityTagForVersion(Date.parse(expectedUpdatedAt))`, and parses
`updateMediaMetadataResultSchema`. The ISO `updatedAt` in the DTO has
millisecond precision, so it maps exactly onto the server tag.

A new slice `apps/admin/src/features/edit-media-metadata` holds:

- `metadata-form.ts`: pure helpers. `metadataValues(item)` →
  `{alt: string, caption: string, focalPoint: {x,y} | null}`;
  `metadataPatch(base, values)` → only differing keys, empty text → `null`,
  focal points compared per coordinate; `stepFocalPoint(point, key, shift)`
  using integer percent arithmetic (`Math.round(v*100) ± 1|10`, clamped,
  divided by 100) so keyboard values are exact two-decimal fractions; and
  `pointerFocalPoint(rect, clientX, clientY)` clamped and rounded to three
  decimals.
- `useMediaMetadataUpdate(onSaved)`: a mutation that calls the client, writes
  the returned media into the detail cache (keeping the cached `usage`),
  invalidates `adminQueryKeys.media`, and calls `onSaved`.
- `MediaMetadataForm`: alt `Input` (`maxLength` 1000), caption `Textarea`
  (`maxLength` 2000), `FocalPointControl`, Save/Discard, the result live
  region, the error alert, the conflict alert, and the missing-alt warning.
  Values are local React state; the form is not part of the entry editor's
  React Hook Form.
- `FocalPointControl` (D5).

The widget `MediaDetailsPanel` renders the form for writers and active items
and a read-only `dl` otherwise. Client-side text checks are limited to the
input `maxLength`; the server's normalisation (trim, control characters) stays
authoritative and its `VALIDATION_FAILED` issues `/alt` and `/caption` are
shown on the matching input.

### D4. Baseline, conflict and close protection

The form keeps `base` (the item version it edits against) and `values`.
`base` is initialised from the detail when loaded, otherwise from the list
item. A background refetch replaces `base` and `values` only while the form is
clean, so a refetch never silently moves the concurrency token under typed
values. On success `base` and `values` become the returned item. On
`MEDIA_UPDATE_CONFLICT` the form refetches the detail, keeps `values`, stores
the newer item as `latest`, and shows an alert with two actions: **Discard my
changes** (`base = values = latest`) and **Save mine anyway** (send the
writer's own patch, computed against the old `base`, with the tag of
`latest`; the form then shows `latest` with those changes applied). Values the
writer did not touch therefore keep the other person's edits. Nothing is
written until the writer chooses. A `latest` copy only replaces `base` when
its `updatedAt` is newer, so a lagging list copy never reverts a saved item.

The panel learns the dirty state through `onDirtyChange`. When the sheet asks
to close (Escape, overlay, close button) while dirty, it opens a small
confirmation dialog (Discard changes / Keep editing) instead of closing;
keep editing returns focus to the panel. Saving disables the inputs and the
close confirmation is skipped once the save succeeds.

Build announcement: `queued` → "Metadata saved. A site build was requested so
published pages use it."; `not-dispatched` → "Metadata saved." The build
history page already lists the `media_metadata` reason.

### D5. Focal-point control

The control wraps the preview `<img>` in an inline relative box sized to the
rendered image (not the panel), so fractions map to the image itself even
with `object-contain` letterboxing. Pointer: `pointerdown` on the box sets the
point, focuses the marker, and captures the pointer; `pointermove` while
captured updates it; `pointerup` releases. The marker is one element with
`role="slider"`, `tabIndex=0`, `aria-label="Focal point"`,
`aria-valuemin=0`, `aria-valuemax=100`, `aria-valuenow` = the horizontal
percentage (centre when unset), and `aria-valuetext` "52% from left, 40%
from top" or "Not set, image centred". This follows the established
two-dimensional picker pattern (one slider with a combined value text) and
satisfies axe's required slider attributes. Arrow keys call
`stepFocalPoint` and `preventDefault` to stop scrolling. An unset point is
drawn as a dashed marker at the centre. **Reset focal point** sets `null`.
Read-only mode renders the marker without handlers and without `tabIndex`
(not exposed as a slider). The preview load and retry states of
`MediaPreview` are reused by extracting its image loading into a shared
`useMediaPreview` hook in `entities/media`.

*Alternatives:* two separate X/Y sliders (rejected: clumsy with the pointer
and unlike every image-editor focal control); a focusable `button` with a
dynamic label (rejected: value changes are not announced as values).

### D6. Inheritance in block cards

`entities/content` gets `mediaAltPair(definition)`: returns the media field
key when the block definition has exactly one `media` field and a field keyed
`alt` of type `text`, otherwise `undefined`. `BlockCard` watches the media
value, reads the item through `useMediaItem(mediaId)` (a thin hook in
`entities/media` over `adminQueryKeys.mediaDetail`, the same query
`SelectedMedia` uses), and passes `placeholder` and `notice` to the `alt`
field's `FieldRenderer`:

- media resolved with alt → `placeholder: "Uses media alt: <alt>"`; the text
  is also rendered in a visually hidden span referenced by the input's
  `aria-describedby`;
- media resolved without alt, block alt empty, editor writable →
  `notice`: a warning paragraph (icon + text, `text-warning-foreground` token, not
  `role="alert"`) referenced by `aria-describedby`.

`FieldRendererProps` gains optional `placeholder`, and `FieldRenderer` gains
optional `placeholder` and `notice` props; the built-in text and textarea
controls apply the placeholder, other controls ignore it. Custom renderers
keep working because both are optional. Because the detail cache is shared
and the metadata update writes the returned media into it, a save in the
media library updates open editors in the same tab.

*Alternative:* hard-code `block.type === "image"`. Rejected: a custom block
with the same shape (for example a gallery item) gets the same behaviour,
and a user block named `image` with another shape would be misread.

### D7. Picker and selected media

`MediaGrid` in `choose` mode renders a second line under the filename: the
alt text (`truncate`, `title` with the full text) or a muted "No alt text".
The library grid (`open` mode) is unchanged. `SelectedMedia` adds the same
line under the facts for active items.

## Risks / Trade-offs

- [Existing projects must bump model versions and sync before building with
  the new packages, or the site build fails with `block_version_mismatch`] →
  recorded for CE3C's upgrade notes; no release happens between CE3B and
  CE3C, and sync's refusal names the model that needs a version increase.
- [The identity migration bumps draft revisions, so an editor open during
  sync gets a revision conflict] → existing CE1 conflict recovery keeps the
  local draft; operators already run sync as a maintenance step.
- [Focal point measured on the admin preview, which is the original image
  scaled down] → fractions are scale-independent; the preview never crops
  (`object-contain` on the image box itself).
- [Media alt read through a per-block detail query] → shares the cache with
  `SelectedMedia`; no additional request per block beyond what the media
  card already makes.
- [Placeholder text is not reliably announced] → the inherited text is also
  in the accessible description.

## Migration Plan

No database migration. Deploy the API and admin from the same build as
usual. In this repository, run `pnpm content:sync` (or the dev stack's sync)
after pulling: it plans the `image` 1 → 2 migration for the bumped models.
Rollback: restore the previous packages and database backup if sync already
migrated blocks; a v1 engine refuses stored version 2 blocks
(`BLOCK_VERSION_AHEAD`).
