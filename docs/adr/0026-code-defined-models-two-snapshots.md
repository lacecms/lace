# ADR 0026: Code-defined models with draft and published snapshots

- Status: Accepted
- Date: 2026-11-08
- Governing architecture: [section 4.3](../architecture/README.md#43-code-first-structure-cms-managed-content),
  [section 4.4](../architecture/README.md#44-two-content-states),
  [section 8](../architecture/content-configuration.md#8-content-configuration) and
  [section 9](../architecture/data-model.md#9-content-data-model)

This record states a decision taken with the MVP baseline. It was previously
listed in architecture §24 and is recorded here retroactively.

## Context

Adding a model or route also requires the site to render it, so structure
belongs with the site's code. Content values belong to editors. Storage must
fit D1 row limits and stay simple to publish atomically.

## Decision

- Content models (pages, collections and route-less globals,
  [ADR 0010](0010-global-models.md)) are defined in version-controlled code and
  projected into the database by configuration sync; the admin renders forms
  from them but never defines them.
- Pages, collection records and globals share `content_entries`.
- Each entry has one mutable draft snapshot and at most one immutable
  published snapshot; no application-level revision history.
- Blocks are separate relational rows with type-specific JSON payloads;
  top-level blocks are flat and sparsely ordered.
- Tiptap edits rich-text fields and blocks only, not the whole page document
  ([ADR 0014](0014-expanded-rich-text-format.md) governs the format).

## Consequences

- Publication copies the draft snapshot and its blocks with set-based SQL.
- No user-defined models in the admin UI, no unlimited history, no
  `previousPublished` snapshot.
- Structural changes go through configuration sync
  ([ADR 0007](0007-schema-evolution-during-sync.md)).

## Alternatives considered

- **One JSON document per page.** Rejected: unbounded row size against the D1
  2 MB limit and whole-document rewrites for every block edit.
- **Admin-defined models.** Rejected: the site could not render them safely.
