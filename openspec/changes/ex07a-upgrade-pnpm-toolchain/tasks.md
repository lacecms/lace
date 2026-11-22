## 1. Align the build toolchain

- [x] 1.1 Set the root `packageManager`, three repository CI activations, CI store cache key, generated Pages workflow and three Docker pnpm installs to `12.21.0`. Check their values against the root pin, exercise drift in each Docker stage with a floating or stale fixture, and run the focused release-model tests and `pnpm release:check`.
- [x] 1.2 Confirm the executable reports `12.21.0` and regenerate `pnpm-lock.yaml` using `pnpm install --lockfile-only`. Record which toolchain packages, workspace dependencies and peer contexts changed and why. Verify the catalog and `vite@^8` override select the intended Vite version for affected consumers.
- [x] 1.3 In a clean workspace on the CI Node baseline, run `pnpm install --frozen-lockfile`, verify the reviewed lockfile is byte-identical afterward, and execute a query on a new in-memory database through the installed `better-sqlite3` binding in `@lacecms/platform-node`. Record Node, pnpm, OS and architecture.

## 2. Verify generated project behavior

- [x] 2.1 Update current build instructions and generated guidance to distinguish the selected pin, the operator minimum and the last verified baseline. Check generated manifests in starter, existing-site and no-site modes for `engines.pnpm: ">=12"` and absence of package-manager selection fields. Verify the new Pages CI pin where emitted and review candidate snapshot changes against the rendered files. Preserve historical fixtures and release records.
- [x] 2.2 Exercise the disposable pnpm resolver from Corepack and standalone pnpm, including a mismatched executable. Check the actual version of a nested command and the diagnostic on mismatch. Run `pnpm acceptance:starter` and `pnpm acceptance:cloudflare` with the workspace pin and confirm the packed generator, installed CLI/doctor, Astro build and generated Worker on local D1/R2 succeed.
- [x] 2.3 Run root typecheck, lint, format check and strict change validation after the focused tests. Check the release and compatibility guides against the resulting commands and reported versions.

## 3. Qualify the new build set

- [ ] 3.1 From a clean reviewed revision with pnpm `12.21.0`, run `pnpm release:prepare --output <fresh-dir>` for both Linux platforms, followed by `pnpm release:verify --output <fresh-dir>`. Verify all package checksums and the four image archives, the API and builder smoke results for each architecture, and the pnpm version inside each builder.
- [ ] 3.2 Run `pnpm acceptance:release --artifacts <fresh-dir>` against that saved set. Match the resulting `acceptance.json` to its inventory by source fingerprint, selected image IDs and package checksums. Record the platform that ran the complete consumer journeys.
- [ ] 3.3 After the matrix passes, record the tested pnpm baseline in `docs/compatibility.md`, align current verification, release, public and generated guidance, and record the result in the roadmap. Include date, environments and references to the verified inventory and receipt. If shipped bytes changed after qualification, repeat preparation, verification and acceptance for the final bytes. Run docs checks, root typecheck, lint, format check and `pnpm exec openspec validate ex07a-upgrade-pnpm-toolchain --type change --strict` on the final change.
