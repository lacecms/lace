# Step 34B — local security and resilience verification

Recorded 2026-10-07. Change: `step-34b-local-security-resilience`.
Completion: **18/18 tasks**; local implementation and acceptance complete.

The earlier host/origin/resilience progress files preserve historical pauses and
findings. This report and its inventory provide the final completion status.

## Scope and provenance

The shipped implementation uses the clean candidate revision and source-tree
fingerprint in [the separate 34B inventory](step-34b-artifacts.json). The historical
[34A inventory](step-34a-artifacts.json) is unchanged. Candidate versions are
`0.1.0-alpha.4` / generator `0.1.0-alpha.4` / template `0.19.0`; published
alpha.1–alpha.3 coordinates are preserved. Read-only npm lookups returned 404 for
all 15 alpha.4 package coordinates before preparation. No registry push occurred.
Documentation/task bookkeeping after preparation is distinguished from the
candidate's source revision.

The initial complete source runner passed all ten required phases against a
dirty tree based on `35273f425cace64ba20c6a4883fae34ae98f504c`, using explicitly
selected historical Compose fixture images. After two integration corrections,
the full runner was repeated from the clean final candidate revision with its
own r3 images. The separate reports distinguish source tests from exact consumer
acceptance; old images are never evidence of shipped fixes.

## Security outcomes

- TCP peers and explicitly trusted, validated proxy CIDRs determine Node client
  identity. Both auth limiters receive the same sanitized identity; Cloudflare
  uses provider ingress identity. Spoofed/malformed forwarded chains, IPv4/IPv6,
  shared proxies, separate actors, Retry-After and HMAC-only buckets are covered.
- Cookie-authenticated mutations reject foreign, opaque/malformed origins and
  origin-less cross-site Fetch Metadata. Production origins and development
  loopback aliases follow the provider policy. Non-browser operator requests and
  safe reads retain their intended behavior. Real SQLite and local D1 cases
  verify disabled/revoked/expired sessions, closed signup, permission/token
  boundaries and unchanged protected state after rejection.
- Host migrate, content sync/check and bootstrap inspect actual Docker storage
  mappings before SQLite opens. Running consumers and inconclusive inspection
  fail closed with sanitized exit 6; explicitly stopping api/dispatcher permits
  maintenance. Bind aliases, working directories, volumes and excluded targets
  have focused coverage. See [host evidence](step-34b-host-safety.md).
- Both adapters validate complete PNG/JPEG/WebP/AVIF containers before accepting
  images; Node also retains sharp dimension checks. Malformed, oversized,
  mismatched and trailing-executable data, unsafe rich text/URLs and builder
  command/path/environment input have negative cases.
- Runtime, provider, CLI and built static output are scanned for injected secret
  sentinels. Provider errors use fixed records rather than raw payloads. A
  deliberately injected leak fails the detector without printing its secret.

## Fault checkpoints and recovery

SQL statement failure and deferred foreign-key commit failure roll back complete
SQLite/local-D1 aggregates; corrected retry succeeds. Actual MinIO/R2 upload
failure and metadata-after-object failure verify lifecycle/cleanup. Deletion
exhausts eight attempts, reaches terminal failure and recovers after an explicit
corrected retry.

Persisted child processes report a durable claim, are killed and restarted from
file SQLite or persisted local D1. After the 60000 ms lease expires the new owner
reclaims work; stale completion is rejected. Interrupted fixed-command builder
output leaves the previous complete release served by an actual HTTP server;
corrected retry switches atomically to complete output and retains the old release.

Controlled hook/Pages fixtures cover rejection, malformed responses, abort,
timeout and terminal/deadline results. Real Node/MinIO and Worker/D1/R2 admin
browser cases cover succeeded/failed/accepted/cancelled/unknown, allowed retry and
HTTP 202. Accepted/unknown do not promote the target into succeeded history.
Post-commit trigger failure does not undo publication. These are local provider
fixtures, not remote Pages/VPS deployment claims.

## D1 budgets and dependency dispositions

Shared bounded bulk metadata validation fixes per-reference N+1, deduplicates
lookup IDs while preserving reference locations and transactional guards, and
rejects 201 locations before reads/writes. The measured authenticated HTTP
invocations include raw Drizzle reads, auth overhead and settled owned jobs:
create/save/publish at 200 blocks/references use 30/36/25 statements, with at most
100 parameters per statement. Duplicate-ID and last-chunk missing/inactive cases
pass without protected-state changes.

Complete ordered exports at 100/201/501 entries use 9/15/27 statements and
4212273/4314485/4618085 response bytes. Each includes two maximal image entries
and near-1000000-byte JSON fixtures; all values/order are compared and draft
sentinels are absent. [Dimensions and results](step-34b-d1-budgets.json) are finite
local simulator measurements, not a global export cap or production D1 capacity
claim. Remote confirmation remains an owner check.

