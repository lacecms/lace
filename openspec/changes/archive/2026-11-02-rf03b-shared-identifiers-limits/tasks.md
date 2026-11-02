## 1. Baseline

- [x] 1.1 Create `verification.md` and record the case counts of `content`, `config`, `domain`, `application`, `contracts`, `server` and `test-utils` (`pnpm exec vitest list | grep -c " > "` per package), the SHA-256 of `apps/api/openapi/api-v1.json`, the public export lists of `config`, `domain`, `application` and `contracts` (`pnpm build`, then the names exported by each `dist/index.d.ts`), and `JSON.stringify(toContentModelDto(...))` of the fullest model fixture in the contracts suite; verify the note contains all four records.

## 2. Content modules

- [x] 2.1 Add `packages/content/src/objects.ts` with `deepFreeze`, `isPlainObject` and `isRecord` (bodies moved from `index.ts`), delete the private copies in `index.ts`, import them there and re-export the module; add unit tests for frozen nesting, null-prototype objects and arrays/class instances; verify `pnpm --filter @lacecms/content test` passes with the baseline count plus the new cases.
- [x] 2.2 Add `packages/content/src/identifiers.ts` with `SLUG_PATTERN`, `MAX_SLUG_LENGTH` and `ContentModelKind` (moved from `index.ts`), `isContentSlug`, `RouteIssue`, `RouteFailure`, `pagePathFailure`, `collectionRouteFailure` and `collectionPathFailure` per design decision 2, and the four transport limits per decision 3; re-export it from `index.ts`; verify `pnpm --filter @lacecms/content typecheck` passes.
- [x] 2.3 Add `packages/content/src/identifiers.test.ts` covering every `RouteIssue` with its exact message, the scenario values of the `content-domain-rules` delta (`/blog/:slug/:id`, `/blog/`, `/a//b`, `/a/../b`, `/a?b`, `blog`, `/a b`, `Release_Notes`, `release--notes`, `-release`, a 101-character slug, a non-string), resolution of `/blog/:slug` + `release-notes`, and the limit values 200/200/50/100; verify the test passes.
- [x] 2.4 Add the new names to `packages/content/src/packaged-exports.packaged.test.mjs`; verify `pnpm --filter @lacecms/content test:packaged` passes.

## 3. Config and domain wrappers

- [x] 3.1 `packages/config/src/index.ts`: delete `SLUG_PATTERN`, `isPlainObject`, `deepFreeze` and `assertCanonicalRouteValue`; implement `normalizePagePath`, `normalizeCollectionRoute` and `resolveCollectionRoute` over the content route checks with `fail(failure.message)`; keep `fail` local (design decision 5); verify the config suite passes unchanged at its baseline count, including the `ConfigurationError` cases at `index.test.ts:206-227`.
- [x] 3.2 `packages/domain/src/index.ts`: delete `SLUG_PATTERN`, `ContentModelKind`, `deepFreeze`, `assertCanonicalPath` and the local `isContentSlug`; re-export `ContentModelKind` and `isContentSlug` from content; implement `normalizePagePublicPath`, `normalizeCollectionPublicRoute` and `resolveCollectionPublicPath` over the content checks with `fail("CONTENT_INVALID_STATE", failure.message)`; add a domain case asserting the `/blog/:slug/:id` message from the spec; verify the domain suite passes.
- [x] 3.3 Add `packages/test-utils/src/route-parity.test.ts` (test-utils already depends on config and domain): for every invalid path, route and slug of task 2.3, config throws `ConfigurationError` and domain throws `DomainError` with `CONTENT_INVALID_STATE` and equal message text, and both resolve `/blog/:slug` + `release-notes` identically; verify it passes.
- [x] 3.4 Verify that the export lists of `config` and `domain` equal the baseline (`pnpm --filter @lacecms/config --filter @lacecms/domain build`, compare with task 1.1) and that both `test:packaged` suites pass.

## 4. Application, contracts and server

