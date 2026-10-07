# Compatibility baseline

## Status

Lace is pre-release. This document records the initial development baseline;
it is not a promise of production support or backward compatibility.

## Exact versions selected and smoke-tested

The versions below were resolved from their authoritative release channels on
2026-09-07. They are selected as exact versions and will be pinned through the
root pnpm catalog and lockfile. The temporary smoke workspace installs this set
together on Node 24.12.0.

| Component | Exact version | Authoritative source |
| --- | ---: | --- |
| Node.js LTS | 24.12.0 | <https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt> |
| pnpm | 12.3.4 | <https://registry.npmjs.org/pnpm/latest> |
| TypeScript | 7.0.2 | <https://registry.npmjs.org/typescript/latest> |
| Turborepo | 2.10.12 | <https://registry.npmjs.org/turbo/latest> |
| OpenSpec | 1.12.0 | <https://registry.npmjs.org/@fission-ai%2Fopenspec/latest> |
| Oxlint | 1.81.0 | <https://registry.npmjs.org/oxlint/latest> |
| Oxfmt | 0.66.0 | <https://registry.npmjs.org/oxfmt/latest> |
| Hono | 4.13.7 | <https://registry.npmjs.org/hono/latest> |
| Valibot | 1.4.2 | <https://registry.npmjs.org/valibot/latest> |
| Drizzle ORM | 0.45.2 | <https://registry.npmjs.org/drizzle-orm/latest> |
| Better Auth | 1.7.3 | <https://registry.npmjs.org/better-auth/latest> |
| Astro | 7.3.1 | <https://registry.npmjs.org/astro/latest> |
| React and React DOM | 19.2.8 | <https://registry.npmjs.org/react/latest> |
| Vite | 8.2.2 | <https://registry.npmjs.org/vite/latest> |
| Wrangler | 4.129.0 | <https://registry.npmjs.org/wrangler/latest> |
| Vitest | 5.0.0 | <https://registry.npmjs.org/vitest/latest> |
| Playwright | 1.63.0 | <https://registry.npmjs.org/@playwright%2Ftest/latest> |
| better-sqlite3 | 13.0.3 | <https://registry.npmjs.org/better-sqlite3/latest> |

The source URLs identify the release channels used for selection. The committed
lockfile, once created, is the reproducible resolution record.

### Smoke result

On 2026-09-07, a disposable pnpm 12.3.4 workspace on macOS arm64 and Node
24.12.0 installed the exact baseline with a frozen lockfile. The check ran the
OpenSpec, Turbo, Oxlint, Oxfmt, TypeScript, Wrangler, Vitest, and Playwright
CLIs, then imported Astro, Better Auth, Drizzle, Hono, React, Valibot, Vite,
Vitest, and Playwright. It also created an in-memory native `better-sqlite3`
database and loaded Drizzle's `better-sqlite3` adapter successfully.

pnpm 12 blocks lifecycle scripts unless they are explicitly allowed. The smoke
workspace used an `allowBuilds` map for `better-sqlite3`, `esbuild`, `pnpm`, and
`workerd`; Step 1 MUST carry forward the least-privilege allowlist before it
adds packages that require these builds. The temporary workspace and its
dependencies are removed after this result is recorded.

## Supported runtime ranges

These are the intended MVP development targets. A range is a support policy,
not evidence that every member of the range is continuously tested.

| Boundary | Supported range | Notes |
| --- | --- | --- |
| Node.js | 24.x LTS, starting at 24.12.0 | Node runs the VPS API, builder, CLI, and local tooling. |
| pnpm | 12.x | Corepack manages the declared pnpm version. |
| SQLite | 3.35 or later | Node uses `better-sqlite3`; Cloudflare D1 compatibility is verified separately in its runtime milestone. |
| Wrangler | 4.x | Cloudflare development and deployment tooling. |
| Browsers | Current and immediately previous stable Chrome, Edge, Firefox, and Safari | Applies to the future admin SPA; browser-flow coverage is introduced with the admin milestones. |

## CI-used versions

Step 1 configures GitHub Actions CI with Node 24.12.0 and pnpm 12.3.4 through
Corepack. CI restores a pnpm-store cache keyed by operating system, those exact
versions, and `pnpm-lock.yaml`; it does not cache `node_modules`.