The [audit report](step-34b-dependency-audit.md) retains the initial 19 findings
and the approved remediation. The final graph has 848 package/version license
records, zero missing/unknown identifiers and two explicitly restricted advisory
records: moderate esbuild 0.18.20 (never start/expose its legacy development
server; review on loader changes) and high braces 3.0.3 (trusted OpenSpec patterns
only; review on upstream patch/untrusted-input changes). There are zero critical
or undispositioned findings; this is not a zero-vulnerability claim.

Admin/Worker assets retain dependency and font notice texts, including Inter OFL.
Exact API image inspection verifies sharp 0.35.5, libvips 8.18.7, sharp-libvips
1.3.4 component versions/licensing README and working native conversion on both
architectures. The unmodified dynamically loaded libraries remain replaceable;
notices retain exact upstream source/build-recipe links. This records inspected
distribution evidence and accepted conditions, not a blanket legal guarantee.

## Commands and results

- `pnpm verify:34b` with explicit local API/builder/MinIO image IDs: all ten
  phases passed, including 169 security, 97 repository/restart, 50 provider,
  4 storage/admin, 1 static-output and 2 D1-budget tests; zero skipped cases.
- Affected dependency suites: 314 tests across 33 files. Runner/release suites:
  42 tests across 5 files. After the exact installation caught the empty proxy
  setting regression, the corrected Node/client suites passed 118 tests across
  8 files. The next exact run exposed Hono Request-facade/native-constructor
  incompatibility at the auth boundary. Materializing a clone before replacing
  headers corrected it; real TCP login/session and auth suites passed 9 tests
  across 2 files. Empty/unset/whitespace proxy configuration now trusts only the peer;
  empty members in a nonempty list still fail closed.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm release:check`,
  `git diff --check` and `pnpm exec openspec validate
  step-34b-local-security-resilience --type change --strict` passed after the
  correction. Lint retains four pre-existing database-test `no-new-array`
  warnings; the admin build retains its existing bundle-size warning.
- `pnpm release:prepare --output .release-artifacts/alpha-4-34b-r3` builds from
  the recorded clean source with Node 24.12.0 and pnpm 12.3.4.

- `pnpm release:verify --output .release-artifacts/alpha-4-34b-r3`: complete,
  checksum/identity verification passed for 15 packages and four saved images.
- `pnpm acceptance:release --artifacts .release-artifacts/alpha-4-34b-r3`:
  passed, including cleanup. Node and local Worker exact-artifact security,
  Compose host guard, controlled build failure/corrected retry, persisted
  drafts/public export/object bytes/static output, complete generated journeys,
  Pages tracking, secret exclusion, old-template upgrades, block order, weak
  ETags, builder source diagnostics and operator-credential regressions passed.
  The inventory contains all 14 named journey results and actual build IDs.

## Exact candidate integration notes

Candidate revision: `70ab0d7e7e15952da94886d6144b95f69240e2a5`;
fingerprint: `53f6c605363d2b8844131ed5607b17c88f2e54e841a89e822381558a48abffe1`.
The acceptance harness adds the test-only correction at `f620622`: the
origin-less cross-site probe uses a valid user payload so it reaches the auth
boundary instead of failing DTO validation first. No package/image product code
changed after candidate preparation. The inventory records both identities.

The first clean candidate exposed empty proxy-setting parsing; the second exposed
Request-facade interoperability in real HTTP authentication. Neither failed
candidate is accepted. A source rerun using obsolete r2 fixture images likewise
failed at sign-in and left subsequent phases not-run. All were corrected and
rerun against the final product artifacts. The first r3 consumer run stopped on
an invalid test payload (HTTP 422, no mutation); the corrected harness is the
recorded final acceptance.

Image/native/admin smokes cover `linux/amd64` (emulated) and `linux/arm64`.
Full consumer acceptance runs on the native arm64 Docker host and local Worker;
it does not claim a full amd64 consumer run. Failed-build recovery advances only
the disposable outbox retry availability timestamps, retaining the eight-attempt
policy and durable failure state, before restoring credentials and explicitly
retrying. Previous static output remains served, then a corrected release is
served after success. Checksums, immutable image IDs, builds and consumer
journey outcomes belong to the separate result inventory.

## Completion boundary

Session 34C, real proxy/TLS/provider configuration, remote D1/resource limits,
real VPS/Cloudflare deployment and coordinated restore acceptance, registry
publication and stable-release approval remain open in the
[owner plan](../../real-application-verification.md). This change is not archived
or synchronized into accepted specs by this implementation turn.
