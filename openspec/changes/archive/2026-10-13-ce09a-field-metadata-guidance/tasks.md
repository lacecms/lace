## 1. Contract and portable descriptors

- [x] 1.1 Update architecture sections 8 and 17 and the CE9A roadmap state to describe supported placeholders, projection-only identity, publication-only required guidance and the existing ordinary/SEO counting distinction; verify alignment with this delta and unchanged CE9B boundaries before code changes.
- [x] 1.2 Add typed optional placeholder support for text, textarea, URL, number, select and richText in content builders, inferred definitions and recursive normalization; verify valid/empty/omitted strings, detached JSON, scalar list items, nested block data/settings, unchanged inferred values, and rejection of unsupported kinds/non-string/accessor values in content unit/type tests.
- [x] 1.3 Introduce shared pure ordinary-text and SEO count semantics and reuse them at corresponding existing length checks and admin call sites without changing accepted values; verify raw whitespace, emoji, combining marks, empty values and min/max edges in focused content/SEO tests.

## 2. Projection and metadata transport

- [x] 2.1 Exclude placeholder only at recursive descriptor positions in canonical model/block data/settings structure while retaining it in projections; verify model/config hashes, no-placeholder hash fixtures and content/default keys literally named placeholder, itemLabel, label and description in config tests.
- [x] 2.2 Extend shared recursive metadata validation/OpenAPI shapes for the supported option and regenerate the checked API artifact if changed; run contract round-trip/rejection tests for model fields, block fields/settings and scalar list items, plus pnpm openapi:check.
- [x] 2.3 Verify adding/changing/removing only nested placeholders at the same model version uses the guarded display-only synchronization path on fake, SQLite and D1 contracts; assert unchanged saved draft/published values and revisions, no backfills/migrations and stale-plan refusal without partial writes.

## 3. Recursive editor guidance

- [x] 3.1 Compose visible required markers, publication-only explanations, declared string/number/list constraints and existing descriptions/annotations/errors centrally in recursive field nodes and legends; thread role-supported required state and valid description IDs into scalar/media controls, and verify all kinds, absent containers, scalar list items, block data/settings and viewer inspection in focused renderer/control tests.
- [x] 3.2 Apply explicit inherited placeholder, descriptor placeholder and existing fallback precedence to supported controls, honoring empty strings; verify nested controls, URL/select defaults, media inheritance explanations, SEO defaults annotations and absence of synthetic values or dirty state in control/entry tests.
- [x] 3.3 Extend rich-text placeholder decorations and aria-placeholder without editor recreation; verify configured/omitted/empty prompts, dynamic updates, preserved selection and undo history, no onChange on metadata update and no viewer placeholder in focused editor tests.
- [x] 3.4 Add ordinary text/textarea counters with current raw counts, declared hard bounds, accessible description linkage and no per-keystroke live announcements; distinguish SEO recommendations from existing hard limits and verify count edges, unbounded fields, viewer values, list moves/duplicates and existing save validation in renderer/SEO tests.

## 4. Product verification and documentation

- [x] 4.1 Extend focused entry browser coverage and axe checks for keyboard navigation, required/constraint/counter descriptions, configured placeholders, nested disclosure/list operations, media/rich-text controls and read-only inspection; run them at desktop and narrow widths and record results.
- [x] 4.2 Verify actual API save/read/publish flows with incomplete required fields, present invalid length values, valid nested values and metadata-only sync; prove incomplete drafts save, publication still enforces existing rules, saved/public JSON contains no guidance metadata and failed save/conflict/discard preserve values. Record integration evidence separately from browser mocks.
- [x] 4.3 Document supported placeholder syntax, omission/empty behavior, required-for-publication guidance, exact count semantics, SEO advice and coordinated engine/admin upgrade/rollback without migration; update relevant configuration examples and verify any modified starter/reference fixtures retain required parity.
- [x] 4.4 After focused tests pass, run root pnpm typecheck, pnpm lint, pnpm format:check and pnpm exec openspec validate ce09a-field-metadata-guidance --type change --strict; resolve failures, record commands/results in verification.md and the CE9A roadmap completion row, and review the scoped diff.

After explicit apply and successful verification, carry out the user's requested finalization: synchronize verified deltas into main specs, verify every delta matches, archive through openspec-archive-change and commit the complete scoped result. Do not archive or commit an unfinished implementation.
