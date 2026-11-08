# RF4J verification

Raw lists live in the session scratchpad (`rf4j/before/`).

## 1. Baseline (1.1)

- Built from `dist/` (Turbo cache restored the outputs of the current
  sources). Runtime keys / exported declaration names of `dist/index.*`:
  `sdk` 17 / 54, `create-lace` 11 / 18, `config` 10 / 34, `app-api` 4 / 6,
  `app-builder` 8 / 12.
- Declaration names are read by parsing the emitted `dist/index.d.ts`
  (following relative `export *`): the workspace uses TypeScript 7, whose
  package has no JavaScript compiler API.
- `vitest list` cases: `sdk` 86, `create-lace` 21, `config` 50,
  `contracts` 102, `app-api` 21, `app-builder` 31, `app-docs` 3.
- `scripts/test-typecheck-baseline.json`: 132 entries.
- Reference inventory: 38 lines naming `apps/api/dist/`, `apps/builder/dist/`,
  the `create-lace` inventory module or moving test paths.

## 2. Implementation checks

- 2.1 `scripts/source-root-entries.json` and
  `scripts/source-layout-exemptions.json` are enforced; `tests/boundaries.test.mjs`
  covers the listed entry, stale/nested/undeclared entries, the flat exempt
  package, an exempt package gaining a directory, a declared exemption and an
  unknown member; the file passes 90 cases.
- 2.2 Only `*.packaged.test.mjs` skips the JavaScript check. Without its new
  allowlist entry the real repository fails on
  `apps/docs/src/catalog.test.mjs` ("JavaScript source test").
- 3.1 `sdk`: `client/{client,errors}.ts`, `site/*`; largest module
  `client/client.ts` 590 lines. Tests 104 pass.
- 3.2 `create-lace`: `site/`, `template/`, `generator/`, `cli/`; largest
  `generator/project.ts` 248 lines. `test` 43, `test:packaged` 22 and
  `tests/release-artifacts.test.mjs` 11 pass.
- 3.3 `apps/api`: `config/`, `dispatch/`, `server/`; five root process entries
  listed. `test` 21, `test:packaged` 4 and `pnpm openapi:check` pass.
- 3.4 `apps/builder`: `runner/`, `server/handler.ts`; `main.ts` listed.
  `test` 54, `test:packaged` 1, `builder-diagnostics` and `root-scripts`
  tests pass.
- 3.5 `render` exemption recorded; a temporary `src/blocks/x.ts` makes the
  checker fail as specified.
- 4.1 28 contracts tests import concrete modules (namespace imports spread
  them); the entry re-export case moved to `index.test.ts` under its describe,
  `SLUG_PATTERN` comes from `@lacecms/content`. 168 tests pass; the 102 listed
  titles are equal, one moved file.
- 4.2 The `config` packaged test pins 34 declaration names; removing
  `FieldMap` from the entry and rebuilding fails it.
- 4.3 `apps/api` source tests pass three consecutive parallel runs.
- 5.1 Architecture §6, ADR 0020 (RF4J amendment), `AGENTS.md` and
  `DEVELOPMENT.md` updated; `docs-links` and `root-scripts` tests pass.
- 5.2 Clean rebuild: runtime keys and declaration names of the five members
  are byte-identical to the baseline. Listed test titles are equal (moved
  paths only). Typecheck baseline: 132 entries. Stale-path grep finds only
  the synthetic fixture strings in `tests/root-scripts.test.mjs` and
  `tests/security-resilience-runner.test.mjs`.

## 3. Final checks (5.3)

Run with Node 24.12.0, in `.github/workflows/ci.yml` order:

- `pnpm format:check`: first run flagged `tests/boundaries.test.mjs`; after
  `oxfmt`, exit 0.
- `pnpm lint` (Oxlint, boundaries, Drizzle check): exit 0.
- `pnpm typecheck`: exit 0.
- `pnpm test`: 64/64 tasks, exit 0.
- `pnpm build`, `pnpm acceptance:starter`, `pnpm acceptance:existing-site`,
  `pnpm docs:check`, `pnpm openapi:check`: exit 0.
- `pnpm spec:validate`: 87 passed, 0 failed.
- `pnpm exec openspec validate rf04j-remaining-flat-packages --type change --strict`: valid.

Not run: the admin Playwright browser install step (no admin change). Step
RF4 is marked done in the roadmap at archive, per its status legend.
