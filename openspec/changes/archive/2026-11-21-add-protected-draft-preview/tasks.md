## 1. PV1A — Lifecycle, immutable inputs and persistence

This checkpoint implements `draft-preview` lifecycle requirements and design
§§2–5. Keep runtime creation disabled. Complete and verify tasks in order;
record evidence and remaining work at the checkpoint boundary. The complete
plan is estimated at 6–10 working sessions, not one implementation turn.

- [x] 1.1 Define portable preview state/command/read/runner/storage ports and safe failure vocabulary, plus closed contracts and route policies; verify schema tests reject unknown commands, paths, refs, credentials and invalid revisions.
- [x] 1.2 Add forward schema migrations for generations, current pointers, execution slots, captured inputs/media dependencies and credential lifecycles; verify fresh and upgrade migrations on file/in-memory SQLite and local D1, indexes and foreign-key behavior.
- [x] 1.3 Implement shared guarded admission and input-copy plans, additive preview capture epoch persistence and atomic advancement during published block migrations, idempotency and one-installation-slot semantics; verify concurrent same/different entity requests, mismatched keys, stale revisions and busy requests preserving prior ready previews through repository contracts.
- [x] 1.4 Implement pre-admission publication-grade candidate validation and bounded frozen-context capture; verify hidden/conditional projection, route conflicts, unpublished target overlay, globals/records, other-draft exclusion and rejection on public-version or preview-epoch changes without automatic recapture, on SQLite and D1.
- [x] 1.5 Implement claim, finalization, failure/deadline and expiry transitions with fencing; verify save-during-build keeps the captured revision, duplicate completion does not extend TTL and late/foreign completion never exposes output.
- [x] 1.6 Extend shared publication, target/model removal and media deletion success plans with atomic preview invalidation; verify publish replay/failed commands do not invalidate newer previews, save/revert/unpublish retain them, and media deletion remains possible with preview dependencies.
- [x] 1.7 Implement bounded restart/deadline/cleanup coordination with injected clock and executors; verify SQL/object-store failure recovery, orphan cleanup, logical denial before deletion and no automatic rebuild or unsafe physical-slot release.
- [x] 1.8 Run the complete new preview repository contracts on SQLite and local D1, including resource/query limits and publication races; record PV1A evidence, run the checkpoint quality gate below and leave the capability disabled.

## 2. PV1B — Session handoff and private delivery

Depends on PV1A. Implements `draft-preview-delivery` and design §§6–7, using
fixture packages before the real Astro runner is available.

- [x] 2.1 Implement preview-origin initiation, browser-bound one-use handoff and restricted host-only preview sessions linked to real Lace sessions; verify expiry, replay, stolen callback, mismatched origin/return path, concurrent tabs and parent revocation against actual auth on both runtimes.
- [x] 2.2 Add strict hostname dispatch and credential-isolated routes, with existing origin/body/rate-limit policy integration; verify no admin/MCP/OAuth/build-control route on the preview host and no preview authority from public build/import/MCP tokens.
- [x] 2.3 Implement private S3/R2 artifact staging, manifest validation, sealed immutable output and streamed gateway reads; verify traversal/encoded separators, cross-generation paths, missing/oversized/partial files and forbidden source/environment/source-map content.
- [x] 2.4 Enforce live parent/user/permission and generation checks for HTML, assets, originals, HEAD, conditional and range requests; verify direct unauthenticated URLs, logout, role/account changes, invalidation and expiry deny subsequent bytes before any 304/206.
- [x] 2.5 Add no-store/no-referrer/noindex, content-type and framing policies, prevent preview service-worker persistence, and implement the protected top-level viewer with revision/expiry; verify same-site iframe bootstrap, cross-site fallback, parent isolation and denied foreign framing in real-browser HTTPS fixtures.
- [x] 2.6 Implement bounded handoff/session/input/artifact cleanup in both runtime maintenance paths; verify cleanup retries do not restore access or rerun builds, and record PV1B security evidence with the checkpoint quality gate.

## 3. PV1C — Astro single-page integration

Depends on PV1A/PV1B. Implements `astro-draft-preview` rendering/navigation
requirements, the `astro-adapter` and `workspace-governance` deltas, and design §8.

- [x] 3.1 Add the separate SDK frozen-input client and preview site view without widening public loader/export/build-token behavior; verify target replacement, records/globals, private media, published-only regressions and the explicit preview flag.
- [x] 3.2 Add the opt-in server-only Astro preview entry, supported-version preflight and single-route prerenderer wrapper; verify home/fixed pages and unpublished/renamed dynamic routes, logical-path handling under the prefix, zero/multiple target failures and no whole-site fallback.
- [x] 3.3 Integrate generation-prefixed assets, private local media staging, optimization and required original copying; verify CSS backgrounds, fonts, image variants, lazy JS, lightbox originals, media dependency reporting and credential-free output.
- [x] 3.4 Add the catalog-pinned server-only HTML parser and narrowly scoped boundary allowance; implement page-link/base-path/fragment handling, preserved rel semantics and resource classification; verify parser edge cases, downloads/media links, prohibited imports and no blanket base-tag rewriting.
- [x] 3.5 Enforce one-site-HTML artifact packaging, file/path/type/budget rules and compatibility diagnostics; verify a malicious output fixture, a missing literal local asset, unrelated route enumeration failure and rejected unsupported source arrangements.
- [x] 3.6 Add generated-starter integration and an independently authored existing-site fixture; verify packed-package builds, normal published-only builds unchanged, and desktop/narrow rendering with working scripts/media under two generation prefixes. Record PV1C evidence and run the checkpoint quality gate.

## 4. PV1D — Fixed VPS execution

