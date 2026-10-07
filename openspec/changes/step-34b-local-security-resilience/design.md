## Context

See proposal.md for scope and architectural references. NodeRequestRateLimiter currently selects the first X-Forwarded-For value; CloudflareRequestRateLimiter selects cf-connecting-ip. Both currently key uploads/token operations by IP. createBetterAuthBoundary does not configure provider IP resolution. CLI runCommand and runMigration open SQLite without Compose inspection. The generated Compose deployment bind-mounts .lace/data into both api and dispatcher; 32B reproduced divergent host/container WAL views on VM-backed Docker.

Reusable evidence infrastructure exists in scripts/cross-runtime-verification.mjs, tests/support/cross-runtime-fixture.mjs, the shared repository/security contracts, consumer-security.mjs and generated-project-acceptance.mjs. Local D1 countingD1 already measures statements/bound parameters and maximal draft tests cover 200 blocks/references. exportBuildContent has no installation-size cap. Avoid inventing a maximum from a finite stress fixture.

## Goals / Non-Goals

**Goals:** correct the three known weaknesses, run attributable negative/fault tests across actual adapters, measure resource budgets, and produce explicit dependency dispositions.

**Non-Goals:** replace Better Auth, generalize proxy infrastructure, redesign export pagination, implement backup/restore, or turn local simulator results into remote release evidence.

## Decisions

### Resolve identity once at ingress

Node transport wiring in apps/api and platform-node captures the socket peer independently of request headers. Default trust is empty. Add a validated LACE_TRUSTED_PROXY_CIDRS setting; walk X-Forwarded-For from right to left only while the current hop is trusted, stop at the first untrusted hop and reject malformed chains conservatively. Never trust all proxies by default. Cloudflare uses its trusted ingress identity; arbitrary custom headers in direct invocation do not establish that trust.

Expose the resolved value through an internal composition capability, not a public API field. Strip/replace provider IP headers before handing a request to Better Auth and configure its supported IP lookup to consume only that internal value. Do not disable provider protection merely to avoid its shared bucket. Keep Lace's durable HMAC limiter and conservative fallback for programmatic requests without transport information. Shared server middleware obtains the already validated actor for upload/token limits; it must not treat caller actor IDs as identities or perform protected work before authorization. Provider types stay in auth; transport/proxy policy stays in platform adapters, with no cross-adapter imports.

Test direct spoofing, malformed and multi-hop chains, IPv4/IPv6 policies, two distinct clients behind a trusted proxy, missing identity and two actors behind one peer. Configure generated proxy guidance and environment examples explicitly, preserving local loopback origins and production secure cookies.

### Inspect Compose storage before opening host SQLite

CLI preflight uses structured Docker process/container inspection through argument arrays, with bounded time/output, and maps each configured container LACE_DATABASE_PATH through the effective bind mount to a canonical host database location, resolving relative paths against the container working directory. Inspect only the selected database setting, working directory, mounts, service identity and running state; never return complete container environments. A source-only builder mount is not a database consumer. Missing or ambiguous database configuration on a running API/dispatcher fails closed. Compare actual database locations, including shared aliases, rather than treating every source ancestor as database storage. Detect storage use across project names and aliases; do not rely only on cwd or a hardcoded service name. Centralize the pre-open check so migrate, sync/check and bootstrap cannot bypass it, and cover the packaged migration entry where it opens host storage. Container maintenance is distinguished from host execution and must not require a Docker socket in runtime images.

For generated Compose projects, inspection failure refuses host access with existing sanitized OPERATION_FAILED diagnostics. Node-only projects without a Compose deployment retain ordinary operation without a new Docker prerequisite. Tests explicitly cover unavailable Docker for both cases. Never emit full inspect/config output because it contains secrets. The guard detects live consumers; maintenance still requires keeping services stopped for the entire command. It is not a distributed lock, and deliberately concurrent service startup must remain an explicit operational limitation. Automated service stops and native SQLite lock probing are rejected: the former is destructive and the latter already opens the unsafe file across VM sharing.

### Enforce browser origin before cookie-authenticated Lace mutations

34B negative verification reproduced a fourth defect: a valid administrator cookie submitted to POST /api/v1/admin/users with a foreign Origin creates an administrator (HTTP 201) on both Node/SQLite and local Worker/D1. Better Auth protects its own handler but actor resolution currently checks only the session. This correction enforces the accepted same-origin invariant without a new DTO, migration, dependency or transport-specific authorization policy.

