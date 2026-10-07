# 34B partial source verification through task 4.3

Recorded 2026-10-07 against dirty working tree based on `35273f425cace64ba20c6a4883fae34ae98f504c`. Progress: **11/18 tasks**. This supplements the earlier host/origin records; their pause descriptions are historical. No refreshed candidate, deployment, publication or complete 34B acceptance is claimed.

## Completed source work

- 3.2: the approved image plan was applied. The existing portable Worker complete-container parser now lives in application and both adapters use it. Node retains sharp dimensions/orientation. PNG/JPEG/WebP/AVIF trailing-data regressions pass. Relevant media/content/render/auth/builder tests: **190 passed across 10 files**.
- 3.3: shared auth logs discard provider message/argument payloads and emit fixed component/level/reason records. HTTP, runtime/provider and CLI injected credential scans pass, including deliberate-leak detection. Security/CLI/scanner tests: **23 passed across three files**. Actual SQLite/MinIO and D1/R2 authenticated exports built with Astro and static/child-output scans: **one acceptance test passed**.
- 4.1: shared SQLite (file and memory) / local D1 contracts inject real SQL mutation and deferred-FK commit failures, verify complete rollback and successful corrected retry. Focused repository/application suites: **115 passed across four files**. Actual MinIO/R2 upload failure, metadata-after-object failure cleanup, eight failed deletion attempts, terminal state and explicit corrected retry: **two acceptance tests passed**.
- 4.2: detached child processes report durable claim, are killed, restart from file SQLite or persisted Miniflare D1, reclaim after the 60-second lease, reject stale completion and commit success. Interrupted fixed builder keeps the old complete release served through an actual local HTTP server; corrected child retry switches to complete new output and retains the old release. **11 tests passed across two files**.
- 4.3: hook/Pages/Worker/application provider suites exercise acceptance, rejection, malformed/oversized responses, timeout, tracking terminal outcomes and deadline: **49 tests passed across four files** before the added Pages abort regression; the updated Pages suite passed **five tests**. Actual Node/MinIO and local Worker/D1/R2 admin browser acceptance: **two tests passed**, verifying all five terminal outcomes, permitted retry controls, HTTP 202 retry, durable publication after trigger exception and no promotion of the newer target version into succeeded history by accepted/unknown outcomes. The successful version here means the latest proven succeeded history record; this test does not claim a remote deployment was performed.

## Task 5.1 finding

Command: `pnpm exec vitest run --config vitest.d1-budgets.config.mjs`.

The instrumented binding now covers Drizzle `raw` reads as well as `first`, `all`, `run` and every batch member. Fixture/setup statements are excluded by resetting immediately before the measured request. The authenticated request, response consumption and any owned Worker waitUntil jobs finish before the result is recorded.

| Scenario | Fixture | HTTP | Statements | Maximum parameters | Response bytes | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Create | 200 image blocks, 200 distinct active media IDs/reference locations | 201 | 228 | 98 | 27085 | fails required <=50 statement budget |

`ContentUseCases.validateMedia` currently loads metadata once for each reference before the chunked write. Repository-only budget tests missed this overhead. The test deliberately remains failing; save/publish/201 cases exist but did not execute after the first assertion failed, so they have no acceptance result. Export sizes, dependency audit, complete runner and refreshed exact artifacts are not yet verified.

A proposed planning diff at `/private/tmp/lace-34b-d1-plan.diff` revises proposal, design, task 5.1 and the existing local-verification capability delta. It proposes bounded bulk metadata validation on both adapters, deduplicated lookup IDs with all reference locations retained, missing/inactive rejection, unchanged transactional guards and unchanged product/query limits. No DTO, schema migration, runtime dependency or export cap is proposed. The diff has not been applied; implementation awaits confirmation required by the update skill.

