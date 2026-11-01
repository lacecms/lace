## 1. Architecture and planning documents

- [x] 1.1 Update `docs/mvp-architecture.md` §8 (`videoEmbed` bullet: version 2, `aspectRatio`/`playback` settings, ambient mode, reduced-motion and no-JS fallback) and §13.5 (script exception covers activation and ambient mounting; 16:9 becomes the default ratio); verify with `git diff` that no other invariant changes
- [x] 1.2 Mark SM1 `in progress` in `docs/site-migration-roadmap.md`; verify the overview table and step section agree

## 2. Content definition and canonical URLs

- [x] 2.1 Add `ambientSrc` to `VideoEmbedDescription` and build it in `parseVideoEmbed` with the fixed parameter order for YouTube and Vimeo (with and without privacy hash); verify new `packages/content` unit tests for both providers, privacy hashes and stripped input playback parameters, and that existing `src` expectations are unchanged
- [x] 2.2 Move `builtInBlocks.videoEmbed` to version 2 with required select settings `aspectRatio` (`16:9`, `4:3`, `1:1`, `4:5`, `9:16`, default `16:9`) and `playback` (`player`, `ambient`, default `player`), choice-card presentation with labels, descriptions and aspect diagrams, updated guidance and an identity migration to 2; verify content tests for definition metadata, defaults, rejected unknown values and the configuration projection
- [x] 2.3 Verify schema evolution: a configuration-sync test migrates draft, published and hidden version 1 `videoEmbed` blocks to version 2 with unchanged data, poster usage and envelope plus default settings, on SQLite and the D1 repository contract suite

## 3. Render core

- [x] 3.1 Expose `ambientSrc` through `describeVideoEmbed` with unchanged error behavior; update `packages/render` tests (`toEqual` descriptions, contextual `invalid_block_data`) and verify they pass

## 4. Registry component

- [x] 4.1 Update `registry/astro/videoEmbed/VideoEmbedBlock.astro` per design D4/D5: root `data-lace-aspect-ratio`/`data-lace-playback`, unchanged `player` markup, ambient template, no-poster `<noscript>` player, idempotent load-time ambient mounting with reduced-motion fallback, `inert` preview button and `data-lace-ambient` marker; verify Astro container tests in `packages/astro` for every mode × poster combination and that `player` output only gains the two hooks
- [x] 4.2 Update `VideoEmbed.css` per design D6 (ratio rules by data attribute with 16:9 base, ambient overlay, visually hidden source link undone on focus); verify registry tests assert no inline style and no `<style>` element
- [x] 4.3 Advance `item.json` to `blockVersion` 2 and the next revision, update `registry/registry.json` and the CLI bundled copy; verify `packages/cli` registry and `lace add block videoEmbed` tests, including the edited-component conflict and `.new` proposal
- [x] 4.4 Add a browser test of the built reference page: ambient iframe mounts once with the ambient URL and no tab stop, poster stays visible and inert, reduced-motion emulation yields player behavior, JavaScript disabled shows the noscript player and visible links, repeated initialization creates no duplicates; verify it passes in Chromium

## 5. Sites, templates and fixtures

- [x] 5.1 Raise model versions in root `lace.config.ts` that allow `videoEmbed`; update the api/server/worker tests that pin model lists or versions; verify `pnpm test` for affected packages
- [x] 5.2 Update `apps/site` component copy, `lace.site.json` hashes and `src/fixtures/published-export.json` (schema version 2, settings, a `1:1` ambient Vimeo block with poster and an ambient block without poster); verify `apps/site` fixture-build test and that the static HTML has no live ambient iframe
- [x] 5.3 Update the create-lace starter (`lace.config.ts` model versions, component copy, `lace.site.json`), bump `TEMPLATE_VERSION` and `.lace/upgrade-instructions.json` to 0.40.0 with the adoption steps (raise model versions, configuration sync, `lace add block videoEmbed`, `block_version_mismatch`), refresh generated-project snapshots; verify create-lace tests and `pnpm acceptance:starter`
- [x] 5.4 Update `tests/fixtures/existing-astro-site` copies and hashes; verify `pnpm acceptance:existing-site` and `tests/video-embed.acceptance.mjs` assertions for the new settings

## 6. Documentation

- [x] 6.1 Document aspect ratio, ambient playback, fallbacks, bandwidth advice and the WCAG 2.2.2 gap with an example pause control in `docs/site-styling.md`, the starter guide `templates/docs/lace-astro-site.md`, `docs/compatibility.md` and the public docs (`content-modeling`, `astro-integration`); verify the public docs check passes

## 7. Verification and completion

- [x] 7.1 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` and the CI steps in `.github/workflows/ci.yml` that cover acceptance and `spec:validate`; record results in `verification.md`
- [x] 7.2 Run `pnpm exec openspec validate sm01-video-embed-playback --type change --strict` and update the roadmap progress log; verify validation passes
