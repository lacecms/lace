## 1. Configuration and synchronization

- [x] 1.1 Update architecture §8 to describe the model icon and the revised public identity rule. Verify that the documented exclusion applies at the root model descriptor and covers the existing conservative baseline behavior.
- [x] 1.2 Add the shared icon catalog and portable validation, then normalize the optional string in all three model builders. Run focused config tests for named icons, complete emoji sequences, absent values, and invalid input with a model-specific diagnostic.
- [x] 1.3 Carry the icon in the full projection and exclude it at the model descriptor from structural and public identity. Run the configuration hash fixtures and focused tests for adding, changing and removing an icon, for compatibility when it is absent, and for content keys named `icon`.
- [x] 1.4 Exercise the existing guarded sync path with an icon edit on Node/SQLite and local Worker/D1. Verify that a trusted baseline allows an icon-only update without a revision or build change, a repeated sync is a no-op, a mixed public change requests a build, and an untrusted baseline takes the conservative path.

## 2. Discovery, sidebar, and documentation

- [x] 2.1 Project the optional icon through shared model discovery and update the checked-in OpenAPI contract. Run focused contract and discovery tests covering REST and MCP, exact value and omission, acceptance of an unknown well-formed name, and rejection of malformed metadata. Run `pnpm openapi:check`.
- [x] 2.2 Map the catalog to static Lucide components and render model icons in `SidebarNav`. Run focused navigation and sidebar tests for the Lucide and emoji paths, kind fallbacks including unknown names, and preserved accessible link names on desktop and in the mobile sheet.
- [x] 2.3 Set Navigation to `"menu"` and Site settings to `"⚙️"` in the starter and reference config. Document the supported catalog, validation, fallback, and sync behavior in the public configuration reference. Verify both configs normalize and the examples match the sidebar scenarios.

## 3. Completion checks

- [x] 3.1 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm exec openspec validate add-admin-model-icons --type change --strict`.
