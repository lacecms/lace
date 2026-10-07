## 1. Trusted identity and abuse controls

- [x] 1.1 Capture Node transport peer identity, implement validated explicit trusted-proxy CIDRs and Cloudflare ingress identity, and verify direct/header spoofing, malformed chains, IPv4/IPv6 and trusted multi-hop cases with focused composition tests.
- [x] 1.2 Wire the same sanitized identity into Better Auth and Lace auth/setup limits, use validated actors for upload/token subjects, and verify two clients behind a proxy, two actors behind one peer, exhausted limits, Retry-After and HMAC-only persisted buckets on both runtimes.
- [x] 1.3 Update affected generated proxy/environment guidance and template ownership metadata without editing user-owned site/configuration; verify generator snapshots, managed hashes and upgrade-conflict tests.

## 2. Host database safety

- [x] 2.1 Add a centralized bounded structured Docker-storage preflight before host migrate, sync/check and bootstrap open SQLite; verify actual database mapping through bind mounts and container working directories, path aliases, a different installation, stopped services, a running source-only builder, and unavailable/malformed/ambiguous inspection and sanitized JSON/human failures, plus Node-only/memory/Cloudflare/container-maintenance exclusions.
- [x] 2.2 Exercise the guard against a disposable generated Compose consumer on the local VM-backed Docker host; verify rejected commands open no database or token, stop api/dispatcher explicitly, rerun maintenance successfully and confirm content survives service restart. Update only affected maintenance guidance and verify generated fixtures.

## 3. Security negative verification

- [x] 3.1 Correct the shared cookie-authenticated Lace mutation origin boundary using the provider trusted-origin policy (canonical/production, development-only loopback aliases, opaque/malformed origins and origin-less cross-site Fetch Metadata), preserving ordinary non-browser requests; extend shared real-runtime API cases for session/cookie policy, disabled/revoked/expired sessions, public signup, CSRF/origin and admin/editor/viewer/build-token denial; verify protected state remains unchanged for every negative case on Node and local Worker.
- [x] 3.2 Correct Node image acceptance with shared portable complete-container validation used by both adapters (PNG/JPEG/WebP/AVIF, malformed/truncated and trailing executable bytes), retaining sharp dimensions and existing limits; add or incorporate malformed/oversized/MIME-mismatched upload, filename, unsafe URL/rich-text, token hashing/revocation and builder command/path/environment cases; run relevant media/render/auth/builder suites and assert safe failures and unchanged published data.
- [x] 3.3 Scan captured runtime/CLI/provider errors and static output with injected credential sentinels, allowing only documented intentional reveals; verify the detector reports surface names without secrets and fails when a deliberate leak is injected.

## 4. Resilience and durable restart

- [x] 4.1 Extend SQLite/local-D1 contracts with SQL mutation/commit failures, object upload/delete faults and stale-lease outcomes; verify rollback/lifecycle state and existing retry/backoff/attempt policies using deterministic checkpoints and clocks.
- [x] 4.2 Add persisted child-process claim/kill/restart and fixed-builder interruption cases; verify expired work recovers, stale owners cannot complete it, the previous complete release stays served and a corrected retry atomically replaces it.
- [x] 4.3 Exercise hook and Pages timeout, rejection, malformed response and terminal/deadline stubs, then real-backend admin status/recovery checks on both runtimes; verify accepted never implies succeeded, unknown does not advance current site version and publication survives post-commit dispatch failure.

## 5. D1 budgets and dependency audit

- [x] 5.1 Correct per-reference content validation N+1 using a shared bounded bulk media-metadata read on SQLite/D1, preserving missing/inactive rejection, reference locations and transactional guards; verify duplicate IDs and last-chunk failures. Extend D1 instrumentation (including Drizzle raw reads) and authenticated Worker tests for maximal 200-block/200-reference create/save/publish and 201 rejection; assert <=100 parameters per statement and <=50 statements per tested invocation including request overhead and verify full saved/public output.
- [x] 5.2 Run 100/201/501-entry export fixtures crossing hydration chunks, including maximal entries and near-limit JSON cases; verify complete ordered published output, no draft leaks/N+1 growth, query/parameter budgets and record fixture dimensions/output bytes and simulator limits without inventing a product export cap.
- [x] 5.3 Apply targeted audited resolutions (sharp 0.35.5 including Miniflare, undici 7.29.1, tinypool 2.1.2, http-cache-semantics 4.3.0, smol-toml 1.9.0, source-map-js 1.2.2), verify affected runtime/tooling regressions, and rerun advisory/full-lock license inventories; retain explicit restricted esbuild-server/OpenSpec-braces risk dispositions and applicable distribution-license evidence. Audit the locked graph's vulnerabilities and licenses with timestamped tooling/data provenance and production/tooling/artifact classification; deliver finding/disposition tables and verify no unknown, incompatible or undispositioned finding is hidden by a success claim. Pause for a planning update if remediation expands approved scope.

## 6. Reproducible runner and final evidence

- [x] 6.1 Add pnpm verify:34b and local prerequisites/report documentation using sequential owned phases; verify failed/skipped/empty/missing phases, interruption cleanup and not-run reporting with orchestration tests, then execute the complete local source suite.
- [x] 6.2 Run the narrow affected tests, pnpm typecheck, pnpm lint, pnpm format:check, pnpm release:check and pnpm exec openspec validate step-34b-local-security-resilience --type change --strict; verify all required checks pass and record their commands/results.
- [x] 6.3 Refresh reviewed clean-source candidate artifacts for shipped fixes, preserving published versions and the historical 34A inventory; verify release checksums, both-platform image smokes and exact-consumer security/recovery acceptance on the recorded platform. Keep this task pending until actual exact-artifact evidence exists.
- [x] 6.4 Deliver docs/archive/step-34/step-34b-verification.md and a separate 34B artifact/result inventory with source/tree identity, scenario outcomes, fault checkpoints, budget measurements, audit dispositions and platform coverage; update the roadmap and only relevant owner-plan checks, verifying 34C, real deployment acceptance and publication remain explicitly open.
