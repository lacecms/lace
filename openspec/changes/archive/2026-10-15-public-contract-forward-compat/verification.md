# Verification: public-contract-forward-compat

Run on 2026-10-15, branch `feat/rc-export-contract`, macOS arm64, Node
24.12.0, pnpm 12.3.4.

## Focused tests

| Command | Result |
| --- | --- |
| `pnpm turbo run test --filter=@lacecms/contracts` | 105 passed: 73 existing, plus 32 in `tolerant.test.mjs` (strict/tolerant parity, per-object unknown-key injection, required/type failures, hidden-block rejection, `formatVersion`, unknown error code) |
| `pnpm turbo run test --filter=@lacecms/sdk` | 89 passed, including unknown keys at every level, the unknown error code, `LaceUnsupportedExportFormatError` and the loader's `invalid_export` mapping |
| `pnpm turbo run test --filter=./packages/server --filter=./apps/api` | passed; `formatVersion: 1` asserted on the server app, Node listener and Worker smoke |
| `pnpm turbo run test --filter=@lacecms/astro --filter=@lacecms/render --filter=./apps/site --filter=create-lace` | 37 / 101 / 3 / 64 passed |
| `pnpm exec vitest run --config vitest.cross-runtime.config.mjs` | 1 file, 1 test passed |
| `pnpm acceptance:starter` | passed: packed starter installed, typechecked and built with and without globals |
| `pnpm test` | 40 of 40 turbo tasks successful |

A first create-lace run failed one onboarding build. The test started before
turbo had rebuilt the SDK `dist` that the symlinked site `node_modules` uses.
After the dependency build, it passed on every run. The failure was ordering
only, not caused by this change.

## Root gates

| Command | Result |
| --- | --- |
| `pnpm typecheck` | passed |
| `pnpm lint` | passed |
| `pnpm format:check` | passed (after formatting two new test files) |
| `pnpm openapi:check` | passed, with the regenerated `apps/api/openapi/api-v1.json` staged. The diff adds `formatVersion` (`const: 1`) to the required build-export keys |
| `pnpm exec openspec validate public-contract-forward-compat --type change --strict` | valid |

## Design adjustments during implementation

- D1 derives the tolerant family from the strict schemas
  (`toTolerantSchema`) instead of a strict/tolerant factory. This keeps one
  definition and the existing types, and avoids TS2589 risk. The design was
  updated.
- The tolerant public block rejects a `hidden` key instead of stripping it.
  Stripping it would render a block the CMS marked hidden. The
  `rest-contracts` delta in both active changes, the design and the
  architecture section 12 were updated.
