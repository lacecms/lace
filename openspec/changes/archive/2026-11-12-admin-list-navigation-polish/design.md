## Context

See the proposal and capability deltas. `defineConfig` currently sorts models by key before producing runtime and public projections; discovery and the sidebar preserve that sorted order. Canonical hashes and synchronization deliberately ignore model declaration order. Collection sort is currently one native selector of field/direction pairs, and search guidance is permanently rendered beneath its input.

## Goals / Non-Goals

**Goals:** Deliver the specified compact, accessible controls and declaration-ordered navigation without changing query semantics or configuration identity.

**Non-Goals:** Personalized ordering, persistent disclosure state, per-group nested scroll areas, new storage, and search behavior changes.

## Decisions

- Keep normalized runtime models in declaration order for model discovery; independently sort canonical public/hash inputs by key as today. Verify existing public projection and sync contracts before changing normalization, and preserve their existing order and hash values. Discovery is shared by REST and MCP; both remain consistent. Reject sorting the sidebar alphabetically because it discards the configured order, and reject changing canonical hash order because presentation-only reordering must not imply schema changes.
- Keep the existing encoded sort value and URL contract. Derive a field and direction for the UI and reconstruct the same value on either control change. Use a bounded selector and direction button with explicit accessible state; table headers continue to operate on the same value. Keep enabled system sorts and field sorts even when not shown as columns.
- Move descriptive guidance into an information disclosure usable on touch and keyboard, with Escape dismissal. Keep validation feedback separately associated with the input and visible when invalid. Do not replace required behavior with hover-only text or change runtime budget enforcement.
- Put independent transient expanded state in the shared sidebar component so desktop and sheet have the same behavior. All groups initially expand; reopening/remounting may reset state. Retain the existing single navigation scroll container and fixed resource links/permission checks. No storage, migration or synchronization is introduced. Nested scroll regions and drag-and-drop were rejected for complexity and navigation friction.

## Risks / Trade-offs

- [Changing normalized order could alter hashes, projections, or sync] → retain canonical key-sorted projections and add reorder regression tests across configuration, discovery and sync, including both runtimes where appropriate.
- [Truncated text or icon-only direction becomes ambiguous] → retain complete option names and explicit accessible names/current direction; test long labels, keyboard operation and header synchronization.
- [Hidden search guidance conceals a failed query] → show actionable errors inline and preserve last valid results.
- [Many links remain lengthy] → one scrollable navigation plus collapsible groups keeps all destinations reachable without nested scrolling.

## Migration Plan

No persisted data or schema migration is intended. Deploy the updated application and configuration packages together; rollback restores the prior presentation and key-ordered discovery. Existing URLs and stored content remain compatible.
