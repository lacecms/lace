# Alpha.8 local release readiness

## Result

**Accepted locally; ready for the owner's separate publication operation.**
Candidate `0.1.0-alpha.8` on `next`, generator `0.1.0-alpha.8`, ownership template
`0.39.0`: sixteen public packages including `@lacecms/mcp`, plus API and builder
images for `linux/amd64` and `linux/arm64`. No remote publication or deployment
was performed. All 17 implementation tasks are complete.

## Immutable identities

- Saved set: `.release-artifacts/alpha-8-retry-1`.
- Inventory SHA-256: `eaf49e4c61974af82aea9357e5c89444b3a3f61e5110f62536ac6264b1847971`.
- Acceptance SHA-256: `6110952808ea704c0aec6d128318af05dedcb5fc4bc4aacb71b21954d41ea0ce`.
- Artifact source: `001ad14b83a228c4ac4ccfb79d5963c86a07801f`.
- Source fingerprint: `ccd9cc61a2dde784bee9efa3dd41516a157ed3adb9ab4e82880e32c08dc82643`; clean source, no preview.
- Acceptance harness: `f3e4e1fb66c1679b203c8f2399591c7a6991aa90`.
- Acceptance recorded at: `2026-10-29T22:19:01.902Z` (UTC machine timestamp).
- End-to-end consumer platform: `linux/arm64`.

The committed harness is newer than the package/image source: it refreshes
legacy test expectations, verifies the exact query-only consumer configuration
transform and supplies a real HTTPS test edge before Compose teardown. Shipping
archives/images were not rebuilt or changed for those harness corrections.
The initial `.release-artifacts/alpha-8` preparation failed its builder compile
stage and remains preserved; it is not the accepted publication set.

## Verification and limits

| Gate | Result |
| --- | --- |
| Full source regression | 44 Turborepo tasks; 222 root tests passed |
| MCP provider/type/runtime compatibility | 106 tests passed on patched Better Auth/provider 1.7.7 |
| Generator / CLI / focused release tests | 64 / 270 / 57 passed |
| Operations / harness contracts | 28 / 12 passed |
| Typecheck, Oxlint, Oxfmt, OpenAPI, OpenSpec strict | Passed |
| Docs validation/build/variants and browser smoke | Passed; alpha.8 identity, deep navigation and Pagefind search |
| Dependency/license policy | Passed; 992 locked license records and one existing accepted esbuild tooling advisory |
| Package/image preparation | Complete and publication-eligible; all four platform smokes passed |
| Independent saved-artifact verification | Passed |
| Full exact-artifact consumer acceptance | Passed; receipt saved only after cleanup |

The full receipt contains 22 named journeys. It covers packed
starter and existing-site builds, Node/Compose browser/setup/publication, roles,
draft isolation, media/images/caches, failure/retry/persistence, local Worker/D1/R2,
Pages tracking stubs, historical upgrades including alpha.7, block order, weak
ETags, source diagnostics, credential separation and restore/rotation. Alpha.8
adds list/video draft persistence, internal-link rendering, configured draft
queries and MCP default-off/enabled OAuth/SDK, role/scope limits, denied lifecycle
operations, unchanged public export and owned revocation. Node MCP uses an actual
HTTPS edge with an explicitly trusted fixture CA; Host/Origin, TLS validation and
production HTTPS requirements remain enabled. Final file/image/log scans passed.

Both Linux platforms passed image smokes; full consumer flow ran on
`linux/arm64`. Worker/D1/R2, Pages API stubs, intercepted video providers
and SDK clients are local evidence. They do not establish a real Cloudflare/VPS
deployment, actual assistant-client login, provider playback or production restore.
Source replay/concurrency/D1-budget cases remain separately identified source
coverage, not additional saved-image platform claims. The audit's permitted
advisory is visible; this is not a zero-vulnerability claim.

## Package archives in publication order

All entries below are version `0.1.0-alpha.8`; filenames are relative to the saved set.

