## Why

Roadmap Step 34A must establish one reproducible local proof that Node and Cloudflare implement the same product contracts before the stable contract freeze. Existing repository contracts and separate browser journeys provide substantial coverage, but do not yet constitute a shared API response oracle and an explicit two-runtime Astro comparison.

## What Changes

- Run the existing identical repository contracts against migrated file-backed/in-memory SQLite and local D1.
- Add shared seeded API scenarios and expected response fixtures exercised through the actual Node and local Worker composition roots.
- Complete real-backend Playwright coverage on both runtimes for admin/editor/viewer, conflict recovery, media reuse, publication/build failure, and expired sessions, reusing existing browser helpers where appropriate.
- Build the Astro fixture from each runtime's authenticated export and compare canonical published data, emitted routes, and media references.
- Retain the current v1 public entry DTO (optional `published` in the shared schema, present on successful public entries, mirrored `draft`) for compatibility. Verify that the mirrored snapshot contains published data only and the SDK site view exposes no draft or editorial metadata. Record this contract-freeze decision explicitly.
- Fix the browser-discovered WCAG AA contrast failure in the Builds failure explanation using the existing foreground token. Refresh the candidate package/image/template coordinates and locally verify the new artifact set; published alpha.3 stays immutable.
- Restore sign-in recovery for expired-session errors from editor Save, Publish and Reload draft using the existing session recovery mechanism without changing authorization policy.
- Provide a single local verification entry point and an evidence record identifying source, candidate artifacts, runtime/scenario results, and limitations.

## Capabilities

### New Capabilities

- `cross-runtime-product-verification`: repeatable local repository, API, browser and Astro parity proof with common fixtures and attributable evidence.

### Modified Capabilities

- `alpha-release-artifacts`: preserve published alpha.3 and select alpha.4 with template 0.18.0 for the approved correction. Existing v1 public contracts and published-site loader behavior are retained.

## Impact

Architecture basis: `docs/mvp-architecture.md` §§4.4–4.8, 12, 13.1–13.4, 14, 18, 20, 22, 25. Accepted behavior: `content-repository-contracts`, `rest-contracts`, `local-product-acceptance`, `published-site-loader`, `public-sdk`, `publication-visibility`, and `alpha-release-artifacts`.

Expected implementation areas are `packages/test-utils`, runtime contract tests, `packages/server`, `apps/admin/e2e`, `apps/site` fixture tests, local acceptance scripts/root commands, and `docs/archive/step-34/`. Preserve the Step 33 candidate (`0.1.0-alpha.3`, template `0.17.0`) as the immutable baseline; prepare `0.1.0-alpha.4` with template `0.18.0` for the approved correction. Source tests are separately attributed. A shipped-behavior defect requires a reviewed change and fresh candidate artifacts before claiming acceptance.

Dependencies: completed Step 33, pnpm/Node, local Docker/MinIO, Miniflare D1/R2, Playwright Chromium, and the exact candidate artifact receipt. No new production dependency or database migration is planned. A new candidate and template version are required for the approved visual correction. Externally visible outcomes are preserved product behavior and reproducible local verification.

Non-goals: sessions 34B/34C, dependency/security audits, remote D1 budgets, operations/restore drills, VPS or Cloudflare accounts, registry publication, and stable-release authorization. Real-deployment acceptance stays in `docs/real-application-verification.md`.
