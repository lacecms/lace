## 1. Toolchain and images

- [x] 1.1 Update all Node-based local development and VPS API/builder Docker stages to 24.22.3 and inspect Compose references for coverage.
- [x] 1.2 Retain the root metadata version required by Turbo, disable automatic pnpm switching in Docker and document the operator override, and use `>=12` for generated projects; verify Turbo, Corepack, an independently installed eligible pnpm and frozen installs, and document the metadata exception.
- [x] 1.3 Update release preparation and builder image validation to accept pnpm 12 or later; run focused tests covering valid, old and malformed versions and output-destination safety.

## 2. Guidance and verification

- [x] 2.1 Update current generated guidance, compatibility and release documentation and relevant generated-template version/upgrade checks; run affected generator and release tests.
- [x] 2.2 Build and smoke-test relevant Docker images and Compose configuration when available; record exact versions and any environment limitations without claiming unperformed verification.
- [x] 2.3 Run focused tests, root typecheck, Oxlint, Oxfmt check and strict OpenSpec validation; record outcomes in the change.

Docker verification: local arm64 dev, API and builder images built on OrbStack; all use Node 24.22.3, and dev/builder use pnpm 12.18.0. API SQLite migrations and builder non-root health passed; dev and VPS Compose configurations validated with test values. No amd64 image or real deployment was verified.

Other verification: root build, typecheck, lint, formatting, release check, all-spec validation and strict change validation passed. Generator packaged tests (22), CLI upgrade tests (27) and focused release tests (128) passed. A frozen workspace install passed with pnpm 12.18.0; Corepack selected root pnpm 12.3.4, and generated template metadata resolved pnpm 12.17.0 with the cached Corepack installation.
