## 1. Architecture and portable field metadata

- [x] 1.1 Update `docs/mvp-architecture.md` sections 8, 11, 13 and 17 for LIST1 presentation metadata, Gallery v4 and site-owned CSS companions before runtime edits; verify consistency with this change's eight capability deltas and the existing scalar-settings/user-owned-source invariants.
- [x] 1.2 Extend select descriptors with validated, detached choice-card metadata and bounded rectangle diagrams (design D1; field-descriptors delta); verify content unit/type tests cover all supported nesting positions, complete/unique choices, plain-text labels, invalid field kinds, bounds/overlap/extra keys, JSON round trips and unchanged value inference.
- [x] 1.3 Extend descriptor-aware structural identity and application display-diff classification for `presentation` (D2; content-model-configuration delta); verify existing pinned hashes, projection-only changes, unchanged option/default structural rules and preservation of identically named content/default keys in focused config/application tests.
- [x] 1.4 Update recursive REST metadata validation and OpenAPI documentation for the new select presentation; verify contracts accept valid nested cards, reject forged malformed metadata and keep old descriptors unchanged, then regenerate/check OpenAPI through the root scripts.

## 2. Shared layout settings and Gallery migration

- [x] 2.1 Export `listLayoutSettings()` with all three scalar descriptors, stable values/defaults, applicability guidance and diagrams for three modes/seven presets (D3; list-layout delta); verify unit/type tests use it in Gallery and an unrelated custom block without admin-specific metadata or new field kinds.
- [x] 2.2 Advance Gallery to definition v4, add shared settings and Layout/Behavior sections, and append migration 4 while retaining migrations 2/3 (D7; block-registry delta); verify migrations from versions 1/2/3 preserve data, links, order, lightbox and envelope values and apply exactly the declared defaults.
- [x] 2.3 Update maintained configuration versions that structurally include the changed Gallery definition and verify draft/published/hidden Gallery synchronization plus presentation-only synchronization on Node and Cloudflare test fixtures; prove shared validation paths, no-content-rewrite display updates, stale-plan rejection, resumable migration and existing final publication/build behavior.

## 3. Generic choice cards in the admin

- [x] 3.1 Add a reusable radio-card control using admin tokens, text labels/descriptions and neutral diagram cells (D4; admin-draft-editor delta); verify component tests cover text-only/diagram cards, optional empty selection, arrows with wrapping, Home/End, Space and ordinary Tab navigation.
- [x] 3.2 Adapt the shared select field control to card metadata and shared guidance/error/focus behavior without Gallery or setting-name branches; verify model fields, nested list items and declared settings share the renderer, old selects remain dropdowns, and validation-summary activation focuses the correct radio through containing tabs/disclosures.
- [x] 3.3 Cover layout editing through the ordinary draft form; verify mode switches retain all visible values, viewer output is read-only, lifecycle locks prevent edits, and save/discard/revert/duplicate/block moves and revision conflicts retain existing behavior without adding UI metadata to authored payloads.
- [x] 3.4 Add focused admin browser acceptance for schematic mode/preset cards in light/dark themes at 320px and desktop widths; verify no horizontal overflow, visible focus/selection, accessible names and no media/preview requests from empty-Gallery thumbnails.

## 4. Registry support for stylesheet companions

- [x] 4.1 Extend registry validation from one component-only file to one component plus CSS companions (D6; block-source-registry delta); verify old items remain valid and focused tests reject unknown roles, multiple components, non-CSS companions, missing files, escaping paths, symlinks and case-insensitive target collisions with selected or already installed items.
- [x] 4.2 Adapt block-map/component selection and file planning to roles while preserving per-item ownership (block-installation-cli delta); verify fresh/custom-directory installation, missing-companion restoration, idempotence, dry run, CSS/component conflicts and `.new` recovery never produce a partially updated item or broken import/lock pair.
- [x] 4.3 Extend bundled-registry/parity verification to include companion CSS and unchanged manifest/lock schemaVersion 1; verify CLI build bundles byte-identical declared files and existing one-file registry/CLI tests continue to pass.

## 5. Neutral list CSS and Gallery rendering

- [x] 5.1 Add the canonical `ListLayout.css` companion implementing all three modes, wrap states, seven presets, container thresholds, CSS variables and scoped direct-item rules (D5; list-layout delta); verify browser-computed layouts at widths below/at/above 32rem, 48rem and 64rem, including odd/empty/single-item lists and vertical flex with/without site-defined height.
- [x] 5.2 Update the canonical Gallery component to emit shared layout hooks on its existing elements, import the companion and choose default/conservative image sizes; advance its registry revision to 4 and verify rendered fixtures preserve alt/caption fallbacks, lazy loading, links overriding lightboxes, anchors/classes, item order and the absence of authored style/script tags or inline layout styles.
- [x] 5.3 Propagate registry sources/CSS to starter, reference and existing-site fixtures and regenerate their locks; remove competing unlayered structural grid rules while keeping site-owned 1rem spacing, image proportions and theme rules, then verify source/hash parity and default Gallery appearance/build snapshots.
- [x] 5.4 Add a non-Gallery card-list render fixture using the same settings and CSS contract; verify flex/grid behaviors work without Gallery selectors, nested unmarked lists are untouched, and site-only unlayered CSS overrides display, gap and columns without `!important` or CMS changes.

## 6. Documentation and integrated acceptance

- [x] 6.1 Document settings reuse, thumbnail semantics, all presets, vertical-wrap height, CSS hooks/variables/layer ordering and image-sizes tuning in internal field guidance and public content-modeling/Astro integration docs; verify examples use supported scalar settings and docs checks/build pass.
- [x] 6.2 Document the coordinated engine/admin/CLI/site upgrade, required model-version changes, sync sequence, site theme cleanup, CSS conflict recovery and backup-based rollback; verify the procedure against a v3 Gallery upgrade fixture without overwriting edited user files or introducing database migrations.
- [x] 6.3 Run focused end-to-end acceptance spanning settings selection/save/publish, published scalar values, Gallery rendering, CSS-only overrides and a fresh independently generated Astro site's companion import/build; verify the unchanged image-link/lightbox behavior and the existing-site connection path.

## 7. Completion checks

- [x] 7.1 Run the narrow relevant suites for content/config/contracts/application, admin, CLI, registry sources, maintained site fixtures and cross-runtime sync; verify all affected behavioral scenarios pass and record the exact commands/results with any pre-existing unrelated failures identified.
- [x] 7.2 Run root `pnpm typecheck`, `pnpm lint` and `pnpm format:check` after focused tests; verify all required checks pass without introducing ESLint/Prettier or modifying unrelated local site-route work.
- [x] 7.3 Run `pnpm exec openspec validate add-reusable-list-layouts --type change --strict`, review every completed checkbox against its evidence and report implementation results; leave spec synchronization/archive for a separate explicit user request.
