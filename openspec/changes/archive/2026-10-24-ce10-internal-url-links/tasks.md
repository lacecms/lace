## 1. Portable content and application contracts

- [x] 1.1 Implement canonical entry-token encode/decode and separate URL-field target validation in content; verify type/unit tests for opaque IDs, Unicode, encoded punctuation, noncanonical/malformed escapes, existing manual URLs and rejection in rich-text/provider/SEO hrefs (internal-url-links, content-validation).
- [x] 1.2 Add descriptor-driven reference collection and the independent 200-occurrence normalized snapshot limit across model/global fields and block data; verify exact pointers, nested defaults, duplicate targets, hidden blocks, plain-text/settings nonreferences, unchanged settings allowlist and 200/201 boundaries (internal-url-links, content-validation).
- [x] 1.3 Add version 1 Link through the public DSL with label/url and appearance/newTab settings; verify metadata/type inference, required/default semantics, existing built-in versions/hashes and preservation of the completed videoEmbed delta (block-registry).
- [x] 1.4 Define portable status/usage/receipt/read/write ports and stable domain/path issue codes; verify authorization precedes reads/mutations, receipts grant no permissions, and package-boundary checks remain valid (content-use-cases, internal-url-links).

## 2. Indexed SQL persistence and bounded read ports

- [x] 2.1 Add the forward migration, source-scoped reference table, target index, singleton graph revision and title-prefix index; verify fresh/upgrade migrations and foreign_key_check on Node/D1, unchanged legacy JSON and preservation of incoming rows after target deletion (design decisions 2 and 5).
- [x] 2.2 Implement Node reference diff/copy/remap/cascade maintenance and one conditional graph revision bump per atomic unit; verify save/publish/revert/duplicate/delete/unpublish contract tests, zero internal-reference writes on title-only saves and rollback fault injection (content-use-cases).
- [x] 2.3 Implement equivalent D1 guarded set-based mutations using bounded JSON rowsets; verify combined maximum blocks/media/internal references fit 100 binds, 40 mutation statements and 50 total invocation statements, including failure paths (d1-content-repositories).
- [x] 2.4 Implement indexed target search, 200-ID batch status reads and source/location impact keyset pages; verify literal search wildcards, globals exclusion, 1,000 inbound sources, 200 locations in one source, foreign/stale cursors, no eager graph totals and the stated read-statement bounds (rest-contracts, d1-content-repositories).

## 3. Lifecycle guards and schema synchronization

- [x] 3.1 Enforce delivered-target validity in publication preflight and final guarded commit, with candidate-route self-reference; verify unpublished/missing/global errors, first self-publication, mutual links, target route conflicts and source/target publication-removal races on both adapters (internal-url-links, content-use-cases).
- [x] 3.2 Add delete/unpublish impact acknowledgment and atomic graph/target guards; verify no-usage legacy requests, draft/hidden warnings, self-source exclusions, explicit confirmed removal, stale/cross-target/cross-action/cross-actor receipts, unchanged source JSON and idempotent unpublish replay after a lost response (content-use-cases, internal-url-links).
- [x] 3.3 Extend configuration/default/block migrations and existing field/block pruning to maintain outgoing projections and validate new published references; verify nested renames/reorder, hidden transitions, prospective route checks, unchanged unavailable tuples and interrupted resumable units (schema-evolution).
- [x] 3.4 Verify configuration sync and CLI retain the populated-model removal prohibition for pages, collections and globals, including linked targets; verify refusal before mutations and that existing destructive hints cannot bypass it, without adding a model-deletion operation or CLI impact override (schema-evolution).

## 4. HTTP contracts and build export

- [x] 4.1 Add strict status/picker/source/location/receipt DTOs and new error mapping; verify invalid/mixed/unknown queries, caps, actor/action binding and sanitized errors through contracts and server integration tests (rest-contracts).
- [x] 4.2 Wire authenticated admin target/status/impact routes and optional strict delete/unpublish acknowledgment bodies into existing handlers; verify read/write role parity, precondition behavior, row-action entry points and unreferenced-client compatibility on Node/Worker (rest-contracts, content-use-cases).
- [x] 4.3 Add exact delivered internalLinks manifests to public projections and format 2 exports; verify fields/data source areas, hidden/settings exclusions, per-page source scope, globals, byte accounting, two batches/twelve reads and ETag/version-change consistency without per-target lookups (rest-contracts, d1-content-repositories).
- [x] 4.4 Update OpenAPI and generated snapshots; verify strict/tolerant known-key behavior, required format-2 manifests, format-1 compatibility parsing and pnpm openapi:check (rest-contracts, public-sdk).

