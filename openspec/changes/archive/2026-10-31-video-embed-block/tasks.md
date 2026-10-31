## 1. Architecture and portable URL contract

- [x] 1.1 Update architecture §§8, 11 and 13 for videoEmbed, provider-restricted URL fields and the embed-only activation-script exception before implementation. Verify against the seven delta specs; retain image-only upload/storage scope and the embed-first backlog ordering.
- [x] 1.2 Implement the shared provider parser and URL `embedProviders` options, inferred types, canonical metadata and rehydration in packages/content and affected metadata consumers. Verify content unit/type tests cover every URL grammar family, Vimeo privacy hashes, invalid hosts/ports/credentials, duplicate/conflicting identifiers, invalid descriptor/default options, canonical provider ordering and unchanged hashes without the option.
- [x] 1.3 Apply provider restrictions consistently in compiled field schemas, recursive runtime validation and metadata-driven admin validation. Verify a shared acceptance/rejection corpus across definitions and serialized metadata, exact nested paths, missing draft values, publication requiredness and unchanged ordinary URL/rich-text behavior.
- [x] 1.4 Extend configuration evolution for adding, removing, narrowing and widening provider restrictions. Verify focused application tests, including nested fields and simultaneous changes where the stricter classification must win.

## 2. Built-in block and render description

- [x] 2.1 Define and export videoEmbed v1 using only the public DSL with required URL/title, optional poster/caption, label/guidance and no settings. Verify content and config tests for inferred block data, metadata, complete/incomplete drafts, publication, unchanged existing definitions and opt-in hashes.
- [x] 2.2 Export the pure embed describer from packages/render using the shared parser and existing contextual invalid_block_data errors. Verify render tests for both providers, canonical parameters, private Vimeo hash, context/path failures and no network access; preserve BlockProps compatibility and existing missing-media behavior.

## 3. Canonical renderer and installation

- [x] 3.1 Add registry/astro/videoEmbed component, structural stylesheet, revision-1 manifest and registry index entry. Render the direct iframe, optimized poster, optional escaped caption, source link and envelope/hooks. Verify Astro registry rendering tests for both providers, with/without poster, hidden blocks, title escaping, 16:9 geometry, focal point, fixed permission/referrer policy, no autoplay and no provider fetch during build.
- [x] 3.2 Add bounded local preview activation with inert template, keyboard-native button, one frame per block and focus transfer. Verify browser tests with intercepted provider requests: zero requests before activation, pointer/Enter/Space activation, independent multiple instances, repeated activation, reduced motion and usable source fallback without JavaScript. Stub provider frames so tests do not depend on real playback availability.
- [x] 3.3 Integrate CLI bundling/install/map/lock support for videoEmbed and its stylesheet through existing registry paths. Verify CLI registry/command tests for clean install, all-block selection, byte identity, local component/CSS conflicts and .new recovery without advancing active files or lock on conflict.

## 4. Maintained sites and lifecycle acceptance

- [x] 4.1 Update reference site, generated starter and existing-Astro guide fixture block sources/maps/locks, page allowlists and required model versions; regenerate affected snapshots through maintained paths. Verify tests/block-sources.test.mjs, create-lace/CLI generated-project tests, reference fixture build and generated starter build, without video providers or credentials.
- [x] 4.2 Add focused product tests for generic editor insertion, missing required fields, invalid provider URL errors, selecting/clearing an image poster, read-only viewer and stale-revision recovery. Verify no admin provider iframe requests and that existing image uploads/limits are unchanged.
- [x] 4.3 Verify save/publish/public export on Node and Cloudflare with and without poster, media usage/deletion protection, hidden posters and immutable published output after draft changes. Use focused existing application/server/runtime suites and confirm no SQL migration or upload/storage contract changes.

## 5. Documentation and final verification

- [x] 5.1 Update public block/media documentation, internal registry/render guidance and delivered generated guides according to the topic ownership map. Verify examples for both providers, private Vimeo hash, optional poster click-to-load, accessible title, no autoplay, provider restrictions/fallback, opt-in config sync and deferred video-file uploads. Record an optional manual playback smoke procedure without making automated tests depend on provider availability.
- [x] 5.2 Run narrow content/config/application/render/Astro/CLI/create-lace/admin and cross-runtime tests required above, followed by root pnpm typecheck, pnpm lint and pnpm format:check. Run pnpm exec openspec validate video-embed-block --type change --strict; record results and any external smoke-check limitation before completing the change.
