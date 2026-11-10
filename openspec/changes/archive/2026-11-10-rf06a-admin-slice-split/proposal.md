## Why

RF6A, the first session of roadmap step RF6, separates the editor's heavy dependencies from content models used by navigation and other screens. The current content barrel eagerly exposes both field and rich-text editors, while mandatory component folders create boilerplate for private leaves.

## What Changes

- Split content, field-editor and rich-text responsibilities into separate entity slices, preserving layer direction and composing dependent editors in a higher layer. Put only the minimal types genuinely needed by multiple slices in a lower-layer internal contract; keep field rules owned once and preserve all admin behavior.
- Permit private PascalCase leaf components as sibling files; retain folder and public API requirements for exported components. Update architecture §17 and the boundary checker with focused positive and negative coverage.
- Consolidate build and import token confirmation into one reusable dialog while preserving each operation, copy, error handling and query invalidation.
- Prove an isolated SidebarNav unit import does not load Tiptap and reduce one-line admin index barrels below 150.

RF3A's field support table is already delivered. RF6B client work, RF6C state ownership and RF6D renderer decomposition are outside this session. No routes, accessible names, editor semantics, API contracts or package exports change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-source-structure`: permit non-public leaf component files under a precisely enforced rule while retaining slice and component public boundaries.

## Impact

Admin entities, editor composition, token features, tests and `scripts/check-boundaries.mjs` change. Architecture §6 and §17, ADR 0020, `admin-source-structure`, and the roadmap govern the work. This is a tooling and structure requirement change, so a delta spec is required even though product behavior remains unchanged. No runtime dependency, migration or external API change is intended.
