## 1. Journey modules and stage names

- [x] 1.1 Move `scripts/alpha-six-acceptance.mjs`, `alpha-seven-acceptance.mjs`, `alpha-eight-acceptance.mjs` and `consumer-34b-security.mjs` to `scripts/journeys/` under the names in design decision 1, rename their exports, and update the imports in `generated-project-acceptance.mjs` and `cloudflare-consumer-acceptance.mjs`; verify `node --check` on each file and `grep -rn "alpha-six\|alpha-seven\|alpha-eight\|consumer34b\|34b-\|34c-" scripts tests` returns nothing.
- [x] 1.2 Rename acceptance stage names, receipt labels and `console.info` prefixes in `generated-project-acceptance.mjs`, `cloudflare-consumer-acceptance.mjs` and the journey modules so each describes the verified behavior (`node-contracts-media`, `gif-proxy-cache`, `list-settings-mcp-proxy`, `consumer-security-probes`, `live-host-<script>`, `packed-restore-rotation`, `template-upgrade`); verify `grep -rn "34[ABCabc]\b\|alpha-\(six\|seven\|eight\)" scripts` returns nothing and `grep -n "stage\|phase" scripts/release-evidence.mjs scripts/release-verify-published.mjs` shows no stage-name matching.

## 2. Verification runners and Vitest config

- [x] 2.1 Create `vitest.verification.config.mjs` with projects `cross-runtime`, `operations`, `resilience`, `security-static` and `d1-budgets` carrying each former config's `include`, `fileParallelism`, `maxWorkers`, `testTimeout` and `hookTimeout`; delete the five `vitest.<name>.config.mjs` files; verify `pnpm exec vitest list --config vitest.verification.config.mjs --project d1-budgets` lists exactly `tests/d1-http-budgets.acceptance.mjs`.
- [x] 2.2 Point the three runners at `--config vitest.verification.config.mjs --project <name>`, rename result directories to `.lace-acceptance/verify-{cross-runtime,security,operations}-*`, rename temporary directory prefixes (`lace-34c-` → `lace-operations-`) and drop `34A`/`34B`/`34C` from log lines and usage strings; verify each runner's `--help`/usage output and `grep -n "34" scripts/*-verification.mjs` returns nothing.
- [x] 2.3 Rename root scripts `verify:34a`, `verify:34b`, `verify:34c` to `verify:cross-runtime`, `verify:security`, `verify:operations` in `package.json`, and update `docs/local-operations-verification.md`, `docs/local-security-verification.md` and any other mention; verify `grep -rn "verify:34" --exclude-dir=node_modules --exclude-dir=.git . | grep -v "openspec/changes/archive\|docs/archive"` returns nothing.
- [x] 2.4 Rename `LACE_34B_API_IMAGE`, `LACE_34B_BUILDER_IMAGE`, `LACE_34B_MINIO_IMAGE`, `LACE_34C_EVIDENCE` and `LACE_34C_PACKED_ROOT` to `LACE_VERIFY_API_IMAGE`, `LACE_VERIFY_BUILDER_IMAGE`, `LACE_VERIFY_MINIO_IMAGE`, `LACE_VERIFY_EVIDENCE` and `LACE_VERIFY_PACKED_ROOT` in `scripts/`, `tests/`, and docs; verify `grep -rn "LACE_34" --exclude-dir=node_modules --exclude-dir=.git . | grep -v "openspec/changes/archive\|docs/archive"` returns nothing.
- [x] 2.5 Run `pnpm verify:operations` and `pnpm verify:security` (source phases, no artifacts) and confirm their `result.json` phase lists equal the lists produced before this change; record both result paths in the change's verification note.

## 3. Template fixtures and upgrade journey

