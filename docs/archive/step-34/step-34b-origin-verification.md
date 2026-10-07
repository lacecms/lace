# 34B origin correction — partial source evidence

Recorded 2026-10-07, working tree based on `35273f425cace64ba20c6a4883fae34ae98f504c`. The owner confirmed the proposed origin planning revision; proposal, design, capability delta and task 3.1 were updated before implementing the shared auth boundary correction. Overall progress is 6/18 tasks. This is source evidence, not refreshed candidate or deployed TLS acceptance.

## Corrected behavior

`packages/auth/src/index.ts` computes the trusted-origin set once for Better Auth and Lace actor resolution. Unsafe methods with an explicit untrusted, opaque or malformed Origin, or origin-less cross-site browser Fetch Metadata, cannot resolve a session actor. The existing authorization envelope denies protected work. Canonical-origin mutations and ordinary origin-less non-browser operators remain supported. Safe reads retain their existing contract. Development-only loopback aliases retain scheme/port restrictions and are not trusted in production.

The shared `tests/security-boundary.test.mjs` matrix uses actual file-backed SQLite and local Miniflare D1/R2 compositions. Verified checks include production Secure/HttpOnly/SameSite=Lax cookies, foreign/null/malformed/list/incorrect-port origins, missing-Origin cross-site mutations, admin/editor/viewer/build-token denials, closed public enrollment, provider sign-out origin denial, expired/revoked sessions, disabled users, canonical origin and development/production aliases. Rejected user, content, token and media operations compare persisted protected tables before and after. Public-signup and provider sign-out negatives additionally preserve provider session rows. Operator requests without Origin remain successful.

## Commands and results

- `pnpm exec turbo run build --filter=@lacecms/platform-node --filter=@lacecms/platform-cloudflare --output-logs=errors-only`: passed.
- `pnpm exec vitest run tests/security-boundary.test.mjs --maxWorkers=1 --exclude='.release-artifacts/**' --exclude='.lace-acceptance/**'`: passed 12 tests before adding task 3.2 cases.
- Existing auth, Node index and Worker suites: passed 41 tests in three files.
- Media/render/content/security-contract/builder suites plus the expanded security file: 181 passed, one failed (Node trailing-data acceptance described below); all 12 task 3.1 cases remained passing.
- `pnpm release:check`: passed; no remote mutation.
- Root typecheck, lint, formatting and `pnpm exec openspec validate step-34b-local-security-resilience --type change --strict`: passed. Lint retains four pre-existing database-test warnings.

## Task 3.2 finding and pause

Task 3.2 remains unchecked. Its authenticated Node media test accepts PNG bytes with a `<script>` suffix (HTTP 201 instead of 422), while the equivalent Worker test passes. A focused `packages/platform-node/src/image-inspector.test.mjs` run confirms four valid-format positive cases pass and all four trailing-script negative cases fail: PNG, JPEG, WebP and AVIF. The Node adapter currently asks sharp only for metadata; that does not validate that the whole upload is exactly one image. This contradicts the accepted `media-use-cases` requirement to reject polyglot/trailing executable content.

A concrete planning patch is prepared at `/private/tmp/lace-34b-image-plan.diff` but not applied. It adds the corrective work to proposal/design/task 3.2: share the existing portable Worker container parser through the application layer with both adapters, preserve Node sharp dimensions and the accepted limits, and prove rejection before storage/metadata. No dependency, DTO, database migration, export cap or cross-adapter import is proposed. The existing media specification already requires this rejection, so its accepted contract needs no change.

The new regressions intentionally remain red pending approval and implementation. The full security suite, source verification, refreshed artifact acceptance, tasks 3.2–6.4, session 34C, remote deployment acceptance and publication are not complete.

## Later progress

The owner approved the image correction and tasks 3.2–4.3 are now verified. Current progress is 11/18; task 5.1 has reproduced a separate full-HTTP D1 N+1 budget failure. See `step-34b-resilience-progress.md` for current results and the proposed planning revision. Earlier pause descriptions above are retained as historical evidence.
