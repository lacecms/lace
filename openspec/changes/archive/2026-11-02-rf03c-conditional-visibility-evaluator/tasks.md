## 1. Baseline

- [x] 1.1 Create `verification.md` and record the source case counts of `content`, `application`, `test-utils`, `render`, `platform-node`, `platform-cloudflare` and `app-admin` (`pnpm exec vitest list | grep -c " > "` per package), the SHA-256 of `apps/api/openapi/api-v1.json`, and the public export list of `@lacecms/content` (`pnpm --filter @lacecms/content build`, names exported by `dist/index.d.ts`); verify the note contains all three records.

## 2. Content evaluator

- [x] 2.1 Add `effectiveVisibilityValues` to `packages/content/src/index.ts` next to `isFieldVisible` per design decision 1 (present value unless `undefined`/`null`, else declared default, else omitted; only controllers named by the rules; `Object.hasOwn` lookups; no mutation), and rewrite the `isFieldVisible` doc comment to state that it takes effective values; verify `pnpm --filter @lacecms/content typecheck` passes.
- [x] 2.2 Route `normalizeFieldMap` and `publishedFieldValues` through it per design decision 3 (one computation per occurrence); verify the content suite passes at its baseline count, including every case in `conditional-fields.test.ts`.
- [x] 2.3 Add content cases to `conditional-fields.test.ts`: effective values for an omitted, present and `null` defaulted select, an optional controller without default, a boolean with `false`, rules naming one controller twice, and no rules (`{}`); `publishedFieldValues` on a group value that omits `kind` (default `image`) keeps `media`, drops `videoUrl` and keeps retained key order (spec scenario "Projection of values without a defaulted controller"); verify the cases pass and the last one fails against the pre-change projection (record the check in `verification.md`).
- [x] 2.4 Add `effectiveVisibilityValues` to `packages/content/src/packaged-exports.packaged.test.mjs`; verify `pnpm --filter @lacecms/content test:packaged` passes.

## 3. Delegations

- [x] 3.1 Replace the body of `visibleUnder` in `packages/application/src/configuration-fields.ts` with the delegation of design decision 4 (with a one-line comment on the local rule map); verify the application suite passes at its baseline count, including every case in `configuration-visibility.test.ts`.
- [x] 3.2 Make admin `effectiveFormValues` in `apps/admin/src/entities/content/visibility.ts` delegate to `effectiveVisibilityValues` per design decision 5; verify `pnpm --filter @lacecms/app-admin test` passes with `visibility.test.ts` unchanged.

## 4. Parity

- [x] 4.1 Add `packages/test-utils/src/visibility-parity.ts` with `visibilityParityCases` per design decision 6 (every target that is a parity subject is `required`, so validation exposes it), importing only `@lacecms/content`; export it from the index and from the subpath `@lacecms/test-utils/visibility-parity` (`package.json` `exports`), and add the subpath source alias to `vitest.shared.mjs`; verify `pnpm --filter @lacecms/test-utils typecheck` and `build` pass and `dist/visibility-parity.js` exists.
- [x] 4.2 Add `packages/test-utils/src/visibility-parity.test.ts`: for every case, the keys reported visible by `isFieldVisible` over `effectiveVisibilityValues`, the keys kept by `publishedFieldValues` over values holding every field, the keys kept by `transformConfigurationSyncFields(..., "published", rules)` over the same raw values, and the publish-mode result of `validateModelFields` (each hidden required target may be missing; a missing visible required target fails with `missing_required_field` at its exact path) all equal the expected set; verify it passes.
- [x] 4.3 In `apps/admin/src/entities/content/visibility.test.ts` import the cases from `@lacecms/test-utils/visibility-parity` and assert `shownFieldKeys` equals each expected set (descending into nested group and list-item occurrences as the case declares); verify the admin suite passes under its jsdom environment.
- [x] 4.4 Add the runtime parity case of design decision 7 to `packages/test-utils/src/repository-contract/conditional.ts` and append its name to the pinned list in `repository-contract/case-names.test.ts`; verify `pnpm --filter @lacecms/test-utils test`, `pnpm --filter @lacecms/platform-node test` and `pnpm --filter @lacecms/platform-cloudflare test` pass, each with exactly one more contract case than the baseline.
- [x] 4.5 Record in `verification.md` a temporary experiment: change only application `visibleUnder` back to its own default lookup that treats `null` as present, add a parity case with a stored `null` controller to a scratch copy of the table, and record that `visibility-parity.test.ts` fails naming that case; revert, and verify `git status` shows no experiment edits.

## 5. Guard

- [x] 5.1 Extend `tests/shared-vocabulary.test.mjs` per design decision 8 (single owner for `effectiveVisibilityValues` and `isFieldVisible`; inline `rule.values.includes(` flagged outside content, with the `BlockSettingsFields.tsx` settings-rule match allowlisted with its reason) and add a flagged fixture under `tests/fixtures/shared-vocabulary/`; verify the guard passes on the tree and the fixture fails with its file and line.
- [x] 5.2 Run `grep -rnE "function (effectiveVisibilityValues|isFieldVisible|visibleUnder|effectiveFormValues)\b" packages apps --include='*.ts' --include='*.tsx'` excluding `dist`; record in `verification.md` that the evaluator is defined only in `packages/content/src/index.ts` and the two remaining matches are the delegations.

## 6. Documentation and gates

- [x] 6.1 Update `docs/mvp-architecture.md` §8 *Conditional fields* (validation, the published projection, synchronization and the admin evaluate rules through the shared content evaluator over effective values, with `null` as unset); move the roadmap baseline row "conditional-visibility evaluators" in `docs/refactoring-roadmap.md` from 3 to 1 with a progress-log row; verify the root link guard passes.
- [x] 6.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test`, `pnpm openapi:check` and `pnpm exec openspec validate rf03c-conditional-visibility-evaluator --type change --strict`; verify all pass, `api-v1.json` has the baseline SHA-256, the content export list equals the baseline plus `effectiveVisibilityValues`, and per-package case counts equal the baseline plus the cases added here, recorded in `verification.md`.
