## 1. Version gate

- [ ] 1.1 Replace exact Node equality with a fail-closed semantic comparison against the existing `>=24.12.0` minimum, keeping pnpm exactly `12.3.4` and the gate before output claim; add focused tests for older, equal, newer, later-major, malformed and prerelease versions, wrong pnpm and unclaimed output on failure.
- [ ] 1.2 Exercise real preparation through the gate on the installed Node 24.22.1 with pnpm 12.3.4 using the existing injected packing-failure fixture; verify it reaches the injected failure and retains the established recovery state. Run the focused release tests under both Node 24.12.0 and 24.22.1.

## 2. Preparation evidence

- [ ] 2.1 Write actual Node and pnpm versions to `toolchain.json` after output claim inside the preparation failure handler, without changing `inventory.json`, `source.json` or source identity; test the sidecar on success and its write-failure recovery, and verify existing inventory and publication checks accept historical artifacts.
- [ ] 2.2 Verify cleanup removes the new sidecar under normal and interrupted cleanup, and release verification/publication behavior remains unchanged with and without a sidecar; run focused release-clean, release-artifacts and release publication/verification tests.

## 3. Guidance and gates

- [ ] 3.1 Update current `docs/alpha-release.md`, `docs/compatibility.md` and, if needed, `docs/verification.md` to distinguish eligible preparation Node from tested CI/Docker pins, retain exact pnpm and explain the sidecar; verify minimums and historical claims remain accurate.
- [ ] 3.2 Run focused release tests, root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test`, `pnpm openapi:check`, `pnpm spec:validate`, and `pnpm exec openspec validate allow-supported-node-release-preparation --type change --strict`; record command versions and results in the change's verification notes.
