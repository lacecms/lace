## 1. Baseline

- [x] 1.1 Build `sdk`, `create-lace`, `config`, `@lacecms/app-api` and
  `@lacecms/app-builder` from clean `dist/` directories and record in
  `verification.md`:
  - sorted runtime keys of each `dist/index.js` and exported declaration
    names of each `dist/index.d.ts`;
  - `vitest list` titles of those five members, `contracts` and `apps/docs`;
  - the `scripts/test-typecheck-baseline.json` entry count (132);
  - a grep inventory of references to `apps/api/dist/`, `apps/builder/dist/`,
    `packages/create-lace/src/inventory.ts`, `dist/inventory.js` and the
    test paths that move (design Context).

  Verify the raw lists exist in the session scratchpad.

## 2. Boundary checker

- [x] 2.1 Add `scripts/source-root-entries.json` and
  `scripts/source-layout-exemptions.json` (both empty) and implement design
  D6 in `scripts/check-boundaries.mjs`: listed root entries join a declared
  package's accepted root modules; stale, nested or undeclared root entries
  fail; exemptions fail when not a member, also declared, or holding a
  non-`test-support/` directory. Add `tests/boundaries.test.mjs` fixture cases
  for the *Listed process entry*, *Stale or misplaced root entry*, *Exempt
  package stays flat*, *Exempt package gains a directory* and *Package both
  declared and exempt* scenarios. Verify the boundary tests and
  `node scripts/check-boundaries.mjs` pass.
- [x] 2.2 Narrow the JavaScript-test skip to `*.packaged.test.mjs`, add the
  reasoned `apps/docs/src/catalog.test.mjs` allowlist entry, and add fixture
  cases for *A new JavaScript source test is added*, *A listed JavaScript
  test* and *Packaged-output tests stay JavaScript*. Verify the boundary tests
  pass and the checker fails on the real repository with the entry removed.

## 3. Package layouts

- [x] 3.1 `sdk` (design D1): `git mv` the modules into `client/` and `site/`,
  extract `client/errors.ts`, rewrite the entry with its
  `Directory dependencies:` header, move the tests and point their imports at
  the concrete modules, rename baselined test paths, declare `packages/sdk` in
  `scripts/source-layout.json`. Verify `sdk` `test`, `typecheck` and the
  boundary checker pass and every production module is under 700 lines.
- [x] 3.2 `create-lace` (design D2): split `index.ts` and `site.ts` into
  `site/`, `template/`, `generator/` and `cli/`; move `inventory.ts` and
  `render.ts`; fix the template root URL; update
  `scripts/release-model.mjs`, `scripts/release-artifacts.mjs` and
  `tests/release-artifacts.test.mjs`; declare the package. Verify
  `create-lace` `test`, `test:packaged`, `typecheck`, the boundary checker and
  `pnpm exec vitest run tests/release-artifacts.test.mjs` pass.
- [x] 3.3 `apps/api` (design D3): move the modules into `server/`, `config/`
  and `dispatch/`, move `NodeApiConfig`, fix the configuration URL, list the
  five process entries in `scripts/source-root-entries.json`, update the
  external dist importers, move `node-server.test.ts` and
  `project-config.test.ts`, rename baselined test paths, declare the package.
  Verify `@lacecms/app-api` `test`, `test:packaged`, `typecheck`,
  `pnpm openapi:check` and the boundary checker pass.
- [x] 3.4 `apps/builder` (design D4): move the modules into `runner/` and
  `server/`, list `main.ts`, move the tests, rename baselined test paths,
  update `tests/builder-diagnostics.test.mjs`, the two verification runners
  and `docs/personal-site-guide.md`, declare the package. Verify
  `@lacecms/app-builder` `test`, `test:packaged`, `typecheck`,
  `pnpm exec vitest run tests/builder-diagnostics.test.mjs
  tests/root-scripts.test.mjs` and the boundary checker pass.
- [x] 3.5 Record `packages/render` in `scripts/source-layout-exemptions.json`
  with the design D5 reason. Verify the boundary checker passes and fails
  when a temporary `packages/render/src/blocks/` directory with one module is
  added.

## 4. Leftovers

- [x] 4.1 Point the 28 contracts module tests at the modules that define
  each imported symbol (design D7); keep `index.test.ts` on the entry. Verify
  `contracts` `test` and `typecheck` pass, `vitest list` titles equal the 1.1
  baseline, and no test outside `index.test.ts` imports `../index.js`.
- [x] 4.2 Add the declaration-name case to the `config` packaged test with the
  1.1 list. Verify `config` `test:packaged` passes and fails when one type
  export is removed from `src/index.ts` and the package rebuilt.
- [x] 4.3 Remove `fileParallelism: false` from `apps/api/vitest.config.mjs`.
  Verify `@lacecms/app-api` `test` passes three consecutive runs.

## 5. Documentation and verification

- [x] 5.1 Update architecture §6 (root-entry list, exemption list, JavaScript
  test exception) and add an RF4J amendment to ADR 0020. Verify the internal
  documentation link check passes.
- [x] 5.2 Rebuild the five members from clean `dist/`. Verify runtime keys and
  declaration names equal the 1.1 baseline; `vitest list` titles equal it
  except moved paths; the typecheck baseline still has 132 entries; the
  reference grep finds no old path outside `openspec/changes/archive/` and
  the roadmap.
- [x] 5.3 Record the outcome in the roadmap RF4 section and progress row
  (Step RF4 done). Run every step of `.github/workflows/ci.yml` that local
  tooling supports, including root `pnpm typecheck`, `pnpm lint`,
  `pnpm format:check`, `pnpm test`, `pnpm openapi:check`,
  `pnpm acceptance:starter`, `pnpm acceptance:existing-site` and
  `pnpm exec openspec validate rf04j-remaining-flat-packages --type change --strict`.
  Record the results in `verification.md`.
