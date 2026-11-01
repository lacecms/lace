## 1. Sample package

- [x] 1.1 Generate two original JPEGs (`media/studio.jpg`, `media/workshop.jpg`, at most 50 KiB each, real dimensions) and write `apps/docs/public/examples/content-import/lace-import.json` for the starter configuration as in design D1 (tags, focal point, alt, caption, `settings`, Home with hero/richText/gallery and SEO image, posts `hello-lace` → `first-project` link); verify with `node packages/cli/dist/bin.js import apps/docs/public/examples/content-import --validate-only --publish` run from a copy of the starter `lace.config.ts` (exit 0)
- [x] 1.2 Add `tests/content-import-sample.test.mjs` (root suite): `--validate-only --json` against the starter configuration copy, exit 0, and equality of the public page's JSON block with the file (the comparison starts passing after 4.1); verify the test fails on a deliberately broken copy of the sample and passes on the real one

## 2. Workspace cross-runtime journey

- [x] 2.1 Add an optional `config` option to `openProductRuntime` in `tests/support/cross-runtime-fixture.mjs` (runtime composition and synchronization, default root config); verify `tests/video-embed.acceptance.mjs` still passes on both runtimes
- [x] 2.2 Write `tests/content-import.acceptance.mjs`: temporary project directory with the starter config inside the workspace, sample copy, CLI process runner with only `PATH` and `LACE_IMPORT_TOKEN`, import tokens issued and revoked through the admin REST API, and state snapshots (media ids/versions, draft and published revisions, build history) read with the administrator session
- [x] 2.3 Implement the per-runtime steps from the `cross-runtime-product-verification` delta: validate-only, dry run with unchanged state, `--publish` with media bytes/SHA-256/tags/metadata, resolved links, publication order and published export plus public media bytes; reruns with and without the state file unchanged; admin edit → `conflict` exit 2 with nothing written → `--overwrite` → unchanged rerun; publish refused for a token without publishing; revoked token exit 6; token absent from stdout/stderr
- [x] 2.4 Compare canonical plans, final drafts and published exports between Node and Worker (keys instead of IDs, no times or origins); add the file to `vitest.cross-runtime.config.mjs` and verify `pnpm exec vitest run --config vitest.cross-runtime.config.mjs` passes with Docker running
- [x] 2.5 Fix any CLI or server defect the journey exposes with a unit test in the owning package (`pnpm turbo run test --filter=<package>`), and record each defect in `verification.md`; if a fix changes accepted behavior, stop and update this change first

## 3. Packed generated-project smoke

- [x] 3.1 Add `scripts/import-smoke.mjs` (`importSampleSmoke`, design D4): token issue through REST with the journey session, sanitizer registration of the token, sample copy outside the project, `pnpm exec lace import --publish --json`, export check for `hello-lace`, `first-project` and `settings`, unchanged rerun
- [x] 3.2 Run `pnpm exec lace import <sample> --validate-only` from the generated project root in `starterJourney`; verify `pnpm acceptance:starter` passes
- [x] 3.3 Call `importSampleSmoke` at the end of `nodeJourney` with the Compose API origin; verify with `pnpm acceptance:generated` (Docker), or record in `verification.md` that it was not run and why
- [x] 3.4 Call `importSampleSmoke` in `cloudflareConsumerJourney` after the Astro build check, before the Worker stops; verify `pnpm acceptance:cloudflare` passes

## 4. Public and internal documentation

- [x] 4.1 Write `apps/docs/src/content/docs/en/latest/editing-content/import.md` (*Import content*): token, session-only `LACE_IMPORT_TOKEN`, Node and local Worker origins, validate/dry-run/import/rerun flow, options, plan states, conflicts, exit codes, limits, format v1 reference matching the JSON Schema, the sample JSON with download links, and *Write a converter*; verify `pnpm docs:check` and the 1.2 equality test pass
- [x] 4.2 Add the `lace import` row and the `LACE_IMPORT_TOKEN` row to `reference/cli-environment.md`; verify `pnpm docs:build`
- [x] 4.3 Write internal `docs/content-import.md` (tiers and commands, coverage and gaps, invariants, links to the public page and ADRs 0016/0017), add the topic-map sources in `docs/documentation-maintenance.md`, and update `packages/cli/README.md` (heading without the session label, link to the public page); verify `pnpm format:check`

## 5. Generated project guidance and template

- [x] 5.1 Add *Import content* to `packages/create-lace/templates/docs/lace-operations.md` (Node origin, Cloudflare origin inside the Cloudflare markers, token steps, validate/dry-run/import, reruns and conflicts, state file out of source control, link to the public page) and mention the command in `templates/README.md`; verify rendered guides for `--cloudflare` and default projects in create-lace tests
- [x] 5.2 Bump `TEMPLATE_VERSION` to 0.44.0, add the Template 0.44.0 configuration note in `.lace/upgrade-instructions.json` (guidance only, no migration, same-release CLI and server), refresh `tests/fixtures/generated-project/*.json` with `snapshots --update`, and adjust consumer-guide command extraction only if it treats the new commands as setup steps; verify create-lace tests and `tests/consumer-guides.test.mjs`

## 6. Verification and roadmap

- [x] 6.1 Run root `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (release test on pinned Node), `pnpm build`, `pnpm acceptance:starter`, `pnpm acceptance:existing-site`, `pnpm openapi:check`, `pnpm docs:check`, `pnpm spec:validate` and `openspec validate sm04c-import-runtime-verification-docs --type change --strict`, and write `verification.md` with results, which journeys ran on which runtime, and what was not run
- [x] 6.2 Update `docs/site-migration-roadmap.md`: SM4C wording (public guide plus internal note), progress log row, and SM4 status after verification
