## Context

See `proposal.md` for Step 34A scope. `packages/test-utils/src/repository-contract.ts` already supplies identical cases to the Node and Cloudflare adapter suites. `packages/server/src/app.test.mjs` tests the shared Hono factory mostly over in-memory ports; `packages/platform-cloudflare/src/worker.test.mjs` exercises the Worker composition with local bindings. These provide useful cases but are not a shared two-composition oracle.

`apps/admin/e2e/acceptance.e2e.ts` exercises an isolated Node/SQLite/MinIO editorial stack. `scripts/node-browser-acceptance.mjs` and `scripts/cloudflare-consumer-acceptance.mjs` exercise packed admin journeys, while other admin browser tests use route fixtures. `apps/site/src/fixture-build.test.mjs` tests fixture/live export builds against a controlled HTTP source. The new proof must connect these layers rather than treat mocked UI coverage as runtime parity.

## Goals / Non-Goals

**Goals:** one fail-closed local command, shared behavioral expectations, real-backend browser scenarios, attributable source and candidate evidence.

**Non-Goals:** changing persistence, public wire formats, auth policy or deployment semantics; broad security/fault audits and operations work remain in 34B/34C. Test setup may seed through supported application/CLI operations; acceptance content authoring is performed through browser controls.

## Decisions

### Preserve the v1 public representation

Keep `publicContentEntrySchema` reusing `contentEntrySchema`, with `published` present on successful public reads and `draft` mirroring published data. Keep SDK validation, render core and public API specs compatible. The consumer-facing site view remains published-only through `createPublishedSiteLoader`.

This avoids a breaking raw SDK/export DTO change for existing alpha consumers without relaxing draft isolation. A dedicated schema would improve naming and structural validation but would require a coordinated contract/SDK/render/API migration. That alternative is rejected for this freeze; record the decision in architecture §13 and the 34A evidence, with regression assertions for mirrored data and the loader view.

### Share inputs and expected results above runtime adapters

Keep reusable API scenario definitions and JSON expectations in test infrastructure; adapter-specific fixtures create a migrated SQLite runtime via `createNodeRuntime` or a local D1/R2 Worker via `createCloudflareWorker` and the existing Miniflare harness. Tests outside production packages can compose both without adding cross-adapter production imports. Use actual Better Auth sessions rather than test actor headers for permission checks.

Use common configuration, logical accounts, ordered content, media bytes and operation sequence. Inject deterministic clocks/IDs where composition supports them. Otherwise map returned IDs by logical fixture name and normalize only declared timestamp, origin, request-ID and credential metadata fields. Never snapshot one runtime's results as the other's oracle, strip arbitrary fields, or sort ordered blocks to conceal differences. Assert ETags, statuses, error codes, cursors and revision semantics separately. SQL setup/inspection stays inside each runtime test harness.

### Reuse browser journeys with explicit runtime parameters

Extract reusable browser scenario helpers where this removes duplication; preserve existing generated-project checks and accessibility audits. Run admin/editor/viewer and two-session conflict scenarios against isolated Node/MinIO and Worker/D1/R2 services. Add backend-driven session invalidation for expiry tests, rather than fabricating a browser 401. Build failure fixtures use the existing fixed Node builder/local hook or Pages stubs; provider simulation is labelled in results. Do not equate hook acceptance with succeeded deployment.

The orchestration lives under `scripts/` with a root pnpm command, owns ephemeral ports/state/processes and cleans them in `finally`/signal handlers. Fixtures never reset `.lace` or ordinary development storage. Run stateful phases sequentially to avoid output-directory and database contention.

### Compare meaningful Astro output

Capture exports through authenticated runtime HTTP endpoints. Run separate Astro builds using the same fixture with a stable explicit public media origin and isolated output directories. Compare a canonical data manifest (paths, published fields, ordered blocks), emitted HTML route inventory and extracted media references to explicit shared expectations. Normalize only known generated identifiers/times and local origins. Check draft/unpublished sentinels and token absence. Comparing whole HTML bytes alone would conflate irrelevant bundler output with product parity; comparing export JSON alone would miss route/render integration.

### Correct the discovered Builds contrast failure

The new failed-build detail audit measured 3.98:1 for `text-destructive` on
`bg-destructive/10`, below the required 4.5:1. Use the existing `text-foreground`
token for the explanatory paragraphs while retaining the destructive background
and status cue. Keep the axe check of the opened failure details and add the
same audit to exact-candidate acceptance; do not disable contrast rules.

The user approved this scope extension on 2026-10-07. Alpha.3's local npm
publication receipt confirms publication, so preserve that artifact set and
record it in publishedVersions. Select the next unused alpha candidate, advance
the ownership template, refresh shipping coordinates coherently and preserve
historical fixtures/upgrade entries. Run focused generator/upgrade/release tests,
commit the reviewed implementation, then prepare both platform images and all
packages from that clean revision. Verify and accept the new exact set without
publishing. A second commit records evidence and archive.

### Recover expired editor mutations

The real-backend expiry journey found that EntryPage supplies only model/entry
query errors to session recovery. Supply Save, Publish and Reload draft mutation
errors to the existing recovery hook as well. Preserve server authorization and
the unsaved-draft navigation confirmation: the user can explicitly leave for
sign-in. Verify all three error paths in focused editor tests and backend-driven
browser expiry with rejection, recovery and unchanged persisted draft on both
runtimes. The user approved this addition on 2026-10-07; include the correction
in the new candidate alongside the contrast fix.

### Separate source coverage from exact-artifact claims

The orchestration records phase/runtime results and fails if a required phase is skipped. Reuse `scripts/generated-project-acceptance.mjs` and its release receipt for exact candidate journeys where possible. Use the Step 33 inventory as the immutable baseline for alpha.3. For the corrected candidate, retain a reviewed inventory in `docs/archive/step-34/step-34a-artifacts.json` and require explicit baseline selection when invoking the verifier. Record source revision/tree state separately from candidate source revision. Do not rebuild into an existing completed artifact directory or label a dirty preview as a reviewed candidate.

If a product defect appears, stop and revise the active artifacts under the repository workflow before changing shipped behavior; refresh candidate acceptance from a reviewed revision as required. This is not permission to silently expand 34A into security or release publication work.

## Risks / Trade-offs

- Local D1/R2 differs from deployed infrastructure → identify simulator versions/limits and retain remote checks in the owner plan.
- Runtime-generated identities obscure parity → explicit logical-ID mappings and fixture validation; avoid blanket redaction.
- Long browser/artifact runs → focused phases with per-scenario diagnostics and a complete aggregate result; no pass on missing prerequisites.
- Stale candidate files → verify checksums and source provenance before artifact phases.
- The mirrored `draft` name remains confusing → explain the compatibility decision and enforce published-only values and loader output.

## Migration Plan

No database or public API migration is planned. The approved contrast correction requires new candidate coordinates and a template bump. Add test infrastructure, commands, contract decision documentation and `docs/archive/step-34/step-34a-verification.md`. Run focused suites, root typecheck, Oxlint, Oxfmt and strict OpenSpec validation. Mark the roadmap's 34A result only with actual local evidence; 34B/34C and real-deployment acceptance stay open. On explicit archive, synchronize the new verification capability into main specs. Test infrastructure can be reverted without changing stored data or consumer APIs.
