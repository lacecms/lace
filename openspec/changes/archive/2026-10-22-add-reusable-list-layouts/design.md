## Context

See `proposal.md` for motivation and `specs/list-layout/spec.md` for the layout
contract. Inspection found these concrete integration points:

- `packages/content/src/index.ts` defines string-array selects, strict option
  normalization, detached metadata and Gallery v3 with only `lightbox` settings.
- `packages/config/src/index.ts` derives descriptor-aware structural identity;
  presentation exclusions must also agree with application schema-diff behavior.
  Existing placeholder/itemLabel/layout tests establish compatibility patterns.
- `packages/contracts/src/index.ts` validates metadata through shared descriptor
  normalization; `field-openapi.ts` separately documents the recursive shapes.
- Admin `FieldRenderer` composes shared controls for model, block, nested and
  settings fields. `SelectField` lives in `FieldControls`; the same label/help/
  error wrapper and field IDs can serve a card-based select. `FieldLayout` and
  `settingsLayout` already supply grouping without changing value paths.
- `registry/astro/gallery/GalleryBlock.astro` has no authored style or script.
  Starter/reference/existing-site styles own its adaptive grid, 1rem gap and
  4:3 cropped image appearance. The source has established media/link/lightbox hooks.
- CLI `blocks-registry.ts` currently insists on exactly one file with role
  `component`. `blocks-plan.ts` already plans file maps and protects a whole
  item on conflict. Companion delivery needs an intentional validator extension,
  not a new installer or a hidden generated global stylesheet edit.
- Conditional forms are explicitly deferred in `backlog.md`; shipping a
  visibility-only dependency mechanism would conflict with that decision.

This is a cross-package change with migration and installer compatibility, so
design.md is required. LIST1 is an independent selected roadmap session; the
active video change and local site-route edits are outside its scope.

## Goals / Non-Goals

**Goals:**

- Extend the public scalar DSL instead of introducing a layout-valued field or
  composite settings. Adopt the same metadata/control path for custom blocks.
- Make every layout choice understandable through text and geometric diagrams,
  including empty galleries, without loading media or running site code in admin.
- Make structural layout usable immediately after installing Gallery, while
  allowing site CSS to replace every layout decision.
- Verify the shared behavior on a non-Gallery list fixture.

**Non-Goals:**

- General conditions, visibility rules, dependency graphs or mode-dependent
  validation. All three controls stay present and have ordinary scalar rules.
- Theme controls, editor-authored dimensions/breakpoints, image cropping controls,
  new CSS-in-JS infrastructure or automatic layout adoption by every list.
- A new runtime UI package, shared multi-owner registry assets or package release
  publication. Other built-in block versions remain unchanged.

## Decisions

### D1. Extend select presentation with a small data-only diagram

Add optional `presentation: { control: "cards", choices: [...] }` to selects.
Each choice is `{ value, label, description?, diagram?: { cells: [...] } }`.
Rectangle cells use integer `x/y/width/height` in a 12 by 12 canvas. Limit diagrams
to 16 cells and reject overlap, out-of-bounds cells, extra keys and nonportable
values. This is an illustration format only: it does not drive public-site CSS.
Require exactly one metadata entry per option; draw in option order. Both mode
and grid choices supplied by the layout factory have diagrams. Other selects
can use text-only cards. No unused segmented-control API is introduced.

`options` remains the source of truth for values and inference. Labels can evolve
without changing stored keys. Normalize through the same public descriptor path
at configuration and REST-metadata boundaries; reflect the shape in OpenAPI.

An external image URL would add asset hosting, network and safety behavior to a
form hint; arbitrary SVG/HTML would add executable markup. Named Gallery-specific
icons would move domain knowledge into admin. Bounded neutral rectangles avoid
those dependencies while expressing rows, columns, asymmetry and first-item spans.

### D2. Keep presentation out of structural identity at descriptor positions

Strip `presentation` only from actual select descriptors in the canonical
structure and schema-diff comparisons, including nested fields and declared
settings. Keep it in projection identity and metadata. Test unchanged old hashes,
presentation-only sync, forged metadata and content/default keys sharing these
names. Do not indiscriminately strip matching keys from JSON trees.

Option/default changes retain structural behavior. The initial Gallery settings
addition needs a version/migration; later diagram edits do not. Existing sync
baseline guards and no-content-rewrite display updates remain authoritative.

### D3. Export a scalar settings factory with universal names