- [x] 3.1 Delete `tests/fixtures/template-0.4.0`, `template-0.14.0`, `template-0.30.0`, `tests/template-0.4.0-fixture.test.mjs` and `tests/template-0.14.0-fixture.test.mjs`; verify `ls tests/fixtures | grep template` prints only `template-0.35.0`.
- [x] 3.2 Add `tests/template-fixture.test.mjs` that discovers every `tests/fixtures/template-*/{default,cloudflare}.json`, asserts `provenance.templateVersion` equals the directory's version, `provenance.sourceRevision` and generator digests are present, and every managed file's SHA-256 matches its manifest record; verify it passes and fails when one fixture byte is altered in a temporary copy.
- [x] 3.3 Make `scripts/template-upgrade-acceptance.mjs` derive its variant list from the fixture directories (default and Cloudflare per retained template, conflict file `deploy/nginx.conf`), remove the `0.14.0` database-step branch and the `0.4.0`/`0.14.0`/`0.30.0` references, and rename the stage to `template-upgrade`; verify `pnpm exec node scripts/generated-project-acceptance.mjs upgrade` passes the upgrade phase locally.
- [x] 3.4 Update `docs/compatibility.md` (supported upgrade origin is the latest published template; archived verification links replaced by archived change paths) and the generated-project acceptance description in `DEVELOPMENT.md`; verify `grep -n "0\.4\.0\|0\.14\.0" docs/compatibility.md DEVELOPMENT.md` shows only historical version-table rows.

## 4. Traceability maps and placeholder command

- [x] 4.1 Delete `tests/feedback-map.mjs`, `tests/onboarding-feedback-acceptance.test.mjs` and `tests/alpha-2-feedback-acceptance.test.mjs`; rename `tests/field-trial-acceptance.test.mjs` to `tests/acceptance-helpers.test.mjs`; verify `pnpm exec vitest run tests/acceptance-helpers.test.mjs` passes.
- [x] 4.2 Delete `scripts/not-implemented.mjs` and the root `test:integration` script; verify `pnpm test:integration` reports an unknown script and `grep -rn "not-implemented\|test:integration" --exclude-dir=node_modules --exclude-dir=.git . | grep -v "openspec/changes/archive\|docs/archive"` returns nothing.

## 5. Superseded change and ignore rules

- [x] 5.1 Move `openspec/changes/video-a-media-upload-delivery` to `openspec/changes/archive/2026-11-01-video-a-media-upload-delivery-superseded` and add `SUPERSEDED.md` naming the embed-first decision, the archived `video-embed-block` and `sm01-video-embed-playback` changes and that no task was applied; update the backlog bullet; verify `pnpm spec:validate` passes and `ls openspec/changes` lists only `archive` and active `rf01*` changes.
- [x] 5.2 Add `packages/platform-node/*.sqlite*` to `.gitignore`; verify `git status --short` no longer lists `packages/platform-node/lace.sqlite` and `git check-ignore packages/platform-node/lace.sqlite-wal` succeeds.

## 6. Script catalog and orphan guard

- [x] 6.1 Add a "Script catalog" section to `DEVELOPMENT.md`: one table row per root `package.json` script with group (development, quality, verification, acceptance, release, documentation, database, compatibility), purpose and the file it runs; verify every root script name appears exactly once in the table.
- [x] 6.2 Add `tests/root-scripts.test.mjs` per design decision 5 (dangling targets, orphaned `scripts/` files, missing catalog rows, forbidden prerelease or step identifiers in script names, file names and `LACE_*` variables read by scripts); verify it passes, then fails in each of the four ways when a temporary script, file or row is added or removed.
- [x] 6.3 Confirm `scripts/make-api-runtime.mjs` (Dockerfile) and every other `scripts/*.mjs` is referenced by the guard's graph; verify the test output lists zero orphans.

## 7. Documentation and gates

- [x] 7.1 Update `docs/mvp-architecture.md` §20 and §21 where they name `verify:34*` or step-34 records so they name the commands by purpose, and add the implementation row to the `docs/refactoring-roadmap.md` progress log; verify `grep -n "verify:34\|34[ABC]\b" docs/mvp-architecture.md` returns nothing.
- [x] 7.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm openapi:check` and `pnpm spec:validate`; verify all pass and record the root test count against the baseline count minus the three deleted tests plus the two added files.
- [x] 7.3 Run `pnpm acceptance:starter` and `pnpm exec node scripts/generated-project-acceptance.mjs upgrade` separately end to end; inspect the release receipt construction in code and verify it names `template-upgrade`, `node-contracts-media`, `gif-proxy-cache`, `list-settings-mcp-proxy` and `consumer-security-probes` and contains no `alpha-` or `34` stage names. These source-mode runs do not create a release receipt; full exact-artifact release acceptance is a separate gate (owner decision, 2026-11-01).