- [x] 4.1 `packages/application/src/index.ts`: replace the declarations of `MAX_CONTENT_ENTRY_SEARCH_LENGTH`, `MAX_MEDIA_SEARCH_LENGTH`, `MAX_MEDIA_USAGE_ENTRIES` and `MAX_BUILD_EXPORT_PAGE_SIZE` with re-exports from content (alias for the entry search name), keeping doc comments; verify the application suite passes unchanged and its packaged export test passes.
- [x] 4.2 `packages/contracts/src/index.ts`: replace the four limit declarations with re-exports from content, add `export { SLUG_PATTERN } from "@lacecms/content"`, import `ContentModelKind` from content, and use `MAX_SLUG_LENGTH` in the entry `slug` query schema; add `SLUG_PATTERN` to `packaged-exports.packaged.test.mjs`; verify the contracts suite passes unchanged.
- [x] 4.3 Add a contracts test that the strict-end entry `slug` query regex and `SLUG_PATTERN` agree on a corpus of valid slugs, the invalid slugs of task 2.3 and `"release-notes\n"`; verify it passes, and fails when the query regex is temporarily changed to accept underscores.
- [x] 4.4 `packages/server/src/app.ts`: replace the inline slug regex in the public collection entry route with `SLUG_PATTERN.test(slug)` from contracts; verify `pnpm --filter @lacecms/server test` passes, including the public collection route cases.
- [x] 4.5 Run `pnpm openapi:generate`; verify `apps/api/openapi/api-v1.json` has the baseline SHA-256 and `pnpm openapi:check` passes.

## 5. Projection completeness

- [x] 5.1 Add `visibility?: FieldVisibility` to `DiscoveredContentModel` in `packages/application/src/content-use-cases.ts`; verify `pnpm --filter @lacecms/application typecheck` and its suite pass.
- [x] 5.2 Rewrite `toContentModelDto` over the total `contentModelProjection` table and `CONTENT_MODEL_DTO_KEYS` per design decision 7; add contracts tests that the sorted keys equal the sorted `contentModelSchema` entry keys, while serialization retains the existing insertion order and that the serialized fullest fixture equals the task 1.1 record; verify the contracts suite passes, and that removing one projection entry is a type error.
- [x] 5.3 Add `packages/test-utils/src/contract-sources.test.ts` with the `Mirrors` assertion and the eleven pairs of design decision 6, each omitted-key list commented with its reason; fix application types (never the check) where a source key is missing; verify `pnpm --filter @lacecms/test-utils typecheck` and `test` pass.
- [x] 5.4 Record in `verification.md` a temporary experiment: add an optional `experimental?: string` to `DiscoveredContentModel` and to `MediaView`, run `pnpm --filter @lacecms/test-utils typecheck`, and record that both pairs fail with `unprojected`; revert, and verify `git status` shows no experiment edits.

## 6. Guard

- [x] 6.1 Add `tests/shared-vocabulary.test.mjs` per design decision 8 with fixtures under `tests/fixtures/shared-vocabulary/` (a flagged `const SLUG_PATTERN`, a flagged `MAX_MEDIA_USAGE_ENTRIES` declaration, a flagged inline slug regex, and an allowed re-export); verify it passes on the tree and each flagged fixture fails with its file and line.
- [x] 6.2 Run `grep -rnE "(const|type|function) (SLUG_PATTERN|MAX_SLUG_LENGTH|ContentModelKind|isContentSlug|MAX_ENTRY_SEARCH_LENGTH|MAX_MEDIA_SEARCH_LENGTH|MAX_MEDIA_USAGE_ENTRIES|MAX_BUILD_EXPORT_PAGE_SIZE|deepFreeze|isPlainObject|isRecord)\b" packages apps --include='*.ts' --include='*.tsx'` excluding `dist` and tests; record in `verification.md` that each symbol has exactly one definition, under `packages/content/src`.

## 7. Documentation and gates

- [x] 7.1 Update `docs/mvp-architecture.md` §6 *Repository structure* rules (content owns the shared vocabulary of identifiers, model kinds, route rules, transport limits and object helpers; other packages import or re-export) and §8 *MVP content limits* (the four transport limits and the runtime search limits that stay separate); update the roadmap RF3B section (`fail` correction, re-export reading, checked mirror count) and move the "slug/route canonicalization" baseline row in `docs/refactoring-roadmap.md` to its new value with a progress-log row; verify the root link guard passes.
- [x] 7.2 Run the repository contract suite on both runtimes (`pnpm --filter @lacecms/platform-node test` and `pnpm --filter @lacecms/platform-cloudflare test`); verify both pass with unchanged case counts.
- [x] 7.3 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test`, `pnpm openapi:check` and `pnpm exec openspec validate rf03b-shared-identifiers-limits --type change --strict`; verify all pass and per-package case counts equal the baseline plus the cases added here, recorded in `verification.md`.