## 5. SDK, render core and canonical block sources

- [x] 5.1 Preserve manifests through export traversal and expose immutable site/entry/global link lookup; verify format 1/2 handling, old-SDK format rejection, later-page destinations, no extra fetches, duplicate IDs/locations and token-manifest mismatch failures (public-sdk, published-site-loader).
- [x] 5.2 Add total/first-100/truncated diagnostics and once-per-view callbacks; verify stable ordering, no secret/raw-content leakage, 304/repeated-render deduplication, unavailable-target success and transport/consistency failure (published-site-loader, internal-url-links).
- [x] 5.3 Add structural link resolver props through render core and Astro; verify manual fallback without a resolver, contextual missing_link_resolver/invalid_link errors, globals and required authored values retained for unavailable targets (render-core).
- [x] 5.4 Add the Link registry component and adopt resolution in image/gallery/navigation/Hero/CTA sources; verify both appearances/newTab, non-navigating labels, retained submenus/lightboxes, safe accessible names, envelope/CSS hooks and no token hrefs (block-source-registry).
- [x] 5.5 Advance source item revisions/package ranges and bundled registry copies; verify registry parity, installation/update/lock/hash conflicts and .new recovery without overwriting user-owned changes or altering existing block schema versions (block-source-registry).

## 6. Admin authoring and impact review

- [x] 6.1 Add the shared ordinary-URL mode/picker UI and deduplicated batched target status cache at editor scope; verify nested model/global fields and block data, explicit switch/clear behavior, missing-ID retention, debounced canceled search, unchanged settings controls, provider/rich-text exclusions and no per-control requests (admin-draft-editor).
- [x] 6.2 Extend entry and collection delete/unpublish dialogs with complete paginated impact, published acknowledgment and stale-receipt recovery; verify loading/error never appears as zero usage, permissions, keyboard/focus behavior, unsaved-value retention and network-retry idempotency (admin-draft-editor).
- [x] 6.3 Apply the client-only stable palette partition and add Link presentation metadata/icon; verify custom definitions/filtering/keyboard order, Hero then CTA trailing, and unchanged saved order/configuration hashes (admin-draft-editor).
- [x] 6.4 Add focused real-browser scenarios for URL selection, nested error reveal, unavailable targets, impact pagination/refresh and both Link appearances; verify viewer behavior and accessibility using the existing admin browser suite (admin-draft-editor, internal-url-links).

## 7. Maintained sites, compatibility and final verification

- [x] 7.1 Update reference/create-lace configurations, installed sources, diagnostic loaders, site-owned CSS and fixtures with correct model/template versions; verify generated/starter registry parity, both Link appearances, model/global URL examples and preservation of video/image/envelope behavior (astro-reference-site).
- [x] 7.2 Update architecture/backlog implementation status, compatibility, database migration, composite/media-link/authoring, source adoption and public documentation; verify examples show helper use and cover format-2 upgrade order, custom markup, external REST grammar adoption, manual URL/anchor limitations, forced-removal consequences and matching-backup rollback (design migration plan).
- [x] 7.3 Extend real Node and Worker API-to-export-to-Astro journeys for slug change, draft isolation, missing target confirmation, successful fallback build, recovery under the same ID, reused slug with another ID, hidden references and lost-response/race recovery; verify deployed-output fixtures contain no entry-token hrefs and publication is independent of build failure (all changed capabilities).
- [x] 7.4 Record query-plan and row-read/write evidence on representative high fan-out fixtures and complete invocation statement counts, including auth; verify indexed impact/picker queries, no per-link build I/O, zero internal-reference writes on title-only save and all declared caps (d1-content-repositories).
- [x] 7.5 Run the narrow affected suites and packed starter acceptance, then pnpm typecheck, pnpm lint, pnpm format:check and pnpm exec openspec validate ce10-internal-url-links --type change --strict; record actual results and keep synchronization/archive/release/deployment separate pending explicit owner requests.
