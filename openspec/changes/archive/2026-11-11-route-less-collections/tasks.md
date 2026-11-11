## 1. Architecture and decision record

- [x] 1.1 Update `docs/architecture/content-configuration.md` ("Content-model kinds", "System fields and routes", the schema-evolution table and its route row) and `docs/architecture/api.md` (public reads, build-export `records` phase, format 2 kept) for route-less collections, and add ADR 0031 (route-less collections, design D1–D5) to `docs/adr/` and its README index; verify `pnpm vitest run tests/docs-links.test.mjs tests/architecture-document.test.mjs` passes

## 2. Configuration, validation and domain

- [x] 2.1 Make `route` optional for collections in `packages/config/src/models/types.ts` and `define.ts`, skip route-less models in the collision checks of `configuration/define-config.ts`, reject `seo` on a route-less collection in `models/seo.ts`, and emit no `route` in `structure/canonical.ts` when absent (design D1); verify config tests cover every scenario of "Collections may omit their route" and "Reject SEO on a route-less collection", routed-collection hash fixtures stay unchanged, and `define.type-test.ts` accepts `defineCollection` without `route`
- [x] 2.2 Pass routability to `validateEntryPayload` in `@lacecms/content` (`entries/aggregate.ts`): `slug_not_allowed` for any route-less slug, slug required at publication only for routed collections (design D3); verify content tests cover both new content-validation scenarios and the modified "Require a collection slug at publication"
- [x] 2.3 Add the route-less collection variant to `ContentModelRoute` and a `hasPublicRoute` predicate in `packages/domain/src/content/routes.ts`, returning `undefined` from `contentPublicPath`, and replace path-related `kind === "global"` checks in domain and application with it (design D1); verify domain tests cover "Route-less collection entries have no public path" and the global scenarios still pass

## 3. Application use cases, links and synchronization

- [x] 3.1 Thread routability through draft normalization, create/save/publish/duplicate in `packages/application/src/content/` so route-less publication resolves no path and still advances published state and requests a build; verify application tests cover the content-use-cases scenarios (publish without route, create with slug rejected, unpublish)
- [x] 3.2 Map resolver statuses of route-less collection targets to `non-routable` in `content/internal-links.ts` / `draft-validation.ts`, and pass the configured route-less model keys to the link-target listing so the picker excludes them (design D7); verify `internal-links.test.ts` covers "A route-less entry is a source but not a target" and "Linking to a route-less entry"
- [x] 3.3 Report route add/remove as a `breaking` route change in `configuration/structure-diff.ts` without a kind change, and add removal evidence (snapshots holding a slug, reference locations targeting the model) to `configuration/evidence.ts` with refusal diagnostics (design D8); verify `structure-diff.test.ts`, `evidence.test.ts` and `plan.test.ts` cover the four schema-evolution scenarios

## 4. Persistence and delivery (shared by Node and D1)

- [x] 4.1 Add record SQL to `packages/db/src/delivery/public.ts` (published collection entries without a published route, design D2) and a `listPublicRecords` read in `reads/content-reader.ts` ordered by published time and ID descending with its own cursor kind; verify db unit tests cover order, paging, media and the disjointness of records and routed entries
- [x] 4.2 Extend the build export in `packages/db/src/builds/export.ts` and `reads/content-reader.ts` with the records phase: record candidates after routed candidates, one `selectBuildExportPage` budget, the record range in the constant block/media/snapshot statements, and the optional `record` cursor position that old path cursors omit (design D4); verify export tests cover entries-only, entries-then-records, records-only, an oversized record alone on a page, cross-boundary media scoping and an old path cursor
- [x] 4.3 Add a route-less collection to the repository-contract fixtures in `packages/test-utils/src/repository-contract/` (lifecycle without route rows, records read, export phase with a small limit, `non-routable` targets and picker exclusion, sync refusal while published) and verify they pass on Node and local D1 through `pnpm turbo run test --filter=@lacecms/platform-node --filter=@lacecms/platform-cloudflare`

## 5. Contracts, server and OpenAPI

