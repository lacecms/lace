## 1. Architecture and metadata contracts

- [x] 1.1 Update architecture §§8/17 and ADR 0013 for recursive authoring, itemLabel, transient identities, absence and error focus before production edits; verify consistency with the three delta specs and keep CE7D out of scope.
- [x] 1.2 Add portable list itemLabel support in content builders/metadata, validating immediate supported group children and rejecting forged or misplaced options; verify focused content unit/type tests including unchanged nested value inference and existing descriptor fixtures.
- [x] 1.3 Carry itemLabel through recursive contract metadata and OpenAPI; regenerate the documented API and verify contract acceptance/rejection tests plus `pnpm openapi:check`.
- [x] 1.4 Exclude itemLabel only at list descriptor positions in configuration structural identity and sync comparison; verify focused config/application tests for model/block/whole-config hashes, projection-only sync without version bumps or content writes, itemLabel-named data keys and pinned pre-change fixtures.

## 2. Recursive draft state and budgets

- [x] 2.1 Implement typed recursive field paths, default-aware initialization and named-property clear serialization in entities/content; verify tests for absence, {}, [], false/0, child/container defaults, rich-text JSON, no array filtering and save/conflict JSON parity.
- [x] 2.2 Implement editor-scoped item identity sidecars and pure Add/Remove/Duplicate/Move operations for scalar/group arrays; verify identical-value items, deep detached duplicates, nested subtree movement/reset and absence of UI IDs in serialized content.
- [x] 2.3 Implement prospective normalized budget feedback and guards shared by list/container and block growth actions; verify lower maxItems, 100/101 and 499/500/501 boundaries, nested copied defaults, hidden blocks and invalid unrelated leaves without counting rich-text/block arrays.

## 3. Recursive authoring controls

- [x] 3.1 Replace composite inspection renderers with recursive fieldsets/lists using existing scalar/media/rich-text renderers and explicit Create/Clear controls; verify component tests for model/block nesting, all leaf kinds, default behavior, viewer disclosures, busy/permission gating and explicit empty-container round trips.
- [x] 3.2 Implement item actions, scalar insertion Add/Cancel, transient invalid scalar edits, collapsible mounted content, summary labels and count/problem indicators; verify component tests for focus after insertion/removal, detached copies, no null slots, no raw media IDs, clean disclosure state and rich-text/media state retention through collapse/move.
- [x] 3.3 Implement isolated pointer/keyboard dnd-kit list ordering with Move up/down and announcements; verify nested sorting cannot reorder parent/block lists, boundary buttons disable correctly, drag cancellation preserves order and focus follows the correct identity.
- [x] 3.4 Integrate normalized per-list/entry count feedback and disabled-reason text with list Create/Add/Duplicate and block Add/Duplicate; verify component tests for exact-boundary success, blocked nested/default growth and recovery through removal.

## 4. Recursive validation and editor lifecycle

- [x] 4.1 Extend local resolver and server issue mapping to exact composite leaves/containers and readable recursive summary order; verify editor-form/validation-problems tests for key/index paths, rich-text internals, unknown paths, simultaneous parent/child issues, publication minima and hidden-block non-blocking semantics.
- [x] 4.2 Anchor server issues to submitted item identities and recompute indexed locations on structural changes; lock content mutations while save/publish/reload/revert is pending; verify movement/removal/duplicate error behavior and delayed responses cannot target a different item.
- [x] 4.3 Add registered recursive reveal/focus handling shared by summary activation and block tabs; verify collapsed block/group/item chains expand outside-in and the exact scalar or labelled container receives focus without fixed delays.
- [x] 4.4 Integrate recursive controls with EntryPage baselines and lifecycle actions; verify existing and new component tests for save normalization, failed save/publish, revision-conflict Copy my JSON/reload, discard/revert, block/entry duplication, unsaved navigation and Ctrl/Meta+S without content loss.

## 5. Browser acceptance and completion

- [x] 5.1 Add focused composite browser fixtures and flows for page/collection/global model fields and block data, nested lists, media selection/upload, rich text, scalar insertion, duplicate/remove/move/pointer drag, limits and collapsed server-error focus; verify with the admin Playwright script and existing editor/block-envelope/SEO/entry-action regression flows.
- [x] 5.2 Complete a keyboard-only nested editing/reordering/conflict-recovery flow and viewer inspection; run axe in both themes and at 375px with no globally disabled rules, checking visible focus, announcements, mutation absence for viewers and boundary fixtures remain operable.
- [x] 5.3 Document composite configuration/editor behavior including itemLabel, defaults, limits and rollback compatibility; update CE7C roadmap evidence with actual checks and limitations, leaving CE7D separate. Verify documentation examples against descriptor tests and confirm no SQL migrations or persisted item envelopes were added.
- [x] 5.4 Run focused affected package/component/browser tests, then root `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate ce07c-generic-group-list-editing --type change --strict`; record results, fix failures and mark complete only after all pass. Leave spec synchronization/archive for an explicit request.