Export `listLayoutSettings()` from `@lacecms/content`; return fresh/deeply frozen
public descriptors for `layoutMode`, `layoutWrap` and `layoutPreset`. The select
settings have `required: true` as well as defaults, so their cards have no empty
choice. Gallery adopts the map alongside `lightbox`. A custom block can spread
the same map; the helper does not inspect or own a list data field.

One settings instance targets one rendered list. Blocks with multiple independent
list layouts are outside this change; no new nested settings or per-list lifecycle
is implied. Renderers explicitly bind their chosen list to the settings.

Defaults and preset IDs are defined in the list-layout spec. Wrap and preset
descriptions explain applicability. Vertical wrap guidance explicitly requires
site CSS to supply height. Inactive settings are retained, submitted and validated
normally, avoiding hidden unreachable errors and dependency cycles.

Rejected: one opaque preset encoding mode+wrap, which makes direction/wrapping
hard to compose; nested settings, which violate the accepted scalar restriction;
partial `visibleWhen`, which expands into the deferred conditional-forms scope.

### D4. Render generic accessible choice cards

The shared select control selects its presentation using descriptor metadata,
not the block type or a field key. Place the reusable single-selection UI in
admin shared controls; keep schema-to-control adaptation in content entities.
Use one radio group with native radio inputs and labelled card surfaces, wired
to the existing onChange/onBlur/field ID contract. If the existing field props
cannot deliver summary-focus refs, extend them narrowly for both select variants.

Support arrows with end wrapping, Home/End and Space; preserve native Tab order
and an optional "No selection" value. Resolve group focus to selected/first
radio and do not add a competing tab-stop grid. Associate field errors, choice
descriptions and guidance; diagrams are aria-hidden. Viewers see a plain selected
label/description, not disabled mystery thumbnails. Busy states respect existing
fieldset locks. Use the established admin tokens in both themes.

Cards have a small fixed-aspect illustration area, visible label, concise help
and a check/radio indicator. At normal block width the three mode cards fit one
row; presets use an auto-fitting grid with readable cards, becoming one column
when needed. No overflow carousel, photograph preview or panel changes occur.

Gallery uses settingsLayout sections: Layout (the three settings), then Behavior
(lightbox). Anchor/visibility/classes retain their established panel positions;
moving them to a new Advanced disclosure is not part of LIST1.

Conceptual Settings fragment (all controls remain present):

```text
Layout
Arrangement
[ diagram: Horizontal ] [ diagram: Vertical ] [ diagram: Grid * ]
Wrap items [on]              Applies to horizontal/vertical lists.
Grid preset
[ Auto * ] [ Two columns ] [ Three columns ]
[ Four columns ] [ Narrow + wide ] [ Wide + narrow ]
[ Featured first ]           Each card contains a schematic diagram.
                             Applies when Grid is selected.
Behavior
Open full screen [off]
```

### D5. Publish an explicit neutral CSS contract

Gallery adds hooks to existing elements: its section is
`data-lace-layout-container`; its existing items list receives mode/wrap/preset
attributes; each direct li receives `data-lace-layout-item`. No wrapper or
document-order change is needed. Hook values come only from validated settings.
Custom lists can emit the same hooks, use any appropriate HTML tags and import
the same stylesheet.

The companion `ListLayout.css` uses `@layer lace-layout` and `:where(...)` around
entire selectors, including direct-item selectors. Container roots set
`container-type: inline-size` and `container-name: lace-list`; named queries
use each list's nearest marked ancestor, rather than viewport width. Grid uses
minmax(0, fraction) tracks and narrow fallbacks from the spec; auto preserves the
current auto-fill behavior with `min(14rem, 100%)`. Flex items use the preferred
item size as basis, permit shrinking and set a zero intrinsic minimum. Wrap
changes flex-wrap only. Overflow policy and vertical height remain site choices.

Variables on the list are `--lace-list-gap: 0` and
`--lace-list-item-min: 14rem`. Neutral margin/padding/list-style resets are
structural. The CSS must not target images/figures/captions, assign decoration,
set a fixed height or use inline layout properties/important declarations.
Document that a site using its own cascade layers should order its theme layer
after lace-layout; unlayered ordinary site CSS overrides the baseline directly.

Move only the existing site's gallery structural grid rules to the shared layer.
Preserve its theme through an explicit 1rem variable value, figure reset and
4:3 image/object-fit rules in its own stylesheet. Thus default migrated galleries
keep the starter appearance while the reusable baseline imposes no image crop.
Other sites may choose natural image proportions.