- [x] 5.1 In `@lacecms/contracts`, allow a collection model DTO without `route` (rejecting `path`/`seo` on it), add the public record and record-list schemas, and add `records` to the export page and assembled schemas — required in strict, defaulting to `[]` in tolerant variants, `BUILD_EXPORT_FORMAT_VERSION` unchanged (design D5); verify contracts tests cover the record scenarios, "A tolerant consumer reads an export without records" and that the strict variant rejects a page without `records`
- [x] 5.2 Register `GET /api/v1/public/records/:modelKey` in `packages/server/src/routes/public.ts`, return `404` from the collection list and slug reads for route-less models, send `records` on every export page, and regenerate `apps/api/openapi/api-v1.json`; verify server route tests cover "Published records are read", "Records of a routed model" and "A route-less model DTO", and `pnpm openapi:check` passes

## 6. SDK, Astro adapter and import CLI

- [x] 6.1 Add `listRecords` to the SDK client and assemble `records` with the order and entry-after-record checks in the export traversal (`packages/sdk/src/client/`); verify SDK tests cover "Public SDK reads published records" and the modified export assembly scenarios
- [x] 6.2 Add `PublishedRecord` and `site.records(modelKey)` with media, image and link lookups to `packages/sdk/src/site/published-site.ts` and `internal-links.ts`, include records as link sources, keep them out of `all`/`byPath`/`bySlug`/`entries()`/SEO/sitemap, and extend `invalid_export` checks (design D6); verify `published-site.test.ts`, `site-files.test.ts` and the Astro adapter tests cover the published-site-loader scenarios
- [x] 6.3 Refuse `slug` for route-less entries in `packages/cli/src/import-format.ts` (the shipped `lace-import.schema.json` already keeps `slug` optional and needs no change), allow many such entries per model, and match them only through the state file in `import-plan.ts`; verify `import-format.test.ts`, `import-plan.test.ts` and `import-schema.packaged.test.mjs` cover the three content-import-cli scenarios

## 7. Admin

- [x] 7.1 Add `hasPublicRoute(model)` to `apps/admin/src/entities/content/` and use it to hide the slug control, path facts, "Open on site" and SEO card in `EntryPage`/`EntryPublicationDetails`, to omit the slug cell in `CollectionEntries`, and to choose the route-less copy in `PublishEntryDialog`/`UnpublishEntryDialog` (design D9); verify admin unit tests cover the admin-draft-editor, admin-draft-editor-publication and admin-remote-state-and-lists scenarios
- [x] 7.2 Add a route-less collection to an admin e2e mock backend and an e2e journey (`e2e/route-less.e2e.ts`: list without slug, create and save without slug, publish, unpublish copy; link-picker exclusion is server-side and covered by the application and repository-contract tests); verify that e2e file and the admin unit suite pass

## 8. Documentation and bookkeeping

- [x] 8.1 Document route-less collections in the `apps/docs` content-modeling page and the public SDK page (`site.records`, `listRecords`, minimum SDK version), internal `docs/internal-url-links.md`, `docs/content-import.md` and `docs/configuration-synchronization.md`; replace the `include` advice in `packages/create-lace/templates/site/src/pages/sitemap.xml.ts` (no MCP tool description calls slugs mandatory, so MCP needs no change); also `docs/node-api.md`; regenerate generated-project snapshots with `node scripts/generated-project-acceptance.mjs snapshots --update`; verify `pnpm docs:check` and the snapshot phase pass
- [x] 8.2 Remove the route-less collections item from `backlog.md` (keeping bulk publication and the optional-slug deferral noted) and record the progress-log row in `docs/refactoring-roadmap.md`

## 9. Verification

- [x] 9.1 Run root typecheck, Oxlint, Oxfmt check, `pnpm test`, the cross-runtime verification project (`pnpm exec vitest run --config vitest.verification.config.mjs --project cross-runtime`), the source-layout boundary checker, `pnpm spec:validate` and `pnpm exec openspec validate route-less-collections --type change --strict`; verify all pass
