## 1. Architecture and decision record

- [x] 1.1 Update `docs/mvp-architecture.md` section 9.7 (new columns and checks, `metadata_json` reserved, the metadata update command, `active`-only editing, the `updatedAt` version tag and the publication-version rule with build reason `media_metadata`) and section 12 (the `PATCH /api/v1/admin/media/:mediaId` route and the detail `ETag`). Verify that the text matches the media-use-cases and rest-contracts deltas.
- [x] 1.2 Add `docs/adr/0009-media-metadata.md` recording the CE3 owner decisions (fields, global metadata live on the next build, optional alt with usage → media → empty resolution) and design decisions D1–D3 with rejected alternatives, and link it from section 24 of the architecture. Set CE3 to `in progress` in `docs/content-editor-roadmap.md`. Verify with `pnpm format:check` on the changed docs.

## 2. Domain, ports and contracts

- [x] 2.1 Add `alt?`, `caption?` and `focalPoint?` (`MediaFocalPoint {x, y}`) to `MediaMetadata` and the `MEDIA_UPDATE_CONFLICT` code to `DomainErrorCode` in `@lacecms/domain`. Add `UpdateMediaMetadataInput`/`UpdateMediaMetadataResult` and `updateMediaMetadata` to `MediaCommandPort` in `@lacecms/application`. Verify with `pnpm --filter @lacecms/domain --filter @lacecms/application typecheck`. Adapter type errors are expected until groups 4–5.
- [x] 2.2 In `@lacecms/contracts`: add the `MEDIA_UPDATE_CONFLICT` code (`409`, sanitized message), optional `alt`/`caption`/`focalPoint` on `mediaMetadataSchema` and `toMediaMetadataDto`, `updateMediaMetadataRequestSchema` (strict, non-empty, code-point limits, character classes, focal range), `updateMediaMetadataResultSchema`, `toUpdateMediaMetadataResultDto` and `resolveMediaPrecondition` (strong single tag only). Add contracts tests for valid and invalid bodies with their issue paths, DTO omission of unset values, the precondition (missing, weak, `*`, list, malformed) and error classification. Verify with `pnpm --filter @lacecms/contracts test`.

## 3. Use case

- [x] 3.1 Implement `normalizeMediaMetadataPatch` and `MediaUseCases.updateMetadata` per design D3: permission first, validation before any read, `null` for unknown items, the `active`/conflict checks, merge, no-op short-circuit, `max(now, expected + 1)`, and the build outcome. Extend `toMediaView` with the new values. Verify with typecheck.
- [x] 3.2 Implement `updateMediaMetadata` in `InMemoryContentStore` (`@lacecms/test-utils`) with the same guards, codes, version bump, `media_metadata` build reason and atomicity. Add application tests for viewer denial, trimming and clearing, each invalid input with no read, an unknown item, a `deleting` item, a stale `updatedAt`, a no-op on published media, a draft-only item (no bump), a published item (one bump, `queued`), same-millisecond successive edits producing distinct tags, and the values on list/get/create results. Verify with `pnpm --filter @lacecms/application test` and `pnpm --filter @lacecms/test-utils test`.

## 4. Schema and shared SQL (`@lacecms/db`)

- [x] 4.1 Add the four columns and the equivalent table-level checks to `schema.ts`. Run `pnpm --filter @lacecms/db db:generate`, replace the generated rebuild SQL of `0006` with additive `ALTER TABLE media ADD … CHECK (…)` statements (pairing check on `focal_y`), keep the generated snapshot and journal, and add the entry to `checkedInMigrations`. Verify that the SQL contains no table rebuild and that the inventory test passes.
- [x] 4.2 Select the new columns in `MEDIA_COLUMNS_SQL`, map and validate them in `mediaMetadata(row)` (half-set or out-of-range rows are refused), and add shared SQL for the guarded update and the published-reference check. Verify with `pnpm --filter @lacecms/db test`.

## 5. Runtime adapters

- [x] 5.1 Node: give `bumpPublicState` an explicit reason (existing callers unchanged) and implement `updateMediaMetadata` in one transaction with the checkpoint `media.metadata`, the guarded update, zero-row classification and the conditional bump (design D4). Verify with the Node repository contract run from group 6.
- [x] 5.2 D1: give `addPublicStateBump` an explicit reason and implement `updateMediaMetadata` as one guarded batch with the bump conditional on the guard and the published reference, a trailing outcome select before guard release, and post-batch classification. Verify with the D1 contract run from group 6 and the batch statement budget.
- [x] 5.3 Add `PATCH /api/v1/admin/media/:id` and `POST /api/v1/admin/entries/:id/unpublish` to the Worker's `DISPATCH_PRODUCING_REQUESTS`, with `worker.test.mjs` cases for both requests and a non-2xx response. Verify with `pnpm --filter @lacecms/platform-cloudflare test -- worker`.

## 6. Repository contract and migration tests

- [x] 6.1 Add contract cases (Node file, Node memory, D1) per the content-repository-contracts delta: update and clear with round trip through list, catalog, detail, by-ID and public reads; one bump and one `media_metadata` pending build for published usage; no bump for draft-only and unused items; coalescing with an existing pending build; stale `updatedAt` including from an independent repository; `deleting` item; injected `media.metadata` and `public-state` checkpoint failures leaving everything unchanged; database refusal of a half-set or out-of-range focal point and over-long text through raw SQL. Verify with `pnpm --filter @lacecms/platform-node test` and `pnpm --filter @lacecms/platform-cloudflare test`.
- [x] 6.2 Extend `packages/platform-cloudflare/src/d1-migration.test.mjs` and the Node migration test: migrate a `0005` database with referenced media to `0006`, and assert `NULL` columns, unchanged references and `metadata_json`, and current readiness. Verify both runtime test commands pass.

## 7. HTTP route and OpenAPI

- [x] 7.1 Add the `PATCH /api/v1/admin/media/:mediaId` route (`describeRoute`, body schema, `resolveMediaPrecondition`, `404` for `null`, `200` with the result DTO and `ETag`) and the `ETag` header on the detail `GET`. Add `app.test.mjs` cases for success with a changed `ETag`, the build outcome for published and unused media, viewer `403`, unknown `404`, missing/weak `If-Match` `422`, invalid body pointers `422`, empty body `422`, stale tag `409 MEDIA_UPDATE_CONFLICT`, `deleting` item `422`, and the detail `ETag` equal to the DTO `updatedAt`. Verify with `pnpm --filter @lacecms/server test`.
- [x] 7.2 Regenerate `apps/api/openapi/api-v1.json` with `pnpm openapi:generate`. Verify with `pnpm openapi:check`.

## 8. Documentation and roadmap

- [x] 8.1 Update `docs/database-migrations.md` (migration `0006`, additive, no backfill, rollback note) and the media API description in `docs/node-api.md` (route, body, `If-Match`, `ETag`, result, errors). Verify the links resolve and `pnpm format:check` passes.

## 9. Verification

- [x] 9.1 Run the narrowest affected package tests, then root `pnpm typecheck`, Oxlint (`pnpm lint`), `pnpm format:check` and `pnpm exec openspec validate ce03a-media-metadata-storage-api --type change --strict`. Verify that all pass.
