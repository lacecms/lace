# DOC1 verification

Date: 2026-10-18. Documentation target: 0.1.0-alpha.6, English/latest following main.

## Automated checks

Passed: frozen dependency installation; standalone `pnpm docs:check`; isolated
`test:variants` build (English/French fixture and latest/alpha-5 fixture, with
production output unchanged); 30 focused publication/boundary tests; root
`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`,
`pnpm openapi:check`, `pnpm spec:validate`; strict change validation. Root standalone
test phase passed 30 files / 189 tests. The full workspace test phase also passed.

The first sandboxed test attempt could not bind local HTTP ports. Retried with
local-network permission. Four existing CLI tests then failed because the Docker
client selected an unavailable OrbStack socket; after starting OrbStack the full
root command passed. No production SQLite safety check or test expectation was
bypassed. Existing better-auth peer warnings for SQLite/Vitest are unrelated to
Starlight; its Astro peer range is compatible with pinned Astro 7.3.1.

## Static output and browser smoke

The production build verifies 19 HTML pages including entry redirects/not-found,
local page/fragment/resource links, OpenAPI byte equality and Pagefind assets.
All public content is in the app; existing internal docs remain in place.

Checked a built preview at `http://127.0.0.1:4322/lace/` using Playwright CLI:

- Root entry reaches `/lace/en/latest/` with target alpha.6 information.
- Sidebar deep links and source/edit links point to the correct section/source.
- Searching for synchronization returns four results and opens the configuration
  synchronization guide at its deep URL.
- Dark theme selection applies.
- At 375 × 812, document width and scroll width both equal 375.
- Keyboard Tab reaches the skip link with an auto outline of 1px; mobile Menu
  expands the navigation and was visually inspected.
- Additional locale/version fixture pages do not appear in the production build.

## External deployment boundary

No commit, push, Pages deployment or repository settings change was performed.
The main-only workflow is implemented and tested with injected deployment history,
including pagination, failed attempts, stale revisions and forced retry. Live
GitHub Pages publication remains a post-merge check requiring Pages Source =
GitHub Actions and a main-only github-pages environment, as documented in
`docs/documentation-maintenance.md`. Local verification is not a live deployment
receipt. Delta specs were synchronized to the accepted public-documentation,
documentation-publication and workspace-governance specs and verified before
archiving on 2026-10-18.