## Current checks and limitations

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm release:check`, `git diff --check` and `pnpm exec openspec validate step-34b-local-security-resilience --type change --strict` passed. Root lint retains four pre-existing `no-new-array` database-test warnings. Explicit Oxlint on new acceptance/child-process helpers also passed after moving cleanup error handling out of finally.

Tasks 5.1–6.4 remain unchecked. Historical 34A inventory is unchanged. Old images do not contain the shipped 34B fixes; candidate refresh and exact-artifact acceptance remain pending. Session 34C, real VPS/Cloudflare/TLS and remote capacity acceptance, publication and stable approval remain open.

## Later progress: approved D1 correction and audit finding

The owner confirmed `/private/tmp/lace-34b-d1-plan.diff`; all four proposed planning revisions were applied before implementation. Current progress is **13/18 tasks**. Earlier task 5.1 failure descriptions above are historical; the regression now passes. Tasks 5.3–6.4 remain open.

ContentUseCases collects reference locations without I/O, rejects more than 200 locations before metadata reads/writes, deduplicates lookup IDs and validates them through ContentMediaReadPort.loadMediaMany. SQLite and D1 implement bounded set-based reads; D1 uses <=100 parameters. Missing/inactive results retain the existing safe invalid-state failure, and repositories retain their transactional media guards. Complete reference locations remain stored even when IDs repeat. The in-memory contract double also implements the new port.

Shared use-case/server/SQLite/D1 repository tests: **136 passed across four files**; the additional explicit 201-reference/no-read/no-write regression then passed in the updated **27-test** test-utils suite. Maximal authenticated HTTP and export acceptance: **two tests passed**, with full saved/published values, duplicate references, last-chunk missing/inactive rejection and protected aggregate preservation. Detailed machine-readable results are in `step-34b-d1-budgets.json`.

| Invocation | Queries | Maximum parameters | Output bytes | HTTP |
| --- | --- | --- | --- | --- |
| Create 200 blocks/references | 30 | 100 | 27085 | 201 |
| Save 200 blocks/references | 36 | 100 | 26281 | 200 |
| Publish 200 blocks/references | 25 | 100 | 52465 | 200 |
| Read published 200 blocks | 3 | 2 | 52332 | 200 |
| Reject create 201 blocks | 2 | 1 | 214 | 422 |
| Reject save 201 blocks | 5 | 2 | 214 | 422 |
| Reject deleting media in final chunk | 7 | 100 | 98 | 422 |
| Reject missing media in final chunk | 7 | 100 | 98 | 422 |
| Save 200 locations with one repeated ID | 35 | 99 | 54103 | 200 |
| Export 100 entries | 9 | 100 | 4212273 | 200 |
| Export 201 entries | 15 | 100 | 4314485 | 200 |
| Export 501 entries | 27 | 100 | 4618085 | 200 |

Each export includes two maximal 200-image-block entries and 400 media-reference locations, plus ordinary hero entries. Fields JSON is 999914 bytes and one block data JSON is 999935 bytes, both near the accepted 1000000-byte bound. Every ordered published entry/block/value is compared, public draft mirrors are checked and private-draft sentinels are absent. The slope crosses several snapshot identifier chunks without N+1 growth. These finite sizes introduce no global export cap and prove no unbounded export maximum. Simulator acceptance does not establish production D1 resource capacity.

Root typecheck, lint, format check, release check, explicit acceptance-file Oxlint and OpenSpec strict validation passed after the D1 correction; `git diff --check` also passed. Existing four database-test lint warnings remain.

The dependency audit successfully collected advisory and full-lock license metadata. It found **19 advisories** and **875 licensed package/version records**, including platform optional binaries. See `step-34b-dependency-audit.md` and JSON for all paths, versions, proposed dispositions and provenance. No missing manifest license was found, but distribution obligations and corrected graph/artifact acceptance are pending. `/private/tmp/lace-34b-dependency-plan.diff` proposes six exact patched targets and two explicitly restricted tooling dispositions; it has not been applied. No dependency or lockfile changes have been made in this audit stage. The update skill requires confirmation before applying the proposal.
