## 1. Baseline

- [x] 1.1 Build `@lacecms/contracts` and record in `verification.md` the design decision 8 baseline: the runtime keys of `dist/index.js`, the value/type export names of `dist/index.d.ts`, the sorted `pnpm --filter @lacecms/contracts exec vitest list` names per file (expected 96 in 4 files) and the SHA-256 of `apps/api/openapi/api-v1.json`; verify the counts match and the raw lists exist in the session scratchpad.

## 2. Shared, errors and OpenAPI

- [x] 2.1 Create `shared/json.ts`, `shared/primitives.ts`, `shared/preconditions.ts` and `shared/url.ts` from the decision 1 ranges, exporting the decision 3 helpers they own, and re-export the public names from `index.ts`; verify the package suite and `pnpm --filter @lacecms/contracts typecheck` pass.
- [x] 2.2 Create `errors/envelope.ts` and `errors/classification.ts`; verify the package suite and package typecheck pass.
- [x] 2.3 `git mv field-openapi.ts` → `openapi/field-openapi.ts` and `field-openapi.test.ts` → `openapi/field-openapi.test.ts`, and create `openapi/json-schema.ts` with `contractJsonSchemaOverride`; verify the package suite passes.

## 3. Content

- [x] 3.1 Create `content/metadata.ts`, `content/models.ts`, `content/blocks.ts` and `content/seo.ts`; `git mv content-model-projection.ts` → `content/model-projection.ts`, add `ContentModelSource`, `toContentModelRouteDto` and `toContentModelDiscoveryDto`, and point its type imports at `./models.js` (decision 4); verify the package suite and package typecheck pass and nothing under `src/` imports `./index.js` except tests.
- [x] 3.2 Create `content/entries.ts`, `content/entry-requests.ts`, `content/entry-mappers.ts`, `content/links.ts` and `content/mcp-arguments.ts`; `git mv collection-queries.ts` → `content/collection-queries.ts` and append `collectionCapabilityIdentity`; verify the package suite and package typecheck pass.

## 4. Media, delivery and builds

- [x] 4.1 Create `media/queries.ts`, `media/metadata.ts` and `media/mappers.ts`; verify the package suite passes.
- [x] 4.2 Create `delivery/public.ts`, `delivery/public-mappers.ts`, `delivery/build-export.ts`, `delivery/build-export-mappers.ts` and `delivery/tolerant.ts`; `git mv tolerant.test.ts` → `delivery/tolerant.test.ts` with path-only edits; verify the package suite and package typecheck pass.
- [x] 4.3 Create `builds/site-builds.ts` and `builds/build-site.ts`; verify the package suite passes.

## 5. Accounts and settings

- [x] 5.1 Create `accounts/users.ts`, `accounts/email-delivery.ts`, `accounts/invitations.ts`, `accounts/sessions.ts` and `accounts/oauth.ts`; verify the package suite passes.
- [x] 5.2 Create `settings/status.ts` and `settings/credentials.ts`; verify the package suite and package typecheck pass.

## 6. Entry, tests and size guard

- [x] 6.1 Finalize `index.ts` as per-directory re-export groups headed by the decision 2 direction comment, with explicit lists for modules that export decision 3 helpers and `export *` only for fully public modules; remove its entry from `scripts/oversized-source-baseline.json`; verify `ls packages/contracts/src/*.ts` shows only `index.ts` besides the two test files task 6.2 splits, `index.ts` declares nothing but `packageName`, no production module exceeds 1,000 lines, and `node scripts/check-boundaries.mjs` passes.
- [x] 6.2 Split `index.test.ts` and `shared-identifiers.test.ts` into the decision 7 companions with path-only edits, repeating split `describe` titles, and move the shared fixtures to `src/test-support/rest-fixtures.ts`; delete `shared-identifiers.test.ts`; verify only `index.ts` and `index.test.ts` remain at the `src/` root, the sorted `vitest list` names equal the task 1.1 baseline (96) and `pnpm --filter @lacecms/contracts typecheck` passes.
- [x] 6.3 Run the decision 8 export-surface, OpenAPI-hash and acyclicity/direction scripts; verify the runtime keys and export names equal the baseline, no decision 3 helper is exported from the entry, `apps/api/openapi/api-v1.json` is unchanged, and no module cycle or edge outside decision 2 exists; record the results in `verification.md`.

- [x] 6.4 Update the four owner paths in `tests/shared-vocabulary.test.mjs` for the moved entry query, build-site identity, validation error and classifier; verify the guard and its negative fixtures pass without weakening checks.

## 7. Block definitions by type

- [x] 7.1 Replace the positional `hasMatchingBlockDefinitions` in `content/models.ts` with the decision 5 type match and add the case *block definitions match allowed blocks by type in any order* to `content/models.test.ts` (reversed order accepted; missing, extra and duplicated definitions rejected; duplicate allowed types with definitions rejected); verify it passes, that restoring the positional check makes it fail (then restore), and that `vitest list` is the baseline plus exactly this case (97).

## 8. Documentation

- [x] 8.1 Update `docs/refactoring-roadmap.md`: RF4C text records the directory layout correction and the type-matched block definitions; the §3 contracts size row and the oversized-files row show the RF4C result (15 → 14 baselined); add the RF4C progress-log row; verify `pnpm format:check` passes.

## 9. Gates

- [x] 9.1 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test` (includes `test:packaged`), `pnpm openapi:check`, `pnpm spec:validate` and `pnpm exec openspec validate rf04c-contracts-module-split --type change --strict`; verify all pass with root and per-package case counts equal to the baseline plus the one task 7.1 case.
