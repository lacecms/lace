## 1. Portable diagnostic contract

- [x] 1.1 Add the twelve closed reasons, source-reason membership and bounded safe-path normalization to the portable domain package; extend failed trigger/work inputs with optional `path` and build records with optional `errorPath`. Verify reason preservation/fallback, all path exclusions/bounds and package boundary rules with focused domain/application tests.

## 2. Builder source and authenticated protocol

- [x] 2.1 Implement exact installation-root `AGENTS.md`/`CLAUDE.md` exclusions and classified source errors, preserving existing pruning and rejecting other links without resolving targets; revalidate the disposable copy before tools run. Verify standalone/workspace root service links (including dangling/outside targets), in-site/escaping links, linked selection/required files, special/unreadable entries, missing required files and unsafe-path omission with focused source tests.
- [x] 2.2 Preserve source reason/path through the runner and bounded authenticated failure response; keep fixed stage codes, serial execution, version checks and atomic release behavior. Verify unauthorized requests inspect no source, sensitive output never appears, failed attempts retain the old release and correction succeeds using runner/server tests; add protocol vocabulary/path parity tests against domain without adding a builder runtime dependency.
- [x] 2.3 Extend Node builder response parsing to old reason-only and new safe-path failures with a 1024-byte streaming bound and fixed status/log validation. Verify recognized reasons survive, unsafe string paths are dropped, and unknown reasons, wrong types, extra fields, oversized streams and network failures safely return `trigger_unavailable` with focused adapter tests.

## 3. Dispatch and durable persistence

- [x] 3.1 Preserve recognized reasons and normalized paths through the portable dispatcher, keep code-only correlated logs and outbox errors, and retain current eight-attempt/lease behavior. Verify pending and terminal failures, unknown fallback, unsafe path removal, lease renewal and stale-claim rejection with dispatcher tests.
- [x] 3.2 Add shared bounded build-error encoding/decoding and update Node and D1 failure writes/record reads atomically under existing leases. Verify legacy reason strings, structured path-bearing errors, malformed stored data, restart/readback, success clearing and retry history preservation with SQLite/D1 repository tests; confirm schema/migration files remain unchanged.

## 4. REST and Builds diagnostics

- [x] 4.1 Add optional safe `errorPath`, closed `error` validation and field coherence to admin history/detail contracts and mapping; regenerate OpenAPI. Verify legacy payloads, path-bearing payloads, invalid payload rejection, Node/Worker parity and read authorization with contract/API tests and `pnpm openapi:check`.
- [x] 4.2 Show the build ID and exhaustive fixed explanations/corrections in Builds details for failed and retrying builds, rendering safe paths as text. Verify each reason, absent path, pending failure, successful retry clearing and admin/editor/viewer permissions with focused component tests and browser coverage for the source-failure/retry flow.

## 5. Packed production consumer and documentation

- [x] 5.1 Add `acceptance:builder-diagnostics` using packed packages and locally built production images with an independent existing Astro parent and generated `cms/` child. Verify harness setup/teardown, exact mount/project selection, bounded polling, secret scanning and acceptance-only guarded retry acceleration without altering production dispatch policy.
- [x] 5.2 Run the packed Compose consumer: publish with the root service link, then independently inject an in-site link, escaping link, unreadable included entry under the actual non-root builder identity, and missing required lockfile. For every fault verify authenticated builder reason/path, persisted/list/detail/UI diagnostics, eight-attempt terminal failure, unchanged served release, correction and administrator Retry to a successful new release; record commands, artifact provenance and secret-free evidence in `docs/step-33c-builder-source-diagnostics-acceptance.md`.
- [x] 5.3 Update ADR 0004, builder README and consumer operations guidance with the exact exclusions, closed reasons, safe-path rules, correction/retry and coherent upgrade/downgrade behavior; mark roadmap 33C complete only after acceptance passes. Verify guidance matches the implementation and evidence and does not claim 33D–33H completion.

## 6. Completion checks

- [x] 6.1 Run the narrow relevant tests, then root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` and `pnpm exec openspec validate step-33c-builder-source-diagnostics --type change --strict`; resolve failures and record the final verification results before synchronization/archive and the requested implementation commit.
