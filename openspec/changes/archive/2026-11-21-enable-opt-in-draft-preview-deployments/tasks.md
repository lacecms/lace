## 1. Record the rollout contract and wire runtime activation

- [x] 1.1 Record the PV1 deployment follow-up in the roadmap and update architecture §5 and §18 for explicit activation and the loopback Node variant. Verify the architecture and roadmap agree with the activation and local Node deltas and preserve the archived PV1 evidence.
- [x] 1.2 Wire the Node and Cloudflare runtime settings to the existing Admin, ingress and runner composition. Verify the standard composition for unset, false, invalid, incomplete and complete settings, authorized diagnostics, no generation or dispatch while off, and ordinary CMS behavior. Update fixture inputs to exercise environment activation.
- [x] 1.3 Carry the closed-host rule across active, inactive and incomplete setup, including the Node development HTTP and upgrade gateway. Verify known preview hosts cannot reach admin, site, WebSocket or runner routes, aliasing the CMS/site keeps them reachable, and ordinary request and runner host checks still pass.

## 2. Connect the supported deployment entry points

- [x] 2.1 Add the private preview-only startup mode to the existing builder image and apply the opt-in to the VPS builder. Verify private reservation, pinning, supervised exit and cleanup, denial of publication commands in development, and unchanged VPS publication scheduling and output switching.
- [x] 2.2 Make the reference Astro workspace preview-aware. Verify one saved route and its assets build from a detached committed checkout, while ordinary fixture and published-content builds still produce their expected output.
- [x] 2.3 Wire the repository Node opt-in command and managed generated Node development variant, including loopback HTTPS, private runner/SILO routing and regular stop/restart behavior. Verify resolved Compose configuration, default startup without TLS or a runner, and the opt-in path in Chromium through the actual development gateway, including frontend reload and private asset access.
- [x] 2.4 Forward activation in the reference and generated VPS configuration and the standard Cloudflare Worker setup. Verify resolved Compose wiring and the generated Worker bundle, the private VPS runner and release mounts, and the existing Worker preview routing, dedicated storage and scheduled maintenance.

## 3. Deliver setup and upgrade guidance

- [x] 3.1 Update generator inventory and snapshots for starter, existing-site and no-site variants with and without Cloudflare. Verify deterministic output, disabled defaults, omission of preview assets in no-site mode and normal managed-file upgrade behavior for existing projects.
- [x] 3.2 Align doctor and contributor, generated and public guides on enabling, local HTTPS and clean Git source, runtime-specific prerequisites, disabling and recovery. Update the internal documentation index for the accepted PV1 specs. Verify doctor reports safe advisory results for disabled, incomplete and configured cases, and run documentation build, link and CLI/reference checks.

## 4. Accept activation and withdrawal

- [x] 4.1 Extend `pnpm acceptance:draft-preview` to use the shipped generated Node development, VPS and Worker entry points. Verify defaults and incomplete setups, real-editor creation and viewing with private assets, denied unauthorized delivery, unchanged published export and output, and withdrawal with existing preview cookies and runner requests. Retain the existing PV1 lifecycle and migration/rollback coverage.
- [x] 4.2 On an authorized disposable hosted deployment, smoke-test the standard generated Worker with real Actions, D1 and private R2 and record activation, one successful saved-draft build and withdrawal. Keep this gate open if authorized infrastructure is unavailable and record the separate local Worker evidence.
- [x] 4.3 Run the relevant focused suites, root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check`, and `pnpm exec openspec validate enable-opt-in-draft-preview-deployments --type change --strict`. Record completion evidence and the roadmap status after the rollout checks pass.
