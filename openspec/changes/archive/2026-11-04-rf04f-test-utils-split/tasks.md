## 1. Baseline

- [x] 1.1 Build `@lacecms/test-utils` and `@lacecms/config` from clean `dist/` and record the design decision 6 baseline in `verification.md`:
  - runtime keys and declaration export names of `test-utils` `.` and `./visibility-parity`, and of `config` `.`;
  - sorted `vitest list` titles for `test-utils` (64), `config` (50), `platform-node` and `platform-cloudflare`;
  - the 106 repository and 17 security contract names in order;
  - the exact case-number → run mapping from design decision 1, confirmed against the source (including lifecycle publication failures 11–12 and bulk reads 13).

  Verify the raw lists exist in the session scratchpad and the counts match.

## 2. Root modules and visibility

- [x] 2.1 Move these files with `git mv`:
  - `assertions.ts` and `gif.ts` → `shared/`;
  - `adapters.ts` → `adapters/fakes.ts`;
  - `build-export.ts` → `delivery/`;
  - `error-matrix.ts` → `errors/`, with its two tests.

  Move the `visibility-parity.ts` content to `visibility/parity-cases.ts` with its test, and reduce the root `visibility-parity.ts` to `export * from "./visibility/parity-cases.js"`. Update imports. Verify `pnpm --filter @lacecms/test-utils typecheck` and `test` pass, and the `./visibility-parity` runtime keys equal the baseline.

## 3. Repository contract by domain

- [x] 3.1 Create `repository-contract/{entries,sync,media}/fixtures.ts` with the cross-run fixtures listed in design decision 1. Point the existing area files at them. Verify typecheck and `case-names.test.ts` pass.
- [x] 3.2 Move each contiguous run of `builds.ts`, `lifecycle.ts`, `sync.ts`, `envelope.ts` and `export.ts` into its design decision 1 module, and `git mv` `media.ts`, `globals-seo.ts` and `conditional.ts` into their directories. Create `repository-contract/registry.ts` with the original run sequence. Delete the emptied area files and the barrel `index.ts`, and point `case-names.test.ts` and the package entry at `registry.ts` and `shared.ts`. Verify:
  - `case-names.test.ts` passes with its 106-name list unchanged;
  - no run module imports another run module;
  - every module is ≤ 1,000 lines (target ≤ 700).
- [x] 3.3 Run the contract suites from source: `pnpm --filter @lacecms/platform-node exec vitest run src/repository-contract.test.ts` and the platform-cloudflare equivalent. Verify both pass, and their listed titles equal the task 1.1 baseline.

## 4. Security contract by domain

- [x] 4.1 Split `security-contract.ts` into the design decision 2 modules under `security-contract/` with `registry.ts`. Import `ContractSql` from `repository-contract/shared.ts`, and add `security-contract/case-names.test.ts` pinning the 17 names. Verify:
  - both platform `security-contract.test.ts` suites pass with unchanged titles;
  - the new pin passes.

## 5. In-memory store by domain

- [x] 5.1 Move the free functions and constants to `store/support.ts`, and create `store/state.ts` with the constructor, fields, state accessors and the shared helpers as `protected` (design decision 3). Verify typecheck passes.
- [x] 5.2 Move the media, sync, entries and delivery method groups verbatim into `store/media.ts`, `store/sync.ts`, `store/entries.ts` and `store/delivery.ts` as a linear chain ordered by the call graph. Leave `store/in-memory-content-store.ts` exporting `InMemoryContentStore` with the existing `implements` list. Delete the root `in-memory-content-store.ts`. Verify:
  - `test-utils`, `application` and `server` tests pass (they use the store);
  - no store module exceeds 1,000 lines;
  - method bodies are textually identical to the originals (scripted comparison, recorded in verification).

## 6. Guards and entry

- [x] 6.1 Rewrite `test-utils` `index.ts` as explicit re-exports under the `// Directory dependencies:` header. Add `packages/test-utils` to `scripts/source-layout.json` with the measured directory sets, and remove the seven `test-utils` entries from `scripts/oversized-source-baseline.json`. Verify:
  - `node scripts/check-boundaries.mjs` passes;
  - the built runtime keys and declaration names equal the task 1.1 baseline;
  - the package `test:packaged` passes.

## 7. Monolithic tests: split and typed

- [x] 7.1 Split `test-utils/src/index.test.ts` into the design decision 5 companions, with shared setup moved to typed `src/test-support/` helpers. Verify the sorted titles equal the baseline, and `test` passes before typing.
- [x] 7.2 Remove `@ts-nocheck` from every test-utils companion, type them under the design decision 5 rules, and delete the `test-utils/src/index.test.ts` entry from `scripts/test-typecheck-baseline.json`. Verify:
  - `pnpm --filter @lacecms/test-utils typecheck` and `test` pass;
  - no companion carries the directive;
  - no production file outside the moved test-utils modules changed.
- [x] 7.3 Split `config/src/index.test.ts` into the design decision 5 companions, and move `index.type-test.ts` beside its module with its snapshots. Verify the sorted titles equal the baseline, `typecheck` (including type tests) passes, and the snapshots are reused unchanged.
- [x] 7.4 Remove `@ts-nocheck` from every config companion, type them, and delete the `config/src/index.test.ts` entry from `scripts/test-typecheck-baseline.json`. Verify `pnpm --filter @lacecms/config typecheck` and `test` pass, and no `config` production file changed.

## 8. Documentation and gates

- [x] 8.1 Update `docs/refactoring-roadmap.md`:
  - extend the RF4F session text with the added scope;
  - in §3, record the oversized baseline 11 → 4 and the typecheck exceptions −2;
  - add the RF4F progress row.

  Verify the docs link guard passes.
- [x] 8.2 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` and `pnpm exec openspec validate rf04f-test-utils-split --type change --strict`. Verify:
  - all pass;
  - listed titles across the four baseline packages equal task 1.1 plus the one security pin.

  Record the results in `verification.md` and delete raw passed-run output.
