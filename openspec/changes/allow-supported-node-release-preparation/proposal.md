## Why

Release preparation rejects Node 24.22.1 even though the repository declares Node `>=24.12.0`. The owner wants preparation to accept the declared minimum range instead of one exact Node version.

## What Changes

- Accept Node `>=24.12.0` without an upper bound when preparing releases; reject older versions before claiming an output directory. Keep pnpm `12.3.4` exact and preserve frozen installation and all other preparation gates.
- Keep the tested CI and Docker Node pins, package engine minimums and compatibility claims unchanged. Document that a newer eligible preparation Node is not automatically tested or reproducible against another version; record the actual toolchain in preparation evidence.
- Cover the version boundary and preparation gate, including a supported newer version and unchanged pnpm enforcement. Preserve existing release inventory compatibility.

This owner-requested tooling adjustment is independent of the refactoring roadmap sessions; it follows RF4C and does not change architecture §3 product scope or §6 package boundaries. The current `alpha-release-artifacts` requirement pins the whole preparation toolchain and is deliberately revised; `runtime-tooling-minimum-policy` already distinguishes minimum eligibility from tested CI/Docker pins and remains in force. Historical release acceptance requirements and evidence are not rewritten.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alpha-release-artifacts`: allow a minimum-compatible Node for local preparation while retaining the exact pnpm pin and preparation evidence.

## Impact

- `scripts/release.mjs`, focused release tests and current preparation guidance in `docs/alpha-release.md`, `docs/compatibility.md` and `docs/verification.md`.
- Release preparation eligibility changes; no package engine declaration, CI image, pnpm version, runtime API, published artifact or historical release evidence changes.
- Depends on the existing `>=24.12.0` engine contract and release preparation workflow. No new dependency is required.
