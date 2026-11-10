## Context

See the proposal. `FieldRenderer` contains context, recursive `ValueNode`, list rendering and the public form-bound wrapper. `ListNode` recursively renders `ValueNode`; a naive two-way module import would create a cycle. `BlockEditor` currently constructs callbacks in its per-block loop; `BlockCard` owns sortable/focus coordination, menu behavior and mounted tab panels. RF6C's transient issues and editor identity are part of this existing behavior. Roadmap §2 requires existing tests to change only import paths and package declaration exports to stay identical.

## Goals / Non-Goals

**Goals:** Separate responsibilities within the existing admin slices, retain stable item and block identity, and shrink the oversized renderer without changing user-visible behavior.

**Non-Goals:** New list abstractions for other packages, changes to form ownership, persisted schemas, access rules, or a broader editor redesign.

## Decisions

1. Extract `ListNode`, `ItemRow`, `ItemSummaryLine` and `rowFocusTarget` into `entities/field-editor/ListField/`, with private types and helpers colocated as appropriate. Pass the recursive value renderer as a typed component/callback from the dispatcher, and move shared context, node contracts and helpers into lower-level private modules where necessary. Dependencies point from the dispatcher to list and shared modules, never back from list to dispatcher; no cycles, cross-slice imports or public slice API expansion. This preserves recursive nested lists without a circular import. Avoid a global registry or introducing a new layer.
2. `FieldRenderer` should become a dispatcher below 500 lines; extracting the list alone leaves roughly 700 lines, so also split existing context and non-list value rendering by responsibility inside the same slice. Do not move unrelated functionality to meet the number or weaken the 1,000-line gate. Each extracted production file stays under 1,000 lines; remove the existing baseline entry once the original is within the limit. The 500-line figure is a target, not a new invariant: record the actual count and any justified shortfall in verification and the roadmap.
3. Extract `BlockCardMenu` and `BlockCardTabs` inside the block-editor widget, following component folder/colocated test rules. Keep sortable identity and card-level focus/reveal orchestration at the card, and preserve menu close autofocus, delayed duplicate/remove, hidden announcements, tab problems and force-mounted panels. Existing tab selection is keyed by block identity and persists through reorder. Keep accessible names, keyboard semantics, error and read-only/busy behavior unchanged. Splitting markup without preserving mounted panels would lose editor state.
4. Define one typed `BlockActions` interface for activation, announcement, duplicate, move, remove, tab and collapse operations. Create one shared actions object per editor instance, passing block key and any necessary arguments to its methods; `BlockCard` supplies its own identity at the interaction boundary. Resolve the current index/definition at action time or use current render state safely, so reorder, removal, async/menu-close callbacks and changing busy/read-only conditions cannot target a stale block. Keep existing guards, growth limits, focus and undo semantics. Avoid an object with closures freshly bound to each index or a stale memoized closure. Tests should exercise reorder followed by action and delayed menu close.
5. Preserve the accepted list behavior: scalar/group and nested lists, identity through reorder, transient and server errors, copy/default isolation, media picker, reveal and focus, pointer and keyboard drag, limits and read-only state. Preserve block envelope, tab content and media/rich-text state. Existing test files change import paths only, as required by roadmap §2; add focused colocated tests if needed for extracted component folder rules and stale-action risks without weakening existing assertions. Keep the three RF6C editor acceptance suites unchanged.

## Risks / Trade-offs

- [Extraction remounts a recursive component or associates state with an index] → preserve element types, keys and token ownership; run list and composite tests, including reorder, transient issues and rich-text state.
- [A shared action captures stale state] → address by block identity and verify reorder, removal, delayed menu close, busy and read-only transitions.
- [Menu or tab split alters focus or unmounts controls] → preserve Radix mounting and focus behavior; verify keyboard, validation reveal and existing browser coverage.
- [Breaking the admin boundary or replacing one oversized file with another] → run lint/boundary checks and measure every split file; retain no new module cycles.

## Migration Plan

No data or deployment migration. Ship the internal component refactor atomically; roll back the code and tests together. Record measured sizes and checks in the change verification record and roadmap. No runtime adapter or server contract changes.