Rejected: inline grid styles (harder CSS overrides), injecting site-global styles
into existing user files (unsafe ownership), shipping styled visual components in
a runtime package (contradicts ADR 0006), and sparse visual reordering/masonry
(changes reading order and needs a different behavior contract).

### D6. Install CSS as a guarded registry companion

Keep registry manifest and site-lock schemaVersion 1. Extend file roles to allow
one component plus optional `.css` stylesheet files. Gallery revision 4 includes
`GalleryBlock.astro` and `ListLayout.css`, both targeted under componentsDir;
Gallery statically imports `./ListLayout.css` from its frontmatter. Astro bundles
the CSS when that user-owned source is used; source still has no style/script tag.
No manual global import is needed for fresh installations.

Retain old one-file items. Validate all targets before writes, including
case-insensitive collisions across selected items and escaping/symlink paths.
Block-map generation must choose the file with component role, not assume every
file is a component. CSS is recorded in the existing per-item file/hash map and
uses existing dry-run, diff, `.new`, removal and per-item conflict behavior.
Do not update a component to import a companion that was blocked by a conflict.

Gallery owns this CSS file for LIST1. Reuse by a custom site component requires
importing its installed path, not claiming ownership in another registry item.
General shared assets and new dependency-only registry items are unnecessary now.
Maintained starter/reference/existing-site copies and locks must match the registry.

### D7. Gallery version 4 and image sizing

Keep migrations 2/3 and append identity migration 4; shared settings normalization
fills absent defaults while preserving valid existing values. Keep Gallery data
and lightbox semantics unchanged, including links taking precedence. Registry
revision becomes 4; all other built-in definition versions remain unchanged.

Preserve existing sizes for the default grid/auto combination. Other combinations
use conservative `100vw`, which supports full-width featured items and arbitrary
flex arrangements without pretending to know the site's CSS. This can download
larger variants than necessary; document site-owned sizes tuning. CSS cannot
automatically update a sizes attribute or make a geometric thumbnail an exact
representation of an overridden site design.

## Risks / Trade-offs

- [All settings visible] -> Explicit applicability text and sections preserve the
  generic form contract; full conditional forms remain a separate future change.
- [Vertical wrap surprises] -> No fabricated height; visible guidance and a
  bounded-height browser fixture demonstrate its actual behavior.
- [CSS override diverges from schematic] -> Describe diagrams as compositions,
  not site screenshots; the developer owns mapping and truthful labels.
- [Existing theme overrides force old grid] -> Upgrade guide identifies structural
  rules to remove/move; maintained themes are updated, user files stay protected.
- [Companion conflicts] -> Existing per-item conflict protection, collision tests
  and install/build checks prevent a broken import/lock pair.
- [Container containment changes intrinsic sizing] -> Mark only explicit block
  roots, test narrow/wide custom-list fixtures, document CSS ownership/override.
- [Conservative sizes increases transfer] -> Keep default sizing and document
  per-site tuning; no responsive-image pipeline changes are needed.

## Migration Plan

1. During apply, update architecture sections 8/11/13/17 to document the new
   projection-only hint, Gallery v4 and CSS companion ownership before runtime
   changes. Keep main accepted specs unchanged until explicit sync/archive.
2. Ship compatible content/config/contracts/admin/CLI versions together. Older
   engines reject `presentation`, so projects must upgrade before adopting it.
3. Update installed Gallery sources via `lace add block gallery`; inspect conflicts
   and site-owned grid rules, resolve them manually or through offered `.new` files.
   Deploy the matching site definition and component with CMS config v4, then run
   normal content sync; existing version guards reject mismatched renderers.
4. Sync migrates stale blocks using existing bounded guarded per-entry units on
   both runtimes, preserving content and final published-version/outbox behavior.
   Interruption resumes through normal rerun; never invent a new transaction path.
5. Verify default appearance, all modes, image links/lightboxes, CSS overrides,
   fresh install, conflicting upgrade and repeat-install behavior.

No SQL migration or new endpoint is needed. The ordinary published export already
carries settings. Admin metadata carries diagrams; authored draft/public block
values carry only selected scalars. No new logging/telemetry system is needed:
descriptor paths, synchronization diagnostics and installer diffs cover failures.

Rollback before content sync can restore previous config/components normally.
After migration, the old Gallery definition cannot consume v4 blocks; use the
installation's pre-upgrade content backup with matching older code, or implement
an explicitly reviewed forward migration. Do not claim automatic down-migration
or strip newly authored settings silently.
