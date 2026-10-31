## 1. Architecture and planning documents

- [x] 1.1 Update `docs/mvp-architecture.md` §9.7 *Media* (tags table, normalization, no public or build effect), §12 *Admin endpoints* (tag parameters, upload tags, catalog route) and §16 (D1 budgets for filtered lists); verify with `git diff` that no other invariant changes
- [x] 1.2 Mark SM3 / SM3A `in progress` in `docs/site-migration-roadmap.md`; verify the overview table and progress log agree

## 2. Schema and normalization

- [x] 2.1 Add `media_tags` to `packages/db/src/schema.ts` and generate migration `0014` (composite key, `(tag, media_id)` index, cascading foreign key, length and ASCII-alphabet checks); verify the migration applies on in-memory SQLite, file-backed SQLite and local D1, and update hard-coded migration counts in `packages/platform-node` and CLI tests
- [x] 2.2 Add `normalizeMediaTag`/`normalizeMediaTags` to `packages/domain` per design D2; verify unit tests for ASCII lowercase, surrounding spaces, internal-space rejection, Cyrillic/full-width/emoji rejection, deduplication, ASCII ordering, 40/41 characters, 20/21 tags, punctuation, control characters before trimming and unpaired surrogates

## 3. Application

- [x] 3.1 Extend media ports and `MediaUseCases`: tags on create, `tags` in metadata update with tags-only changes producing no published-version or build effect, `tags` filter (≤ 5) in list, new tag catalog use case (`content:read`), tags in every media result; verify application unit tests with fake ports for authorization, validation-before-read, unchanged detection and build outcomes

## 4. Repositories

- [x] 4.1 Extend shared SQL in `packages/db/src/sql-content.ts`: tag `exists` filters, cursor kind including tags, catalog query with prefix range and keyset continuation, tag reads for catalog items; verify db unit tests
- [x] 4.2 Implement tags in the Node repository (create, update replacement in the transaction, list filter, catalog, explicit tag removal on final deletion); verify `packages/platform-node` tests
- [x] 4.3 Implement tags in the D1 repository inside the existing guarded batches (create, update, final deletion) and bounded reads; verify `packages/platform-cloudflare` tests and the D1 budget suite (`vitest.d1-budgets.config.mjs`) with a 500-item, five-tag case
- [x] 4.4 Add the shared media-tag cases to `packages/test-utils/src/repository-contract.ts` per the `content-repository-contracts` delta, including public read and build export without tags; verify they pass on file-backed SQLite, in-memory SQLite and local D1

## 5. Contracts and REST

- [x] 5.1 Update `packages/contracts`: `tag` in `mediaListQuerySchema`, `tags` in `updateMediaMetadataRequestSchema` and `mediaMetadataSchema`, new `mediaTagCatalogQuerySchema`/`mediaTagCatalogSchema`; verify contracts tests for pointers `/tag/<i>`, `/tags/<i>` and the strict DTO
- [x] 5.2 Update `packages/server`: list tag parameters, multipart `tags` parts validated before create, update with tags, new `GET /api/v1/admin/media/tags`; verify server tests for success, validation failures storing nothing, cursor refusal with a different tag set, viewer read access, unauthenticated/build-token/MCP-token refusal, and regenerate OpenAPI (`pnpm openapi:check`)
- [x] 5.3 Verify Node and Worker API parity for the new routes and parameters in the existing cross-runtime product suite (`vitest.cross-runtime.config.mjs`)

## 6. Admin compatibility and documentation

- [x] 6.1 Update the admin API client and media types for the required `tags` DTO key and the catalog read without UI changes; verify admin typecheck and unit tests
- [x] 6.2 Document tags in `docs/` (media API reference and operations migration step), bump `TEMPLATE_VERSION` to 0.42.0 with an `.lace/upgrade-instructions.json` entry for migration `0014` (Node and Cloudflare steps, backup, rollback), refresh generated-project snapshots; verify create-lace tests and `pnpm acceptance:starter`

## 7. Verification and completion

- [x] 7.1 Run root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` and the CI steps in `.github/workflows/ci.yml`; record results in `verification.md`
- [x] 7.2 Run `pnpm exec openspec validate sm03a-media-tag-storage-api --type change --strict` and update the roadmap progress log; verify validation passes