| Package | Archive | SHA-256 |
| --- | --- | --- |
| `@lacecms/content` | `packages/lacecms-content-0.1.0-alpha.8.tgz` | `4beeb1a049a1b63b8a66a8e9d19dfebe22fd23bbe9a22da89c3ff5378ce0746b` |
| `@lacecms/config` | `packages/lacecms-config-0.1.0-alpha.8.tgz` | `133f2809868639facb79773fb64944eef8c5a936ed10c84c1e98c30ceb429273` |
| `@lacecms/domain` | `packages/lacecms-domain-0.1.0-alpha.8.tgz` | `1f37c5b87e43a6034010e2b20d380700253f26b7f41dcabbe9aafd224086d0cb` |
| `@lacecms/application` | `packages/lacecms-application-0.1.0-alpha.8.tgz` | `3c8953f5ec1699d9dad8c3f4f5a7b9623a1f52474ead7d384bfea674540ec225` |
| `@lacecms/render` | `packages/lacecms-render-0.1.0-alpha.8.tgz` | `f1bec809be84a7d039b7a7df23786aefad79fa72c3ec06b3aa38de5a67a11418` |
| `@lacecms/contracts` | `packages/lacecms-contracts-0.1.0-alpha.8.tgz` | `eaeaa94336f4fb94bb4dd9a869bc239bcae44a9a02fa794221a2b01957137a24` |
| `@lacecms/sdk` | `packages/lacecms-sdk-0.1.0-alpha.8.tgz` | `cd64c5b72e0a9d416e17506519cba878e81746f2c17b3241416b2de30c853e08` |
| `@lacecms/astro` | `packages/lacecms-astro-0.1.0-alpha.8.tgz` | `88dd1b3fa0f56167f61100271679bffb9fc7b627ae41967d5c645d6cce364770` |
| `@lacecms/auth` | `packages/lacecms-auth-0.1.0-alpha.8.tgz` | `e40ce7431bf25b2ac4745ad9df74cefd8cd84f42fcdb2633d60510a08718765a` |
| `@lacecms/db` | `packages/lacecms-db-0.1.0-alpha.8.tgz` | `c4e52b7c7bc177b39e9356cdb23c3a2f9fc598d8423400317d62e1eb57ca4da1` |
| `@lacecms/mcp` | `packages/lacecms-mcp-0.1.0-alpha.8.tgz` | `f0206c093456bba1a8a3b3c23b93829e0a30718d80b26af3c21ef6d1210c06ae` |
| `@lacecms/server` | `packages/lacecms-server-0.1.0-alpha.8.tgz` | `b259a231bed4ef7d4844ca18327194fda791b73f6c15cd7f7cfd617eac476e97` |
| `@lacecms/platform-cloudflare` | `packages/lacecms-platform-cloudflare-0.1.0-alpha.8.tgz` | `7718bf2863d744fc83a190a4410b72b292700b5c8c63a4f035b3edfcfd186d29` |
| `@lacecms/platform-node` | `packages/lacecms-platform-node-0.1.0-alpha.8.tgz` | `a182ed7c51bfe70c2f67f6750272098e148361af20024837a6f35d7e08d9a8d9` |
| `@lacecms/cli` | `packages/lacecms-cli-0.1.0-alpha.8.tgz` | `a5ea342d0cba8a9dd4edfa4cc7343af1cad044b43f919a1d5d06e5f53719ae83` |
| `create-lace` | `packages/create-lace-0.1.0-alpha.8.tgz` | `151f273d71adcd61300c8169bb79c01867f3e96fa29fd3eff302649235f1666b` |

## Image archives

Identifiers below are local image/index IDs, not remote registry digests.

| Image | Platform | Local identifier | Archive SHA-256 |
| --- | --- | --- | --- |
| `api` | `linux/amd64` | `sha256:baeaf515c463721b3799d944cc53fd6f88f14f98992ef253aeaac6ab70acecc9` | `e8474d06fb263a15e9f3d5443990d1a830ab3c9d80f582d6030d8ab6a5923034` |
| `builder` | `linux/amd64` | `sha256:0bd8d5487988f0b7d661445e4221ea210d86ce1a10b82006ee2783783e8b45d6` | `caa412b4217c33bf882dcd257db0376af40490aad27187a37bb967f9aafd5225` |
| `api` | `linux/arm64` | `sha256:aba638a737e9ea72c2a3ad0de727c7e74263e192fe3605a3581171ddf446badb` | `392be08afbb1d3939c7ee669c8fc670ecda13090b26d9c3833d2d3dd61fd352f` |
| `builder` | `linux/arm64` | `sha256:1e93abb96bf65edeac471440fcc4f18924f8e8b7cc3cd5ba3f0dfac01b944e95` | `27c171e5d54d0792ad7fb0b136f2b912046ccb7e75aacf500029c51f3cba5ddb` |

## Reproducible commands and owner handoff

Preparation used Node `24.12.0` and pnpm `12.3.4` with frozen dependencies:

```sh
pnpm release:prepare --output .release-artifacts/alpha-8-retry-1
pnpm release:verify --output .release-artifacts/alpha-8-retry-1
pnpm acceptance:release --artifacts .release-artifacts/alpha-8-retry-1
```

Do not rerun preparation into this saved destination or overwrite its successful
acceptance receipt. Keep archives, inventory, acceptance and publication journals
together. Subsequent verification can reuse the existing bytes.

Before any live publication, authenticate and check npm/GHCR rights, recheck all
immutable coordinates and make the artifact source plus reviewed notes commits
available in the source repository. GitHub finalization must tag the artifact
source commit above, even when the notes/harness commit is newer. Preview first:

```sh
pnpm release:publish:npm --artifacts .release-artifacts/alpha-8-retry-1 --dry-run
pnpm release:publish:images --artifacts .release-artifacts/alpha-8-retry-1 --dry-run
```

The owner may then explicitly request publication of the saved set; removing
`--dry-run` performs live npm/GHCR operations. GitHub finalization is a separate
operation after complete public publication and byte verification:

```sh
pnpm release:github --artifacts .release-artifacts/alpha-8-retry-1
# Live finalization only with explicit owner authorization:
pnpm release:github --artifacts .release-artifacts/alpha-8-retry-1 --apply
```

Remaining real-deployment/client checks are in
[real application verification](../../../docs/real-application-verification.md).
Upgrade guidance covers Gallery v4, export format 2, migrations 0010–0013,
coordinated dependencies/images, user-owned source conflicts, patched framework
adoption, matching backups/rollback and optional MCP activation:
[alpha.8 compatibility](../../../docs/compatibility.md#alpha-8-upgrade-and-rollback).
[CHANGELOG.md](../../../CHANGELOG.md) is the reviewed source for concise release
prose; historical alpha.7 artifacts and evidence remain immutable. No historical
release cleanup or OpenSpec archive was performed.