Every CI run installs with `pnpm install --frozen-lockfile`, verifies that the
lockfile remains unchanged, then invokes the same root quality commands used
locally: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build`, and `pnpm spec:validate`.

### Dependency-boundary compatibility bridge

`dependency-cruiser` is intentionally not installed, configured, or run in
Step 1: version 18.2.0 supports TypeScript releases below the project-pinned
TypeScript 7.0.2 baseline. The root lint command therefore runs a temporary
TypeScript source-level boundary checker. It rejects forbidden architecture
edges, cycles, cross-package source-path access, and Node built-ins in the
portable `content` and `config` packages.

Replace this checker with dependency-cruiser only after a dependency-cruiser
release supports parsing TypeScript 7 without lowering the project's TypeScript
baseline. That migration must retain the same boundary checks and negative
fixture coverage.

## Alpha release line

Lace artifacts are experimental prereleases on the npm `next` channel. One
release definition (`release/alpha.json`) pins the package, generator and
API/builder image version together with the generator's ownership template
version; mixing artifacts from different versions is unsupported.

| Release | Template | Status | Notes |
| --- | --- | --- | --- |
| `0.1.0-alpha.1` | `0.4.0` | Published 2026-09-30, immutable | Predates environment preparation, doctor, browser setup, the tour, existing-site mode, `lace add block`, `@lacecms/astro`/`@lacecms/render` and the generated Cloudflare Worker |
| `0.1.0-alpha.2` | `0.14.0` | Published 2026-10-04, immutable | Carries the onboarding feedback improvements of Steps 26–31; field-tested by the owner (alpha.2 feedback) |
| `0.1.0-alpha.3` | `0.17.0` | Prepared and accepted locally (Step 33H); npm publication recorded on 2026-10-07 | Carries the alpha.2 field-trial fixes of 33A–33G: block order, weak ETags, builder source diagnostics, seven-status build history with Pages tracking, explicit Cloudflare credentials and preflight, scenario guides and minimum-only engines |
| `0.1.0-alpha.4` | `0.18.0` | Local verification candidate (Step 34A); not published | Cross-runtime API/browser/Astro verification and accessible failed-build explanations; no new database migration |

Templates `0.15.0` and `0.16.0` were source-only steps between the published
alpha.2 and the alpha.3 candidate; their upgrade instructions remain listed for
projects upgrading from `0.14.0`. Upgrading an alpha.2 installation also
requires database migration `0003_site_build_outcomes` before the alpha.3
engine serves traffic (back up first; downgrade restores the backup), as the
`0.17.0` upgrade instructions state for Node SQLite and Cloudflare D1.

Both runtime images target `linux/amd64` and `linux/arm64`; each platform is
built and smoke-tested separately during preparation, while the full consumer
journey runs on the host's platform. Consumer packages and generated projects
declare minimum-only engines (see below). Existing projects move between template versions
with `lace upgrade` (user-owned README, `lace.config.ts`, `.env`, site source
and `worker/wrangler.jsonc` are never modified; managed-file edits are reported
as conflicts) and then follow the template's upgrade instructions to update
their image references and site dependencies. On Docker Desktop and OrbStack
(macOS/Windows), the Compose data directory crosses a VM file share without
shared SQLite locks or WAL memory: host `lace` database commands must run only
while the `api` and `dispatcher` services are stopped, as the generated guides
state. Linux hosts share the kernel with their containers and are not affected.
Exact candidate evidence is in
`docs/archive/step-33/step-33h-verification.md` (alpha.3) and
`docs/archive/step-32/step-32b-verification.md` (alpha.2); preparation and publication
are described in `docs/alpha-release.md`.

## Minimum requirements and tested versions

Engine declarations state minimums only. The repository root, the generated CMS
`package.json` and every public Lace package declare Node `>=24.12.0`; the root
and generated CMS also declare pnpm `>=12`. Release validation
(`scripts/release-model.mjs`) rejects any other declaration, including the
former `<25`/`<13` upper bounds. Doctor evaluates the consumer project's own
declaration, so a project that keeps an explicit upper bound is still held to it.

A version that satisfies a minimum is **eligible**, not tested. Reproducibility
pins are separate and unchanged by the minimums:

| Pin | Value | Where |
| --- | --- | --- |
| Tested Node | `24.12.0` | CI workflows, `node:24.12.0-bookworm-slim` API/builder images, release preparation |
| Tested pnpm | `12.3.4` | `packageManager` (root and generated CMS), API/builder images |
| Dependencies | exact versions | `pnpm-lock.yaml` and the workspace catalog |

Dependency engine audit (2026-10-06, resolved lockfile metadata): Astro 7.3.1
`>=22.12.0`, better-sqlite3 13.0.3 `>=22`, Wrangler 4.129.0 and Miniflare
`>=22.0.0`, Vite 8.2.2/8.3.0, Oxlint 1.81.0 and Oxfmt 0.66.0
`^20.19.0 || >=22.12.0`, `@aws-sdk/client-s3` 3.1133.0 `>=20.0.0`, OpenSpec
1.12.0 `>=20.19.0`, TypeScript 7.0.2 `>=16.20.0`, Hono `>=16.9.0`, workerd
`>=16`; Better Auth, Drizzle ORM and Turbo declare none; pnpm 12.3.4 declares
Node `>=18.*`. Nothing requires more than Node 24.12.0. Vitest 5.0.0 declares
`^22.12.0 || ^24.0.0 || >=26.0.0`, so Node 25 is eligible for consumers but not
for running this repository's test suite. Engine metadata alone is not runtime
certification.

A newer Node or pnpm major enters the tested matrix only after a recorded check
on that exact version: frozen install of the workspace and a packed generated
consumer, native `better-sqlite3` loading, CLI generation and `lace doctor`,
`pnpm build` of a generated site, and the relevant runtime smoke (Node API
readiness; local Worker bundle and `cf:dev` for Cloudflare). Record the exact
version, platform, date and passing scope here. Adding a tested major does not
change the minimums or the pins above, and it is never real-account
verification.

## Baseline refresh policy

Refreshes must resolve current stable releases from the listed sources, run the
disposable smoke check on the selected Node LTS, update the catalog and lockfile
together, and record the new selection date. Framework major upgrades require
test and migration review, as required by the architecture dependency policy.