Reuse one canonical trusted-origin policy in the auth boundary for the provider and session actor resolution. Before resolving an actor for an unsafe HTTP method, reject an explicit malformed, opaque or untrusted Origin and browser cross-site Fetch Metadata when Origin is absent. Preserve ordinary origin-less non-browser operator requests and safe reads. Development-only loopback aliases must retain the same scheme and port; production trusts only its canonical origin. Denials use the existing sanitized authorization envelope and perform no protected mutation. Setup and provider operations retain their existing authentication/CSRF contracts. Verify foreign/null/malformed origins, missing-origin cross-site browser requests, valid canonical-origin mutations, local aliases, role/session negatives and unchanged user/content/token/media state on both adapters. SameSite=Lax remains defense in depth, not a substitute for an explicit origin check.

### Share complete image-container validation before accepting uploads

34B task 3.2 reproduced another defect: Node accepts a valid PNG followed by executable script bytes through the actual authenticated media API (HTTP 201), while Worker rejects it. Focused Node inspector regressions confirm the same missing trailing-data rejection for PNG, JPEG, WebP and AVIF. Sharp metadata extraction establishes format/dimensions but does not establish that the entire submitted byte sequence is exactly one complete image. This violates the existing media-use-cases requirement; no new upload behavior or limit is introduced.

Extract the existing runtime-neutral Worker container parser into a portable application helper consumed by both image inspector adapters. Preserve their public adapter exports, the closed safe DomainError contract and orientation-applied dimensions. Node retains sharp metadata inspection in addition to shared structural validation. Do not import one runtime adapter into the other or add a new dependency. Verify valid inputs, MIME mismatch, malformed/truncated containers and trailing executable content for all four formats, plus authenticated HTTP rejection before storage/metadata on both compositions and unchanged published content. Preserve the accepted 10 MiB, 12,000-side and 100,000,000-pixel limits. Refresh affected shipping artifacts under the already planned candidate workflow.

### Extend shared contracts with real fault checkpoints

Reuse test-utils repository/security cases on SQLite and local D1. Inject deterministic SQL statement/commit failures, storage adapter faults and clock-controlled lease expiry through test wrappers, preserving production 60-second leases, jitter/backoff and eight-attempt policy. Use disposable child processes and persisted local state for kill/restart tests: an in-memory exception alone does not prove restart recovery. Node uses disposable MinIO and the fixed-command builder; Cloudflare uses persisted local D1/R2 and hook/Pages HTTP stubs. Inspect public output, database rows and object bytes before/after failures.

Reuse real-backend browser helpers to assert the persisted build outcomes and recovery controls; avoid duplicating the full 34A editorial matrix. Exercise transaction rollback, post-commit dispatch failure, upload/delete lifecycle, stale owner results, builder kill before release switch and tracked provider deadline. Fixed sentinel credentials verify logs and outputs, excluding only documented intentional reveals/auth storage.

### Measure budgets at repository and authenticated HTTP boundaries

Extend countingD1 to count every executed statement, including batch members, and reset after fixture setup. Retain maximal entry tests and add full Worker request overhead measurements. Use published export fixtures with 100, 201 and 501 entries; include maximal 200-block/reference entries and draft/unpublished sentinels, crossing identifier hydration chunks. Record total bytes and query slope, assert <=100 bound parameters and <=50 statements per tested invocation, and compare complete output rather than sampling. These are test sizes, not new product caps. Test large JSON near accepted per-field/block bounds separately to avoid conflating query and memory budgets. If existing behavior exceeds required budgets, stop for an explicit design/spec update rather than truncate data or lower accepted limits.

### Validate draft media references with bounded set-based reads

Task 5.1 now instruments the actual authenticated Worker request, including Drizzle raw reads and post-commit jobs. A maximal create with 200 image blocks and 200 distinct active media references returns HTTP 201 but executes 228 statements (maximum 98 bound parameters), violating the required 50-statement invocation budget. ContentUseCases.validateMedia currently calls loadMedia once per reference before the already chunked repository write. Repository-only tests did not count that application overhead.

Collect normalized field/block references without database I/O, deduplicate media IDs for validation, and use a shared internal bulk metadata-read capability implemented by both persistence adapters. Chunk each D1 identifier read at 100 bound parameters; preserve reference order and every original field/block location. Reject missing or inactive media before the mutation with the existing safe contract. Keep the repositories' transactional active-media guards so a state change between validation and commit still rejects and rolls back. Reject over-limit references before metadata reads/writes; do not lower accepted limits, add a public DTO or migration, or mask the count by excluding authentication or post-commit overhead. Verify duplicate IDs, missing/inactive media in the last chunk, unchanged state on denial, shared SQLite/D1 parity and complete maximal HTTP create/save/publish output. Refresh shipped artifacts under the existing candidate workflow.

### Add a fail-closed 34B runner and audit record

