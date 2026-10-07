# Step 34A verification

Verified locally on 2026-10-07 with Node `24.12.0`, pnpm `12.3.4`, Vitest `5.0.0`,
Playwright `1.63.0`, Miniflare `5.20260903.0-alpha` and Docker `29.4.0` on macOS
arm64. Branch: `codex/step-34-local-mvp-verification`. No npm publication, image
push, remote release, account mutation or real VPS/Cloudflare deployment was
performed.

## Contract-freeze decision

Retain the current v1 public entry DTO for compatibility. Its `draft` mirrors the
published snapshot; successful public entries contain `published` even though
the shared content-entry schema makes it optional. A later editorial draft must
never appear in public reads or exports. `createPublishedSiteLoader` supplies the
immutable published-only site view without draft properties or editorial metadata.
This agrees with `rest-contracts`, `public-sdk` and `published-site-loader` and
is recorded in architecture §13. Contract, SDK and render public types are
unchanged; no database or consumer migration is required. A dedicated public
wire schema requires a separately reviewed contract migration.

## Source verification

The implementation is committed at `041f5fe8c49ea0b81bb63303c2fe40fedc9731d5`.
The aggregate run uses that production code with one uncommitted verification
script correction (excluding historical artifact snapshots) and the new reviewed
inventory. These changes are included with the final evidence/archive commit;
the prepared shipping code remains exactly the clean implementation revision.

| Check | Result |
| --- | --- |
| Shared repository contracts | 72 tests, two files: Node SQLite runs the common cases with file-backed and in-memory databases; local D1 runs the same cases |
| API/Astro/browser parity | One combined suite explicitly runs both Node and Worker, asserts shared fixtures and compares the two canonical manifests |
| SDK/render/site | 99 tests, four files |
| Release/generator/CLI and runner | 98 tests, six files |
| Editor/session/router/Builds | 65 tests, three files |
| Generated snapshots | All six modes match two byte-stable regenerations |
| Root quality | Typecheck, Oxlint, Oxfmt, release model and strict OpenSpec validation passed before candidate preparation; repeated at finalization |

The aggregate JSON reporters assert success, nonzero executed tests and zero
skipped/todo/failed cases. Historical snapshots are excluded and are not counted
as current-source coverage.

Commands used:

```sh
pnpm exec vitest run --config vitest.cross-runtime.config.mjs
pnpm --filter @lacecms/app-admin exec vitest run src/pages/entry/EntryPage/EntryPage.test.tsx src/app/AdminApp/AdminApp.test.tsx src/pages/builds/BuildsPage/BuildsPage.test.tsx
pnpm exec vitest run tests/release-model.test.mjs tests/cross-runtime-runner.test.mjs packages/create-lace/src/index.test.mjs packages/cli/src/upgrade-command.test.mjs packages/cli/src/blocks-command.test.mjs packages/cli/src/blocks-registry.test.mjs --exclude '.release-artifacts/**' --exclude '.lace-acceptance/**' --maxWorkers=2
node scripts/generated-project-acceptance.mjs snapshots --update
pnpm typecheck
pnpm lint
pnpm format:check
pnpm release:check
pnpm exec openspec validate step-34a-cross-runtime-browser-verification --type change --strict
```

The aggregate additionally runs the selected repository and SDK/render/site suites
with JSON reporters and the same explicit exclusions.

## Runtime scenarios and canonicalization

Fixtures create migrated owned databases, a uniquely named MinIO container for
Node, local D1/R2 for Worker, ephemeral loopback listeners and real Better Auth
sessions for admin/editor/viewer. Setup uses the real bootstrap and user APIs.
Ordinary `.lace` development state is untouched. Cleanup runs on setup failure,
scenario failure, success and interruption; no `lace-34a-*` containers remained
after the completed source runs.

Both actual composition roots pass common expectations for creation/full-draft
save, concurrent revision conflict, publication/replay, route conflict, cursor
pagination, denied role/token operations, media upload/reuse and public media
visibility, terminal failed-build history/retry, published-only public reads and
authenticated build exports. Strong and weak conditional ETags return 304 with
no body and the expected validator. Shared schemas validate JSON response shapes;
statuses, codes, revisions, ordering, headers and publication values have separate
assertions. Draft/unpublished sentinels and credentials are rejected in exports,
SDK views and rendered output.

Browser scenarios use real backends for role permissions, block editing and
keyboard ordering, media reuse, publish/build failure, stale-revision local-value
retention and explicit reload, then backend-invalidated session recovery. Save
returns 403, leaving without saving reaches sign-in, real authentication resumes,
and the persisted draft still contains the previous authorized values. Axe audits
Content, Media, Editor and opened failed-build details; no rules are disabled.

Astro consumes an authenticated HTTP export from each runtime. Both builds emit
`/`, `/about`, `/blog/alpha` and `/blog/beta` with matching published values and
ordered blocks. The canonical site projection retains path, model key, slug,
title, fields and each block's key/type/position/schemaVersion/data. It excludes
runtime-generated entry/snapshot identities, actors and times from comparison;
revisions and published versions are asserted separately. Only the fixture's
returned cover ID is mapped to `<cover>`. Routes are sorted as sets, while block
order stays observable. The explicit public origin `https://media.34a.test/`
removes loopback-origin differences; emitted media references must name that
origin and the actual cover. The published-site loader exposes no draft-shaped
property or editorial metadata. Whole JSON/HTML snapshots are not scrubbed into
agreement.

