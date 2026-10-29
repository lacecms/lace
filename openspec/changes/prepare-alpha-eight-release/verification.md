# Alpha.8 preparation verification

## Source state — 2026-10-29 (Europe/Rome)

Implementation is in progress on `codex/prepare-alpha-eight-release`, based on
main `c83e3e1`. Preparation does not publish or deploy. The selected coordinates
are alpha.8/next, ownership template 0.39.0 and sixteen public packages, including
MCP. Alpha.7 remains immutable with its original fifteen-package graph.

`registry-checks.json` records fresh read-only alpha.7 publication and alpha.8
availability checks. Registry availability does not establish publishing rights.

## Gates already passed

- Release graph check and plan agree on alpha.8/template 0.39.0.
- Frozen installation on Node 24.12.0 and pnpm 12.3.4.
- Generator: 64 tests; CLI: 270 tests.
- Focused release model/artifact/publication/cleanup selection: 57 tests.
- MCP provider/type/runtime compatibility: 106 tests across six files on patched
  Better Auth/provider 1.7.7, covering Node SQLite and local Worker/D1.
- Full workspace regression: 44 Turborepo tasks and 222 root tests across 33 files.
- Root typecheck, Oxlint/boundaries/admin colors, Oxfmt, OpenAPI, strict all-spec
  validation and strict validation of this change.
- Documentation check/build and locale/version variant fixture; built-site
  browser smoke confirmed target alpha.8, operations deep page, navigation and
  Pagefind MCP search.
- Packed starter installs/typechecks/builds, with and without globals/site URL;
  alpha.8 browser probes cover list layout hooks, resolved/unavailable internal
  links, direct lazy video and independent preview activation. Existing image,
  animation, cache and SEO cases remain exercised.
- Published alpha.7 generator tarball integrity was verified against npm before
  capturing template 0.35.0 default/Cloudflare fixtures. Packed CLI upgrade
  journeys passed from 0.4.0, 0.14.0, 0.30.0 and 0.35.0 with managed conflicts,
  user-file preservation and repeat-plan stability.
- Docker Buildx is available and Node 24.12.0 executed on linux/amd64 (x64) and
  linux/arm64. This preflight is not the release-image smoke result.

## Dependency/license audit remediation

The initial report at `.release-artifacts/alpha-8-evidence/dependency-audit.json`
failed the existing policy, reporting 1 critical, 15 high, 29 moderate and 5 low
findings. These counts are the scanner's report, not a claim of application
exploitability. No exception was added.

Targeted patched versions were selected only for demonstrated findings: Better
Auth/provider 1.7.7, Hono 4.13.11, Node adapter 2.1.3, Astro 7.3.3, Vite 8.2.4,
Vitest 5.0.3 and Nodemailer 10.1.4; bounded transitive overrides select patched
Vite 8.3.3, Zod 4.6.6, Undici 7.30.1/8.12.2 and Seroval 1.6.11. Delivered Astro
versions and lockfile were updated together. The original two allowed tooling
advisory dispositions remain unchanged in the policy.

The remediated report at
`.release-artifacts/alpha-8-evidence/dependency-audit-remediated.json` passed:
992 locked license records, one explicitly dispositioned esbuild tooling
advisory, no newly accepted vulnerability or license exception. Root, docs and
MCP compatibility gates above ran against the patched dependency graph.

- Packed generated Cloudflare consumer: full local Worker/D1/R2 journey passed,
  including alpha.8 OAuth discovery/consent, official SDK scopes/tools, persisted
  gallery/video draft blocks, configured draft query, forbidden lifecycle,
  unchanged published export, revocation, Viewer write-consent refusal and read
  access. Worker/static/generated-file/diagnostic secret scans passed. This is
  packed-consumer iteration evidence; final release inventory acceptance is below.
- Changed harness contract tests: 12 passed across four files; focused harness
  Oxlint passed with one existing recursion-only parameter warning.

## Pending artifact evidence

Fresh complete two-platform image/package preparation, independent inventory
verification and durable exact-artifact acceptance remain required. Source tests,
packed-consumer iterations and historical alpha.7 receipts are not substitutes
for that evidence. Real VPS/Cloudflare deployment, external-provider video and
actual assistant-client login remain owner-operated checks.

## Initial preparation and builder repair

The clean source at `9a49e69` prepared sixteen archives and the amd64 API image
in `.release-artifacts/alpha-8`, then failed the builder compile stage: pnpm's
native dependency lifecycle invoked node-gyp without Python. No complete
inventory or success receipt was produced; the failed directory is retained.
The builder compile stage now installs build-essential/python3, matching its
existing runtime build toolchain. Its independent amd64 compile-stage build
passed. No runtime feature or audit-policy exception changed. Full preparation
retries from a new clean revision into `.release-artifacts/alpha-8-retry-1`.

## Saved-set verification and acceptance harness follow-up

`.release-artifacts/alpha-8-retry-1` prepared successfully from clean source
`001ad14b83a228c4ac4ccfb79d5963c86a07801f` with source fingerprint
`ccd9cc61a2dde784bee9efa3dd41516a157ed3adb9ab4e82880e32c08dc82643`:
sixteen archives, four images, all platform smokes passed. Independent
`release:verify` confirmed complete/publication-eligible inventory.

The first exact-artifact run passed starter, Node setup/browser publication,
security/roles, production Compose, build failure/retry and service persistence,
then correctly refused an undocumented query-fixture change to lace.config.ts.
The harness now verifies both the original shipping digest and the exact reviewed
query-only configuration transform, preserving refusal of every other edit.
A second shipping scan uses a distinct temporary destination.

The Node MCP test edge also now uses actual HTTPS in front of generated nginx;
production HTTPS checks remain enabled. A direct TLS probe verified that an
untrusted certificate fails, the explicit fixture CA succeeds and canonical Host
is preserved. The paired Undici fetch/Agent are from the same version. These
are harness-only corrections; saved package/image bytes remain unchanged and the
next acceptance records the newer committed harness revision separately.

The focused saved Node production run passed using the original alpha.8 API and
builder images and archives: actual HTTPS edge/canonical Host, OAuth/SDK, read
and write scope ceilings, persisted gallery/video drafts, field queries,
forbidden publishing/deletion, unchanged export, revocation and Viewer consent
limits. Generated files, package/image filesystems, served releases and service
logs passed secret scans; temporary containers and files were cleaned. This
focused phase deliberately writes no full release acceptance receipt.
The native client callback uses a separate HTTP loopback redirect while the
protected resource remains HTTPS, as the provider requires. The full run uses
committed harness `91215e4` and the unchanged source-001ad14 saved set.

Later unified legacy coverage also passed block order, weak ETags and builder
source diagnostics. Its operations suite exposed stale harness expectations:
engine alpha.7, Gallery v3 and the pre-CQ1 cursor error code. Expectations now use
alpha.8, accepted Gallery v4 and 422 VALIDATION_FAILED at /after; all 28 focused
operations/runner tests passed on Node/Worker. The Node HTTPS/MCP hook now runs
before the original Compose stack is removed by field-trial teardown. These are
verification-only updates; the saved runtime/package set remains unchanged.
The full workspace suite was repeated after the Docker/harness repair: 44 tasks
and 222 root tests passed again. Final unified acceptance remains pending until
its durable receipt is present.
