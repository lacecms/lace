## Context

See proposal.md for motivation and the five delta specs for behavior. Existing model inputs and projections live in `packages/config/src/index.ts`; group/block metadata and normalization live in `packages/content/src/index.ts`; REST metadata uses strict Valibot schemas in `packages/contracts/src/index.ts`. There is no form layout option today.

`FieldRenderer.tsx` recursively renders groups and list items, retains collapsed descendants and stable item identities, and listens to the bubbling `REVEAL_CONTROL_EVENT`. EntryPage, BlockCard and BlockSettingsPanel currently enumerate field maps directly. Existing block tabs and SEO must remain intact. The entry editor already has explicit opt-in slug suggestions; `suggestSlug` uses NFKD/ASCII filtering but truncation can leave a trailing hyphen. CreateEntryDialog currently accepts only title and calls `createEntry(modelKey, title)`, although the shared create contract already accepts slug.

## Goals / Non-Goals

**Goals:** One portable layout grammar and renderer at every field-map boundary; deterministic reference validation and hashes; no content/state loss; immediate slug suggestions while creating a collection draft.

**Non-Goals:** Conditional validation/visibility, arbitrary layout trees or columns, arranging system controls, list-level layout around item indices, persistent UI preferences, transliteration and uniqueness services. No new library is needed.

## Decisions

### 1. Layout belongs to the owner of a sibling field map

Use `layout: { mode: "tabs" | "sections", groups: [{ key, label, description?, fields }] }` on model definitions, group descriptors and block definitions (data). Blocks additionally accept `settingsLayout` against their settings. Sections/tabs cannot recursively contain layout groups; recursion comes from actual group fields, including list-item groups. This avoids inventing paths or changing CE7 nesting bounds. Unlisted fields follow the layout outside its tablist/sections, so partial adoption cannot hide content.

Content exports shared portable types and shape/reference normalization; generic input types restrict references to immediate field keys for models, blocks, settings and groups. Validate options at runtime as well as in type tests; reject empty or ambiguous groups, unknown keys, invalid modes and unsupported placements. Use existing field-key grammar for group identity, trimmed nonempty labels and string descriptions. No arbitrary numeric caps are introduced: entries reference a finite field map and each field can appear once. Normalize/detach/freeze arrays like other metadata. Config imports the content normalizer; contracts reuse portable metadata semantics without importing config or infrastructure.

Rejected: embedding per-field tab labels (cannot express stable section identity/order clearly), absolute JSON paths (ambiguous across list items), layout-generated objects (changes stored values), and exhaustive membership (unnecessarily prevents incremental adoption).

### 2. Strip presentation only at known metadata positions

Extend descriptor-aware structural canonicalization for group layout, model layout and block layout/settingsLayout. Projection hashes and DTOs include layouts; structural baselines exclude them. Preserve identically named content/default keys and pinned no-layout hashes, including legacy-hash compatibility paths. Existing projection-only synchronization owns atomic identity writes; verify SQLite/D1 unchanged snapshots, media and revisions, with one atomic published-version advance and a created/coalesced build request rather than adding a persistence mechanism. No DDL or runtime-specific code is required.

### 3. Share field-map composition while retaining field identity

Add an entity-level form layout component/export through the content slice. It receives fields/layout and a callback rendering existing FieldRenderer/ValueNode nodes with their original names and stable keys. Use it at EntryPage's model fields, BlockCard's data, BlockSettingsPanel's declared settings and ValueNode's group children. Lists keep their current stable item identities and call the group composition for each item. Preserve existing annotations, errors, inherited media/SEO guidance and controls.

Use the existing shared Tabs primitive/keyboard model, force-mounted panels hidden from focus/accessibility when inactive, min-width safeguards and a scrollable tab strip at narrow widths. Sections use labelled headings/regions. Group/item/tab state keys are scoped to owner instance and list/block identity. Nothing in form layout calls value setters or materializes an absent group. Viewers use the same presentation with current read-only fields.

A bubbling reveal listener on each panel synchronously selects its tab; existing listeners open group/list/block ancestors before focus. Extend summary problem ordering to rendered layout order recursively, with tab/section problem indicators respecting existing hidden-block publication exemptions. Keep pending-request locks and existing form error paths. Moves must preserve the identity of mounted rich-text/media controls; test this explicitly rather than relying on value round-trips alone.

Rejected: conditional unmounting (loses transient editor state), rendering duplicate controls in multiple tabs (ambiguous identity/errors), and independent UI state in the draft (changes dirty comparisons and payloads).

### 4. New-entry mode is bounded by the creation dialog

Add Slug and Suggest from title to CreateEntryDialog. Default automatic mode derives from the title; editing Slug disables it, and explicit re-enable derives again. Extend the browser client's existing create method with an optional slug argument while preserving current call sites. Send the nonempty displayed slug through the existing create contract. Keep empty suggestions absent and show manual-entry guidance; continue permitting incomplete draft creation.

The created slug is saved atomically with creation, so opening the editor is clean. EntryPage keeps its existing explicit opt-in behavior, which resets on load/save; it never guesses newness from revision 1, missing slug, URL search state or timestamps. Duplicates therefore remain slugless. This defines “new” as the unsaved creation form and avoids a transient auto-edit after a successful server write. Existing entries can still deliberately request a suggestion.

Use the same pure normalizer in both places. Preserve NFKD decomposition and ASCII-only routes; trim any trailing hyphen after truncation. Examples: `Café & News` → `cafe-news`, `Hello__World` → `hello-world`, `Новости`/emoji-only → empty. No transliteration, suffix generation or preflight uniqueness query. Failures retain dialog values/mode; successful creation or close resets them. Existing route validation/publication and API errors stay authoritative; ordinary draft rules continue allowing missing slugs.

Rejected: automatic suggestions on every slugless entry (alters existing entries/duplicates), persistent auto/manual flags (unneeded data migration), and navigation markers that dirty the editor immediately after creation.

## Risks / Trade-offs

- Nested tab reveal can race with focus → synchronous bubbling reveal, persistent panels and browser tests through block tabs and collapsed list items.
- Reparenting controls after metadata refresh may remount them → layout is static for a loaded configuration; preserve keys across normal moves/tab changes and test editing identity/selection where applicable.
- Metadata removal could strip content keys → descriptor-position regression fixtures and pinned no-layout hashes.
- ASCII suggestions can be empty for non-Latin authors → explicit manual-entry guidance, no invented transliteration or draft requirement.
- Creation dialog owns automatic mode only → document the boundary and retain explicit editor suggestions for deliberate later use.

## Migration Plan

Before code, document the agreed metadata and navigation behavior in architecture sections 8 and 17 and mark CE9B in progress in the roadmap. No architecture invariant or ADR changes are required: this is presentation metadata within existing boundaries. Ship content/config/contracts/admin together; retain all no-layout encodings. Update reference examples and the starter's managed guide plus ownership/template metadata if managed files change, following existing release conventions. Add compatibility notes for optional metadata and atomic creation slug. Run focused portable/contract/sync/admin/browser tests and required root checks; record verified results. Do not archive or sync accepted specs without a separate request.

Rollback: remove layout from configuration, synchronize projection identity and run the matching earlier engine/admin together. Content JSON requires no conversion; already-created slugs are ordinary persisted content and stay unchanged. No extra logging/telemetry is necessary for local presentation state; normal API errors and request observability remain in place.