## Defects found and fixed

- Opened Builds failure details measured 3.98:1 for destructive text on its tinted
  background. Explanatory paragraphs now use the existing foreground token.
  Source browser axe passes, and exact-candidate builder fault diagnostics now
  audit the opened details as well.
- EntryPage supplied only query errors to session recovery. Save, Publish and
  Reload draft mutation errors now use the existing recovery hook. Cache clearing
  waits for completed sign-in navigation so the unsaved-draft leave-or-stay dialog
  remains mounted. Focused tests cover all three errors and verify Stay retains
  local authoring. Authentication/authorization policy is unchanged.
- The first aggregate invocation included historical source tests because Vitest
  path filters also matched `.release-artifacts/*/source`. It was intentionally
  interrupted, reported `complete: false`, and left later phases `not-run`.
  Explicit artifact/temporary-directory exclusions correct the verifier. Earlier
  inflated diagnostic counts (258/299/319) are superseded by the table above.

## Exact candidate

Alpha.3's local npm publication receipt records publication on 2026-10-07. Its
artifacts and Step 33 evidence remain immutable; `publishedVersions` now prevents
its reuse. Registry metadata checked on 2026-10-07 returned 404 for all fifteen
alpha.4 npm packages and both versioned image manifests. This is availability
evidence, not a reservation. The selected replacement is `0.1.0-alpha.4`,
ownership template `0.18.0`, channel `next`. Historical upgrade instructions
remain, and the new guidance requires no database migration beyond alpha.3.

`pnpm release:prepare --output .release-artifacts/alpha-4` succeeded from clean
revision `041f5fe8c49ea0b81bb63303c2fe40fedc9731d5`, fingerprint
`81acb4f9b21da54e3d721ed0591b99a4fefd1c15298a942e5a81297ba6ceeae0`.
`pnpm release:verify` recomputed every archive checksum and confirmed
`complete: true`, `publicationEligible: true`. The reviewed inventory is
[step-34a-artifacts.json](./step-34a-artifacts.json): fifteen package archives and
API/builder images built, loaded and smoke-tested separately on `linux/amd64`
and `linux/arm64`. Image IDs are local config identities, not registry digests.

The complete aggregate command exited 0 with all seven phases passed. Its final
report and per-suite counts are retained in the reviewed inventory alongside the
interrupted fail-closed attempt. The exact-candidate consumer receipt reports
`passed` on `linux/arm64`, using the same fifteen package checksums and the two
host-platform image identities from the full inventory. It includes fourteen
journeys: snapshots, Node development-guide browser, Compose release, Cloudflare
Pages preview, publication visibility, existing Astro, Cloudflare consumer,
Pages tracking, template 0.4.0/0.14.0 upgrade, scenario guides, block order, weak
ETag, builder source diagnostics and Cloudflare credential separation.

All four builder faults (in-site/escaping symlink, unreadable source and missing
lockfile) reached terminal failure after eight attempts as UID 1000, preserved
the previous served release, passed the opened-details axe audit and succeeded
on explicit Retry after correction. Full candidate checks also verify generated
files, package/image filesystems, static output and diagnostics exclude secrets.
Final root typecheck, Oxlint, Oxfmt and strict change validation passed again.

## Reproduction and limitations

Use the pinned Node/pnpm toolchain, a running Docker daemon, access to the pinned
MinIO image and Playwright Chromium installed for `apps/admin`. No registry
publishing credentials or infrastructure account is required. Run:

```sh
pnpm verify:34a --artifacts .release-artifacts/alpha-4 --baseline docs/archive/step-34/step-34a-artifacts.json
```

The command checks prerequisites and exact inventory identity, builds workspace
dependencies, runs repository/API/browser/Astro/SDK suites, then performs full
release acceptance. It prints its ignored `.lace-acceptance/step-34a-*` report
path and fails on a required failed, skipped or unavailable phase. Controlled
runner tests cover intermediate failure, missing prerequisites and zero/skipped/
todo test reports. Owned resource teardown is separate from ordinary development
storage.

Local Miniflare D1/R2 and provider stubs are simulation. The API fixtures expedite
owned outbox retries and inject a controlled failed trigger; they do not verify
real provider deployment, retry timing or remote D1 budgets. Preparation smokes
cover both image platforms; full consumer journeys run only on host arm64.
Sessions 34B/34C, owner VPS/Cloudflare acceptance and stable-release approval
remain open. No acceptance result is publication authorization.

## Finalization

All fifteen OpenSpec implementation tasks are complete. The
`cross-runtime-product-verification` capability and updated
`alpha-release-artifacts` coordinates are synchronized into main specs; strict
validation passes all 64 accepted capabilities. The change is archived at
`openspec/changes/archive/2026-10-07-step-34a-cross-runtime-browser-verification`.
The roadmap marks only 34A complete. Implementation and evidence/archive are
separate commits so the exact candidate retains its clean build revision.
