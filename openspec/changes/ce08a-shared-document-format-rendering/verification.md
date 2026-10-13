# CE8A verification

Date: 2026-10-13

## Focused checks

- `pnpm --filter @lacecms/content build`, `test`, `typecheck` and `type-test`: pass; 92 runtime tests plus public type assertions. Expanded documents/defaults, nesting, unsafe attributes, URL policy, required semantics and unchanged list budgets are covered.
- `pnpm --filter @lacecms/render build`, `test` and `typecheck`: pass; 101 tests including old/expanded parity, exact descriptions, four link choices and contextual errors.
- `pnpm --filter @lacecms/astro test` and `typecheck`: pass; 37 tests, including 13 direct RichText container cases covering escaped code with exact whitespace, old formatting, new nodes, link combinations, overrides and rejection.
- `pnpm exec turbo run build --filter=@lacecms/astro`: pass.
- `pnpm --filter @lacecms/app-site test -- src/fixture-build.test.mjs`: pass; 3 fixture/live-export build tests, including static HTML assertions for expanded output and the existing unknown-block/unsafe-link/missing-media rejection checks.

Astro and reference tests run with local HTTP-server access because the filesystem sandbox disallows binding 127.0.0.1. One pre-existing content type-test suppression was moved to the offending property so its negative assertion compiles as intended. Test expectations use Astro's escaped quotes and actual emitted attribute order.

## Completion checks

- `pnpm typecheck`: pass, including 35 Turbo tasks and root configuration.
- `pnpm lint`: pass, including 20 Turbo tasks, package boundaries and admin colors.
- `pnpm format:check`: pass.
- `pnpm exec openspec validate ce08a-shared-document-format-rendering --type change --strict`: pass.
- `git diff --check`: pass.

## Delivery limits

No database migration, dependency change, block schema-version bump or automatic document rewrite. This implements CE8A only. The current admin cannot preserve expanded documents until CE8B; coordinated adoption and rollback requirements are recorded in compatibility guidance and ADR 0014. No production release, spec synchronization or archive was performed.
