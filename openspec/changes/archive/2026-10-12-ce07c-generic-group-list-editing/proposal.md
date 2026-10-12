## Why

CE7A and CE7B carry and synchronize bounded composite data, but the admin still shows groups and lists as read-only JSON. Session **CE7C — Generic group and list editing** of `docs/content-editor-roadmap.md` makes these fields authorable using the existing draft/publication lifecycle.

## What Changes

- Replace composite inspection placeholders with recursive labelled groups and homogeneous repeatable lists in model fields and block data, reusing scalar, rich-text and media controls.
- Add, remove, duplicate, move and drag list items with keyboard access, collapsible complex items, summaries and transient stable identities that never enter content JSON.
- Add optional `itemLabel` presentation metadata to group-valued lists, referring to an immediate text, textarea, select or URL child. Treat changes as projection-only.
- Show normalized per-list and entry-wide budget feedback; preflight growing operations against list maxima and the 500-element snapshot budget, including hidden blocks and nested defaults.
- Resolve recursive validation to exact controls, open containing disclosures and block tabs on summary activation, and distinguish publication-only requirements/minima from draft errors.
- Preserve viewers, dirty state, save shortcuts, conflict recovery and all existing editor lifecycle actions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-draft-editor`: recursive authoring, list operations and identity, budgets, nested error navigation and read-only inspection replace the transitional composite placeholder.
- `field-descriptors`: optional portable validated list `itemLabel` metadata without a content envelope or value inference change.
- `content-model-configuration`: item-label metadata participates in projections but not structural identity, versions or migrations.

## Impact

Depends on completed CE7A/CE7B. Architecture references: §§4.8, 6, 8 (bounded composites/projection), 9.3–9.5, 10–12, 17, 20 and 22; ADR 0013. Update §8 and §17 before implementation to describe metadata and shipped controls; no invariant change is proposed.

Primary code: `apps/admin/src/entities/content` (FieldRenderer, editor-form, validation-problems and draft handling), block-editor widget, entry-editor feature/page and media/rich-text integrations. Metadata touches `packages/content`, configuration canonicalization and `packages/contracts` including recursive DTO/OpenAPI validation. Tests cover package/type contracts, component behavior and `apps/admin/e2e` browser flows. Existing React Hook Form, dnd-kit, Radix and design tokens suffice.

No SQL migration, repository/API command change, new persistence identity or runtime-specific behavior is needed. Node and Cloudflare use identical metadata and validation. CE7D Gallery/Navigation, starter changes, nested blocks, heterogeneous lists, references, CE9 visual sections/tabs and new rich-text features are out of scope. This proposal stops before production code; apply is a separate action.