Add pnpm verify:34b using the phase/report helpers established in 34A. Keep phases and mutable resources sequential, fail on missing prerequisites/skips, persist not-run/failed/passed states, and clean only owned resources on signals/finally. Record local simulation explicitly. Audit the lockfile with pnpm advisory output and license metadata; record the tool/version/source and production versus tooling/artifact exposure. Preserve original findings in sanitized evidence and produce a disposition table; neither network failure nor an empty report is proof of safety. No dependency upgrade is assumed before findings are known; incompatible or materially expanded remediation requires updating this change.

### Remediate the attributable locked dependency findings

The first successful 34B npm audit reports 19 advisory records (2 critical, 7 high, 7 moderate, 3 low). The full lockfile license inventory covers 875 package/version records including cross-platform optional binaries, with zero missing manifest licenses; attribution/native-library obligations still require artifact inspection. See docs/archive/step-34/step-34b-dependency-audit.md and its JSON for exact paths, data provenance and proposed dispositions. Do not interpret pnpm's dev flags alone as runtime reachability: Miniflare is a production dependency of the operational CLI, and Better Auth peers can expand deployment graphs.

Authorize targeted existing-dependency remediation: raise the sharp catalog minimum to ^0.35.5 and resolve Miniflare's separate sharp to 0.35.5; narrowly override locked undici 7.29.0 to 7.29.1, tinypool 2.1.0 to 2.1.2, http-cache-semantics 4.2.0 to 4.3.0, smol-toml 1.8.0 to 1.9.0 and source-map-js 1.2.1 to 1.2.2. All six targets were confirmed in npm metadata. Update the lockfile with the pinned pnpm, preserving unrelated pins where possible. No new runtime dependency, schema or product limit is introduced. Verify image formats, operational CLI/local Miniflare, Astro output, formatter, tests and both-platform refreshed artifacts. Rerun the advisory and full-lock license inventory after the resolution change; record any remaining/new findings without suppression and stop again if incompatible remediation materially expands scope.

Two explicit restricted tooling dispositions are proposed: esbuild 0.18.20 via the legacy drizzle-kit esm-loader is retained only because the advisory requires its development server and Lace does not start that server; never expose/start it, and review on loader/drizzle-kit upgrades or any invocation-policy change. braces 3.0.3 via OpenSpec is retained for trusted repository-controlled patterns only because no patched version is reported; review when a patch exists or untrusted globs enter the workflow. These are scoped risk dispositions, not assertions that vulnerable packages are harmless. Preserve advisory records and verify actual packaging rather than infer absence from tooling labels.

License acceptance requires preserving applicable LICENSE/NOTICE/font files and verifying native sharp-libvips attribution/source/relinking obligations for each distributed binary. A metadata identifier alone does not prove compliance. Keep incomplete/unknown artifact obligations visible and task 5.3/6.3 pending as appropriate; do not claim complete audit or candidate acceptance until the recorded gates are met.

### Preserve artifact provenance

Use docs/archive/step-34/step-34a-artifacts.json as the reviewed baseline; never mutate its history. The known auth/CLI changes ship, so the old alpha.4 cannot prove corrected candidate behavior. Check publication state before selecting coordinates; keep published versions immutable. Refresh packages/images coherently from a reviewed clean revision under the existing release workflow, including template hashes/fixtures and upgrade instructions when shipping defaults/guides change. Run release verification, both-platform image smokes and exact-consumer regression acceptance on the selected supported execution platform, documenting platform coverage precisely. Store a separate 34B inventory/result. Publication remains outside scope; if clean-source artifact preparation is not yet possible, report source verification and pending candidate acceptance honestly.

## Risks / Trade-offs

- Incorrect proxy configuration → empty trust by default, peer validation, controlled proxy tests and explicit owner remote checks.
- Docker inspection has a check/start race → require a stopped maintenance window and document the guard's local detection boundary; do not claim distributed exclusion.
- Local D1 omits remote quota/timing behavior → count statements/parameters independently and retain remote budget confirmation in the owner plan.
- Process timing can make recovery tests flaky → durable checkpoint handshakes and deterministic clocks instead of arbitrary sleeps.
- Advisory/license data changes → timestamp and lockfile identity, explicit unknown/accepted dispositions and review triggers.
- Shipped fixes make the old candidate stale → separate source and candidate evidence and refresh before candidate acceptance claims.

## Migration Plan

No SQL migration or public DTO change is planned. Implement boundary fixes and local verification, update only affected generated guidance/environment/template ownership, run focused tests then root typecheck/lint/format and strict OpenSpec validation. Review the clean release source and refresh exact artifacts before final candidate acceptance. Record actual results and mark only 34B completed; 34C and owner remote acceptance stay open. Rollback restores prior code/configuration without changing content data, but also restores the documented security weaknesses.
