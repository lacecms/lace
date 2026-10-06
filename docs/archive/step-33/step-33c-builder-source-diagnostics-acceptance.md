# Session 33C — Builder source policy and failure diagnostics acceptance

Completed 2026-10-05 on `codex/step-33-alpha2-field-trial-fixes`.

## Delivered behavior

The disposable source copy excludes exact installation-root `AGENTS.md` and
`CLAUDE.md` entries before inspecting them. All other included links fail without
following their targets. Missing, unreadable and special entries have specific
source reasons. The twelve closed reasons survive dispatch and SQLite/D1
persistence; source failures may carry a validated installation-relative ASCII
path up to 512 characters. Invalid paths are omitted. Authenticated responses
are bounded to 1024 UTF-8 bytes before parsing.

Path-bearing errors use validated JSON in the existing `site_builds.error` TEXT
column; legacy reason-only errors remain readable. No migration is needed.
Outbox errors and correlated logs contain only a reason code. Admin list/detail
expose `error` and optional `errorPath`; Builds shows the build ID, fixed
explanation and correction. Read and retry permissions retain their existing
behavior. Deploy API, dispatcher, admin and builder coherently; the builder and
consumer operations guides document downgrade handling.

## Packed production consumer

Command: `pnpm acceptance:builder-diagnostics`.

The passing run built from the working tree based on
`e207322123369a48819bd605ecfec9a2b890ef28`, including this change. The harness
built and packed the consumer dependency graph from this repository, generated
an independent existing Astro parent with a `cms/` child, and installed the
packed packages. Its existing-site journey first verified host build selection,
public media, styling hooks and preserved operator block edits. Production
images came from the current API and builder Dockerfiles, locally tagged
`lace23cfd8691eff9-api:local` and `lace23cfd8691eff9-builder:local`.
No published alpha image or repository example site supplied the build source.
Compose configuration verified the parent source bind was read-only and the
selected project was `.`. Disposable operator-owned pnpm configuration declared
`minimumReleaseAge: 0` for freshly packed/current dependencies; builder commands
and production dispatch policy were unchanged.

| Injected input | Authenticated builder, storage and REST diagnostic | Attempts | Previous release | Corrected admin Retry |
| --- | --- | --- | --- | --- |
| Root `CLAUDE.md -> AGENTS.md` | Successful initial build; service documents excluded | — | Initial complete release published | — |
| In-site link | `source_symlink`, `src/linked.astro` | 8 | Preserved | New successful release |
| Outside-root link | `source_symlink`, `src/escaping` | 8 | Preserved | New successful release |
| Unreadable included entry | `source_unreadable`, `src/unreadable` | 8 | Preserved | New successful release |
| Missing required lockfile | `source_missing`, `pnpm-lock.yaml` | 8 | Preserved | New successful release |

The actual non-root builder identity was UID 1000. Each fault independently
verified the direct authenticated response, structured persisted build error,
code-only outbox error, list/detail DTOs and browser Builds explanation, path
and build ID. Eight genuine dispatcher attempts reached terminal failure.
Only the isolated event's `available_at` was advanced between attempts, guarded
by its known ID and unprocessed/unlocked state; attempts, leases and statuses
were never manufactured. Failed builds retained both the `current` pointer and
served HTML. After restoring source, the browser administrator clicked Retry;
a new successful row had no diagnostic, the pointer advanced and baseline HTML
remained unchanged. Old failed rows stayed inspectable.

An outside secret sentinel, bootstrap credentials, cookies and tokens were
checked against browser output and builder/dispatcher logs. Absolute source
paths were also rejected in logs. Source unit tests verify excluded targets and
included link targets are never copied. The harness reported `result: passed`,
then removed its Compose services/volumes and disposable consumer files.

## Verification

Focused tests cover domain normalization, standalone-builder parity, source
copying, runner/server authorization and release atomicity, bounded Node
response parsing, dispatch leases/retries, SQLite/D1 legacy and structured
storage, reopen/readback, stale claims, REST contracts and Node/Worker reads,
and Builds guidance and admin/editor/viewer permissions. Generator tests and
six byte-stable generated-project snapshots verify the operations guide update.

Commands used include:

```sh
pnpm --filter @lacecms/domain test
pnpm --filter @lacecms/app-builder test
pnpm exec vitest run tests/builder-diagnostics.test.mjs
pnpm --filter @lacecms/platform-node test
pnpm --filter @lacecms/platform-cloudflare exec vitest run src/repository-contract.test.mjs
pnpm --filter @lacecms/platform-cloudflare exec vitest run src/worker.test.mjs -t 'source diagnostics|scheduled'
pnpm --filter @lacecms/contracts test
pnpm exec vitest run packages/server/src/app.test.mjs -t build
pnpm --filter @lacecms/app-admin exec vitest run src/pages/builds/BuildsPage/BuildsPage.test.tsx
pnpm --filter create-lace test
node scripts/generated-project-acceptance.mjs snapshots --update
pnpm acceptance:builder-diagnostics
pnpm typecheck
pnpm lint
pnpm format:check
pnpm openapi:check
pnpm exec openspec validate step-33c-builder-source-diagnostics --type change --strict
```

All focused checks and root gates passed. Local listener, D1/workerd and Docker
checks ran with local socket access. Oxlint retains four pre-existing
`no-new-array` warnings in DB bound tests and reports no errors. The final D1
reopen/retry diagnostic contract also passed independently after its readback
assertion was added.

## Session boundary

This establishes local packed Node/VPS production evidence for 33C and portable
D1/Worker diagnostic parity. It does not change the build lifecycle or establish
33D–33H, a published alpha release, or production Cloudflare deployment evidence.
