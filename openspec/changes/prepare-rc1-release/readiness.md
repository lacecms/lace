# RC1 release progress

Status: all source gates passed; no rc1 registry publication or GitHub
release has occurred, and alpha.7 upgrade fixtures have not been retired.

## Selection and public baseline

Candidate: `0.1.0-rc1`, ownership template `0.46.0`, npm `next`, sixteen public
packages and API/builder for `linux/amd64` and `linux/arm64`. Shipping changes are committed and clean; the preparation inventory will record
the exact frozen revision including this verification record. The dated [registry preflight](registry-preflight.json) confirms
alpha.8's complete public set and rc1 availability on 2026-11-01; availability
is not reservation or publishing rights.

## Completed checks

Pinned Node 24.12.0 and pnpm 12.3.4 were used for source checks. Docker 29.8.2 /
Buildx advertises both platforms. Pinned Node containers executed successfully
on linux/amd64 (x64) and linux/arm64 (arm64); release-image smokes remain part
of preparation. Frozen installation passed with the lockfile unchanged.

- Release-model/artifact/publication/lifecycle tests: 71 passed, including RC
  coordinates and historical-version protection. Candidate `release:check` and
  `release:plan` agree on sixteen packages, both images and `next`.
- Generator suite: 64 passed. Focused generator/CLI/fixture verification: 84
  passed; final model/generator refresh: 49 passed. Six generated snapshots
  match two byte-stable generations after template guidance changes.
- Packed upgrade acceptance: exact alpha.7 and alpha.8 default/Cloudflare
  templates pass managed conflicts, new-guide collision refusal, protected
  user bytes, managed delivery and repeat no-op. Alpha.8 fixtures were generated
  from its real published archive with verified npm integrity and SHA-256.
- Documentation checks/build/variant build passed. Built-site browser smoke
  verified landing/navigation, live search results and the conditional-fields
  deep page.
- Packed starter acceptance passed all blocks, export/internal links, image
  variants/cache/lightbox/link precedence, gallery ambient video/accessibility/
  aspect ratio/reduced-motion fallback and offline import sample validation.
- `pnpm compat:mcp`: 114 passed. MCP package tests: 5 passed. These are source
  tests, not acceptance of the final saved rc1 inventory.
- Full workspace/root tests passed: 3334 tests, including 995 admin tests and 240 root tests.
- Root typecheck, lint, format check, generated OpenAPI check, all-spec strict
  validation (85 items) and strict change validation passed.
- Dependency/license audit completed for 992 locked records with one existing
  moderate esbuild advisory, GHSA-67mh-4wv8-2f99. Existing mitigation remains:
  legacy esbuild development server is never started/exposed; tooling only.
  No new exception. Lock SHA-256:
  `cb74f7af4cab116b827240310d2d6913eee0d2d614c8f74e61865ec397949e12`.
  Detailed local report: `.lace-acceptance/rc1-evidence/dependency-audit.json`.

## Remaining gates

Complete two-platform preparation, independent saved-inventory verification and
fresh exact-artifact Node/Worker acceptance remain outstanding. Acceptance must
exercise the updated MCP publication grant and conditional/tag/multi-picker
journeys; source-only tests and packed source probes do not replace this gate.

GitHub account authentication is available. npm `whoami` returned E401 during
preflight; owner local login is needed before publishing. Registry permission,
complete publication and GitHub evidence checks remain required. Real VPS/
Cloudflare deployment checks remain distinct from all local checks.

Only after verified rc1 publication will its actual published generator replace
historical fixtures in a later commit. The released tag/artifacts/evidence will
not be rewritten for that cleanup. Archiving and local release-data deletion
are not included.
