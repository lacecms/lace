## 1. Architecture and roadmap first

- [x] 1.1 Update `docs/mvp-architecture.md` sections 12 and 13 (public entry shape `{id, modelKey, path, slug?, title, fields, blocks, publishedAt}`, response wrappers, the resolved media dictionary and its URL origin, the removal of the mirrored draft, `PublishedEntry`/`PublishedSite` `media()`/`image()`, the render-core image describer) and add the public delivery decisions (D2, D4, D5, D7) to `docs/adr/0009-media-metadata.md`. Verify with `pnpm format:check` on the changed docs.

## 2. Shared rules and contracts

- [x] 2.1 Add `effectiveAltText(usageAlt, mediaAlt)` to `@lacecms/content` and re-export it from `@lacecms/contracts`. Unit-test non-blank usage alt, blank usage alt falling back to media alt, and both absent → `""`. Verify with `pnpm --filter @lacecms/content test`.
- [x] 2.2 In `@lacecms/contracts` add `publicEntrySchema`, `publicMediaSchema` (null for unknown values), `publicMediaDictionarySchema` (key equals `id`), and reshape `publicContentEntrySchema` to `{entry, media}`, `publicContentListSchema` to `{items, media, nextCursor?}` and `buildExportSchema` to `{entries, media, version}`; add DTO types and mappers `toPublicEntryDto` (published snapshot only, blocks sorted by position, `publishedAt` from the snapshot's `createdAt`), `toPublicMediaDto` and `toPublicMediaDictionary` (deduplicated, keys sorted). Replace the old round-trip tests: strict rejection of `draft`/`model` keys and of the legacy wrapper, a dictionary item with a mismatched `id`, out-of-range focal point, nulls accepted, sorted keys. Verify with `pnpm --filter @lacecms/contracts test`.

## 3. Repository reads

- [x] 3.1 Add `media: readonly MediaMetadata[]` to `PublicContentEntry` in `@lacecms/application`, and a shared `PUBLIC_SNAPSHOT_MEDIA_SQL` (active media joined from `content_media_references` by snapshot ID) in `packages/db/src/sql-content.ts`. Verify with `pnpm --filter @lacecms/application --filter @lacecms/db typecheck`.
- [x] 3.2 Load referenced media in chunks for `loadPublic`, `listPublic` and `exportBuildContent` in the Node repository and the D1 repository, attaching each published snapshot's media to its public entry. Verify with the runtime repository contract runs in task 3.4.
- [x] 3.3 Make the in-memory fake in `packages/test-utils` project public reads through `publicEntry()` and return each entry's published media from its stored references. Verify with task 3.4.
- [x] 3.4 Extend the shared repository contract (`packages/test-utils/src/repository-contract.ts`): an entry published with two media items and a later draft referencing a third returns exactly the two items (with alt, caption, focal point and dimensions) from page, path, collection and export reads; the draft never appears; update the existing `loadPublic` expectation that asserted the mirrored draft. Verify with `pnpm --filter @lacecms/platform-node --filter @lacecms/platform-cloudflare --filter @lacecms/test-utils test`.

## 4. Server routes and OpenAPI

- [x] 4.1 Map every public entry route and the build export in `packages/server/src/app.ts` to the new DTOs, building media URLs from the configured `publicBaseUrl` (never the request `Host`); add `resolver(...)` 200 responses to the page, collection, slug and path routes. Update `app.test.mjs` (list, single, export, 304, displayName absence, unpublish 404, the export race) for the new shape and add a test that the media dictionary of a list merges duplicates and contains no draft-only media. Verify with `pnpm --filter @lacecms/server test`.
- [x] 4.2 Regenerate `apps/api/openapi/api-v1.json` with `pnpm openapi:generate` and stage it. Verify with `pnpm openapi:check`.
- [x] 4.3 Update the runtime tests that read public bodies (`apps/api/src/node-server.test.mjs`, `apps/api/src/worker-smoke.test.mjs`, `packages/platform-cloudflare/src/worker.test.mjs`, `packages/platform-node/src/index.test.mjs`) and add a Node end-to-end case: editing the alt text of published media changes the export ETag and the export dictionary shows the new alt text. Verify with `pnpm --filter @lacecms/app-api --filter @lacecms/platform-cloudflare --filter @lacecms/platform-node test`.

## 5. SDK

- [x] 5.1 Update the REST client in `packages/sdk/src/client.ts` to the new DTOs; `getAllCollection` returns `{items, media}` with merged dictionaries. Update `packages/sdk/src/index.test.mjs` (helpers, pagination merge, export ETag cases). Verify with `pnpm --filter @lacecms/sdk test -- index`.
- [x] 5.2 Rebuild the loader view per design D4 and D6: entries with `publishedAt`, `media()`, `image()`; site `media()`, `image()`; resolved URLs rebuilt with the configured public base or kept from the export; `mediaUrl()` returning the resolved URL for known IDs; `Map`-based lookups. Update `published-site.test.mjs` (entry shape, no draft, public origin) and add cases for usage alt precedence, empty alt, unknown ID, `__proto__` ID, and URL origin with and without `LACE_PUBLIC_BASE_URL`; drop the obsolete missing-published-snapshot case. Verify with `pnpm --filter @lacecms/sdk test`.

## 6. Render core and Astro adapter

- [x] 6.1 Add `RenderableMedia`, optional `RenderableEntry.media`, `ImageDescription`, the `image` block prop and the `missing_media` error code in `packages/render` per design D7. Tests: description with dimensions, caption and `25% 40%` object position; two-decimal rounding; no focal point → no `objectPosition`; usage alt precedence; missing media error naming identifier and block context; fallback without `entry.media` uses `mediaUrl`. Verify with `pnpm --filter @lacecms/render test`.
- [x] 6.2 Pass the describer through `LaceBlocks.astro` unchanged in its props and update `packages/astro/src/index.test.mjs` fixtures to the new export shape with a component that reads `image()`. Verify with `pnpm --filter @lacecms/astro test`.

## 7. Block sources and sites

- [x] 7.1 Rewrite `registry/astro/image/ImageBlock.astro` (revision 3) and `registry/astro/hero/HeroBlock.astro` (revision 2) per design D8, copy them byte-identically to `apps/site`, `packages/create-lace/templates/site` and `tests/fixtures/existing-astro-site`, and update revisions and hashes in each `lace.site.json`. Verify with `pnpm exec vitest run tests/block-sources.test.mjs` and `pnpm --filter @lacecms/cli test`.
- [x] 7.2 Convert `apps/site/src/fixtures/published-export.json` to the new shape with a media dictionary (hero media with alt, dimensions and focal point; post image overriding alt; note image without any alt) and keep the draft-leak sentinel out of the output. Update `apps/site/src/fixture-build.test.mjs` to assert alt text, `width`, `height` and `object-position` on the hero, post and note images. Verify with `pnpm --filter @lacecms/app-site test`.
- [x] 7.3 Update the existing-site fixture and onboarding/regression tests that build fake exports (`tests/existing-astro-site.test.mjs`, `packages/create-lace/src/onboarding.test.mjs`, `tests/regression-helpers.test.mjs`, `scripts/existing-site-acceptance.mjs`) to the new shape. Verify with `pnpm exec vitest run tests/existing-astro-site.test.mjs tests/regression-helpers.test.mjs` and `pnpm --filter create-lace test -- onboarding`.

## 8. Template 0.23.0 and documentation

- [x] 8.1 Move `TEMPLATE_VERSION` and `packages/create-lace/templates/.lace/upgrade-instructions.json` to `0.23.0`; add `database[]` notes for `0005_content_model_structure` and `0006_media_descriptive_metadata` (Compose and D1 sequences) and a `configuration[]` note for the public shape break, `lace add block image hero` adoption and the `image` model version + `pnpm content:sync` step; document `image()`/`media()` in the managed `templates/docs/lace-astro-site.md`. Update tests asserting `0.22.0` (`packages/create-lace/src/index.test.mjs`, `packages/cli/src/upgrade-command.test.mjs`) and refresh `tests/fixtures/generated-project/*.json`. Verify with `pnpm --filter create-lace --filter @lacecms/cli test` and `pnpm exec vitest run tests/generated-project-acceptance.test.mjs`.
- [x] 8.2 Add the unreleased public-contract note to the alpha release line in `docs/compatibility.md`, and update other repository docs that show the old public shape or `mediaUrl`-only blocks (`docs/personal-site-guide.md`, `docs/node-api.md` or others found by `grep -rn "entry.published\|\"draft\"" docs`). Verify with `pnpm format:check`.

## 9. Acceptance scripts

- [x] 9.1 In `scripts/generated-project-acceptance.mjs`, save blocks at their current definition versions, set the uploaded media's alt text and focal point through `PATCH /api/v1/admin/media/:mediaId`, and extend `verifyRenderedMedia` to require the hero media alt, the `image` block alt, `width`/`height` equal to the uploaded dimensions and the `object-position` style; update the starter journey's fixture slicing to the new export shape. Verify with `pnpm exec vitest run tests/generated-project-acceptance.test.mjs` and, when the local stack is available, `pnpm acceptance:starter`.
- [x] 9.2 Update `scripts/cross-runtime-api.mjs`, `scripts/cross-runtime-astro.mjs`, `tests/d1-http-budgets.acceptance.mjs`, `scripts/block-order-acceptance.mjs` and `scripts/publication-visibility-acceptance.mjs` to the new shape (no mirrored draft; dictionaries equal the published references; media origin canonicalized; `image` blocks at version 2) and record any changed D1 request budgets. Verify with `node --check` on the scripts and the D1 budget acceptance when the local Worker is available.

## 10. Verification and roadmap

- [x] 10.1 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm openapi:check` and `pnpm exec openspec validate ce03c-public-delivery-contract --type change --strict`; fix any failure.
- [x] 10.2 Add the CE3C session log row to `docs/content-editor-roadmap.md` and mark step CE3 done in the delivery overview. Verify with `pnpm format:check`.
