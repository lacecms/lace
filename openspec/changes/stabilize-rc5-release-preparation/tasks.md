## 1. Fix the release toolchain and frozen install paths

- [x] 1.1 Pin each pnpm install in the API and builder Dockerfiles to the exact workspace version and extend release-model validation. Run the focused release model, lifecycle and artifact tests plus `pnpm release:check` to verify the checked-in pin and rejection of drift.
- [x] 1.2 Allow normal registry access during the frozen installs of the disposable package smoke and the consumer paths reached by exact-artifact acceptance. Preserve tarball overrides, source-resolution checks and pnpm policy verification. Run package-only preparation and the applicable starter and existing-site runs with fresh metadata caches and inspect the frozen-install results.
- [x] 1.3 Document the matching CI and image pnpm pin, registry metadata and fresh output directory retry in the release guide. Verify the commands against the implementation and run root typecheck, lint, format check and strict OpenSpec validation.

## 2. Verify the candidate artifacts

- [x] 2.1 Prepare a fresh full release from the reviewed clean RC5 revision using the pinned toolchain and an initially empty pnpm metadata cache. Run `release:verify` and confirm all sixteen tarballs and four image archives, successful AMD64 and ARM64 smoke checks and both builder pnpm versions.
- [x] 2.2 Align the packed restore/rotation and shared Node/Worker acceptance checks with the accepted REST authentication contract. Assert `401 AUTHENTICATION_REQUIRED` for missing or rejected credentials and preserve `403 AUTHORIZATION_DENIED` for authorization refusals. Verify the affected journeys before retrying the saved inventory.
- [x] 2.3 Resolve the exact workspace pnpm pin in the acceptance harness with Corepack and standalone pnpm. Verify the standalone resolver and run the packed starter and existing-site journeys with the Corepack launcher used in CI.
- [ ] 2.4 Run `acceptance:release` on that inventory with an initially empty pnpm metadata cache. Verify the acceptance receipt covers the saved package and image identities and report the exact inventory and receipt for the owner's publication steps.