Depends on PV1A–PV1C. Implements VPS/source/execution requirements in
`astro-draft-preview` and design §§5/9–10.

- [x] 4.1 Add operator-selected immutable source preparation and preview runner settings while preserving the existing `/build` request; verify clean commit pinning, relevant dirty-source refusal, secret/data exclusions and rejection of HTTP command/path/environment overrides.
- [x] 4.2 Implement the closed private `/preview` operation and executor reservation/claim handshake; verify no preview queue, duplicate transport deduplication, publication-busy rejection preserving old preview and release of failed provisional admissions.
- [x] 4.3 Refactor shared builder scheduling for one physical process and publication next-slot priority; verify publication arriving before preview execution wins, a running preview is not preempted, and the public release pointer never changes due to preview.
- [x] 4.4 Implement the combined execution deadline, process-group termination and restart reconciliation; verify child/grandchild termination, late upload refusal, crash recovery and no overlap after logical timeout.
- [x] 4.5 Complete scoped runner input/upload/finalization against private S3 and add generated/repository preview-host ingress settings; verify a real container build, upload failure, normal publication after preview and compatible/incompatible-domain viewer access. Record PV1D evidence and run the checkpoint quality gate.

## 5. PV1E — GitHub Actions and Cloudflare

Depends on PV1A–PV1C; follow PV1D in this staged plan to reuse its proven protocol.
Implements Cloudflare execution requirements and design §§9–10.

- [x] 5.1 Add validated Cloudflare preview configuration, secret references and GitHub dispatch/run-control adapter; verify exact source/workflow/run correlation, no Pages calls, safe provider/quota errors and zero credentials in status DTOs.
- [x] 5.2 Generate the dedicated fixed workflow with bootstrap/claim exchange before execution, pinned source/toolchain, scoped upload and completion, combined job deadline and credential isolation from site code; verify fixture protocol tests and duplicate dispatches starting at most one claimed build.
- [x] 5.3 Wire private R2 staging/streaming, host routing and D1 preview state into the consumer Worker; verify local D1/R2 parity, oversized uploads/manifests, late writes, prefix isolation and unpublished media never obtaining a public URL.
- [x] 5.4 Implement scheduled provider reconciliation, cancellation and bounded cleanup; verify delayed starts, missing callbacks, revoked credentials, process/lease fencing, callback duplication and timeout without automatic runner retries.
- [x] 5.5 Run an authorized real GitHub Actions → Worker/D1/R2 preview acceptance on a disposable installation; record exact generation/source/run correlation, private resources, no Pages deployment, deadline/cancellation and publication isolation. If credentials/infrastructure are unavailable, leave this task incomplete and report that release gate explicitly; run the checkpoint quality gate for completed local work.

## 6. PV1F — Admin, operator guidance and full acceptance

Depends on PV1A–PV1E. The owner approved applying 6.1 after the local checks in
5.1–5.4 and before 5.5. Verify 6.1 with explicit local test composition. Resume
with 5.5, then apply 6.2–6.7 in order. Real-provider acceptance and the final
PV1F gate are both required before enabling preview creation in deployments.
This checkpoint implements the remaining `draft-preview` UI requirements,
configuration guidance and complete cross-runtime acceptance.

- [x] 6.1 Add safe readiness/status/admin preview clients and saved-only Create/Recreate/Retry actions using server permissions; verify admin/editor/viewer behavior, hidden unconfigured actions, dirty/new/route-less entities, field/block validation, stale revision conflicts and busy/duplicate requests.
- [x] 6.2 Add preview lifecycle presentation and bounded polling that stops at terminal outcomes; verify captured revision/staleness/expiry, safe actionable errors, manual retry of the current saved revision and no automatic popup, save, rebuild or retry.
- [x] 6.3 Add the separate preview screen with revision/expiry metadata, responsive widths, isolated iframe and always-available new-tab access; verify public-suffix-aware domain classification, fresh handoff, login/expired-frame recovery, multi-tab use, preserved unsaved editor state and accessible keyboard/focus behavior.
- [x] 6.4 Complete generator/CLI doctor/setup guidance and public docs for Node, Cloudflare and existing sites; verify generated examples use the selected site/base paths, missing settings remain fail-closed, secrets are excluded, quota/timeout/manual recovery/TTL behavior is documented and external-effect responsibilities are explicit.
- [x] 6.5 Add and run reproducible end-to-end acceptance using packed consumers on both runtimes: unpublished/new revision preview, full public-output isolation, assets/links, save/unpublish retention, publish/media/model invalidation, TTL, auth revocation, manual retry and concurrent/late results; record evidence without depending on temporary spike files.
- [x] 6.6 Verify upgrade without preview configuration and rollback disabling/revoking preview while retaining public content; measure representative run duration, request/query budgets and package sizes, and document limits without claiming universal free-tier capacity or speedups.
- [x] 6.7 Run relevant focused suites, root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, OpenAPI/schema/boundary checks and `pnpm exec openspec validate add-protected-draft-preview --type change --strict`; review the diff for secrets and unrelated changes, record PV1F evidence and update roadmap completion state. Do not synchronize/archive or publish a release without the separately requested workflow.

## 7. Checkpoint quality and handoff rules

Apply these rules at every checkpoint above; they do not create a seventh feature
stage. A task is complete only when its stated verification passes. Use the
narrowest relevant suites, then root typecheck, Oxlint/boundaries, Oxfmt and strict
OpenSpec validation before handing off a completed checkpoint. Record commands,
results, concrete limitations and the next unchecked task in implementation
verification notes. Do not claim the entire change complete after a checkpoint.
Stop and use `openspec-update-change` if implementation changes a contract or
reveals an architectural conflict. Leave unavailable external acceptance tasks
unchecked. Partial work remains disabled and must not weaken ordinary publication.
