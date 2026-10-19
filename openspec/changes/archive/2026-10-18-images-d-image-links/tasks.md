## 1. Block definitions

- [x] 1.1 Add the shared `link` URL field (design D1) to `image` (version 4, identity migration 4) and to the `gallery` item group (version 3, identity migration 3) in `packages/content/src/index.ts`; update content unit and type tests for migration from versions 1 and 3, safe and unsafe links on the block and on an item, metadata label and description (block-registry spec)
- [x] 1.2 Bump root `lace.config.ts` models (`home` 7, `about` 6, `posts` 7, `notes` 6) and re-pin affected fixtures and tests: config projection fixture, config hash and evolution tests, `apps/api` project-config/content-sync/node-server tests, `packages/platform-cloudflare` worker test

## 2. Registry components

- [x] 2.1 Render the link wrapper and precedence (design D2) in `registry/astro/image/ImageBlock.astro` (revision 6, blockVersion 4) and `registry/astro/gallery/GalleryBlock.astro` (revision 3, blockVersion 3); update their `item.json` (block-source-registry spec)
- [x] 2.2 Extend `packages/astro/src/registry-blocks.test.mjs` with the linked image over an enabled lightbox, the mixed gallery, the alt/caption/URL naming fallbacks and the unchanged unlinked output; update CLI registry/site/command tests for the new revisions and hashes

## 3. Reference site and existing-site fixture

- [x] 3.1 Copy the components into `apps/site`, update `lace.site.json`, add the link rule to `site.css`, extend the fixture export and `fixture-build.test.mjs` for the linked image and gallery item (astro-reference-site spec)
- [x] 3.2 Update `tests/fixtures/existing-astro-site` components and lock and `tests/existing-astro-site.test.mjs`

## 4. Starter template 0.34.0

- [x] 4.1 Starter `lace.config.ts` (`home` 4, `posts` 4), site components, `lace.site.json` and `global.css` link rule; set `TEMPLATE_VERSION` to `0.34.0`
- [x] 4.2 Add the 0.34.0 upgrade instruction (design D4) and the site-guide text (link field, precedence, `link` part); refresh generated-project snapshots and create-lace tests; add a 0.33.0 → 0.34.0 case to `packages/cli/src/upgrade-command.test.mjs` (project-generator spec)

## 5. Cross-runtime expectations

- [x] 5.1 Update `scripts/cross-runtime-astro.mjs` and `tests/fixtures/cross-runtime/expected.json` (and other acceptance scripts pinning block versions or image markup) and run the cross-runtime product phase

## 6. Documentation

- [x] 6.1 Update `docs/mvp-architecture.md` (built-in block list, §13.5 registry components), `docs/site-styling.md` (`link` part) and `backlog.md` (record D)

## 7. Verification

- [x] 7.1 Run focused tests (content, config, astro, cli, create-lace, app-site, api, platform-cloudflare), then root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` and `pnpm exec openspec validate images-d-image-links --type change --strict`
