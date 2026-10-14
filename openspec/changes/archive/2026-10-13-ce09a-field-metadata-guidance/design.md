## Context

See proposal.md for CE9A scope. `packages/content/src/index.ts` owns builder option allowlists, recursive normalization, portable metadata and text validation. Ordinary text/default checks use `value.length`. `packages/config/src/index.ts` removes display properties at descriptor positions for hashes; it already handles list `itemLabel` separately. Contracts reuse `normalizeFieldDefinition`, with explicit recursive OpenAPI shapes in `field-openapi.ts`.

Admin `FieldRenderer/FieldRenderer.tsx` owns recursive nodes, labels, descriptions, disclosures, annotations and error IDs. `FieldControls` owns scalar controls; model/block media overrides consume the same renderer props. Text and textarea already accept an explicit placeholder prop; select and URL have generic fallbacks. RichTextEditor uses a fixed placeholder and initializes its extensions once. EntrySeoCard has independent counters with inherited placeholders; `seoTextLength` measures trimmed code points. Ordinary counters do not yet exist.

The accepted admin spec's original invalid-save scenario still names missing required fields. Architecture section 17, later accepted composite behavior and the actual publish-only required check disagree with that sentence. The delta explicitly corrects it while preserving present-value validation; no runtime validation change is authorized.

## Goals / Non-Goals

Goals: extend existing portable descriptors and recursive presentation without resetting form/editor state; centralize guidance and counting where their respective validation owners live; preserve all lifecycle and permission behavior.

Non-goals: new form state stores, per-field rich-text schemas, HTML-native required gating, rich-text/URL character counters, configurable date-picker/media prompts or any change to content serialization. Full product scope is in proposal.md.

## Decisions

### 1. A string option on controls that have a meaningful empty prompt

Support `placeholder?: string` on text, textarea, URL, number, select and richText. Preserve exact strings, including `""`; omit absent properties. Reject it on boolean, date, datetime, media, group and list. Their switch, calendar, picker and container affordances require guidance rather than a text prompt. This is a deliberate CE9A API boundary, not deferred implementation of an accepted option. Use type-specific options/inferred definitions and kind-specific normalization allowlists; avoid placing it indiscriminately on CommonFieldOptions. Keep existing date/datetime/media shared option types compatible while introducing supported-kind aliases where necessary.

Validate forged recursive descriptors through the same normalization path, not only builders. Continue existing rejection of executable options/accessors. No callback or HTML interpretation is introduced. Alternative: a common option accepted everywhere would silently ignore configuration and provide misleading type support.

### 2. Strip placeholders only at descriptor positions

Extend `fieldDefinitionStructure` recursively over model fields, block fields and settings. Do not change model/block display-key stripping into a recursive arbitrary-key filter. Keep fields and default keys literally named `placeholder`, `itemLabel`, `label` or `description`. Placeholders belong to projection identity only; omitted placeholders must not change historical hash fixtures. The existing label-only sync operation handles new projection hashes with guarded atomic application. No persistence adapter change is needed; exercise fake/SQLite/D1 contracts for parity and content preservation.

### 3. Centralized recursive guidance

Have ValueNode/ListNode/Disclosure compose labels or legends, configured description, publication-only required guidance, bound guidance, annotations, counter IDs and errors. A visible “Required” marker has an associated explanation; use aria-required only on roles that support it. Do not set native required/minLength/maxLength attributes that prevent incomplete saves or truncate input. Number/list maxima still use existing validation and operation gates. Explain text minima as applying to a supplied value; list minima remain publication-only. Retain inherited descriptions, UTC hints, media alt explanations, defaults notices and budget guidance.

Pass required state and composed describedBy through existing scalar/media renderer contracts. Use stable IDs derived from the current field path, render description nodes only when referenced and keep viewer descriptions present. Avoid one-off guidance duplicated in every scalar control. Containers retain absence versus explicit emptiness and disclosure behavior.

### 4. Placeholder precedence without editor recreation

Resolve an explicit runtime inherited placeholder first, then descriptor placeholder, then the existing per-control fallback. Use nullish checks so `""` is honored. Render explanatory inherited text separately from decorative generic prompts; placeholders never substitute for accessible labels. Ordinary viewer controls retain current disabled/read-only behavior; rich-text viewers receive no placeholder.

Extend RichTextEditor and its existing placeholder extension to read the current prompt from a stable ref/options hook. On prompt updates, refresh decoration/aria attributes without rebuilding the editor or setting its content. A placeholder change must not call onChange, reset undo or lose selection. Alternative: placing placeholder in useEditor recreation dependencies risks author data/history and is rejected.

### 5. Shared measurements with explicit existing modes

Expose a pure count utility from the content boundary with explicit ordinary-text/raw-UTF-16 and SEO/trimmed-code-point modes (or two named functions in that module). Route ordinary text default/runtime length checks and admin counters through the raw mode; SEO normalization and admin SEO measurements use the trimmed mode without changing results. Do not change canonical URL length rules. Tests cover whitespace, emoji, combining marks, absent values and exact bound edges.

Every ordinary text/textarea field shows a count, even without bounds. Associated guidance names supplied minima and maxima as limits. Reuse a small shared presentation helper within the content entity for ordinary and SEO counters where useful, preserving each measurement and label. SEO labels distinguish “recommended” from the existing API hard maximum and retain 60/160 warnings. Counter and warning nodes are not live regions. Avoid progress-meter ARIA that would announce every update. Native maxlength truncation and a new grapheme-based global count were rejected because they would alter authored data or validation compatibility.

## Risks / Trade-offs

- UTF-16 units can differ from perceived characters → document exact ordinary-field counting and prove matching validators; do not silently migrate semantics.
- Guidance loses linkage through nested item moves or media overrides → test resolved IDs, current item/value association and error recovery on actual recursive render paths.
- Rich-text extension retains a stale prompt → test dynamic metadata updates, empty decorations, aria-placeholder, selection, undo and no dirty state.
- Display stripping accidentally removes content keys → extend existing structural fixtures with literal placeholder keys and preserve no-placeholder hashes.
- Existing stale required-field scenario masks changed behavior → explicitly replace that scenario and test both incomplete successful draft save and failed publication.

## Migration Plan

No database or content migration. Update packages that validate/project metadata and the admin together before adopting the new option; older engines reject it as unknown. Existing configurations keep current hashes and prompts. Deploy metadata through normal guarded sync at the same model version. Rollback removes placeholder options before running an older engine; saved content is unaffected. Record focused verification plus root checks in verification.md and the CE9A roadmap row. After apply is explicitly requested and verified, carry out the user's requested spec sync, archive and scoped commit.
