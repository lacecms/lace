## 1. Architecture, roadmap and handoff

- [x] 1.1 Record the reference hook-driven static host (Cloudflare Pages Git integration, manual direct-upload workflow as alternative) in `docs/mvp-architecture.md` §6/§25 and mark 31B delivered scope in the roadmap; verify by re-reading both sections against design D6
- [x] 1.2 Write `docs/cloudflare-deployment-handoff.md` (permissions, resources/IDs to record, secrets/vars, ordered steps, Pages Git integration and hook, evidence, pass criteria, cleanup, local-vs-real statement) and link it from the roadmap Step 33 and `docs/cloudflare-worker.md`; verify it contains no credential or real ID and covers each item of the `cloudflare-consumer-worker` delta

## 2. Generated guidance and template version

- [x] 2.1 Update the managed operations guide Cloudflare section (origins, browser setup, build token, local/remote doctor, recovery for expired token, unavailable/rejected hook, `/__scheduled`, restart/reset, Git-connected hook prerequisite, accepted ≠ deployed) and remove the "future work" doctor wording; update the README Cloudflare section and the Pages workflow comment; verify with onboarding text assertions in `packages/create-lace/src/index.test.mjs`
- [x] 2.2 Advance the template to `0.13.0` with guidance-only upgrade instructions, update version expectations in create-lace and CLI upgrade tests, add an upgrade test from 0.12 Cloudflare guidance, regenerate snapshots; verify `pnpm --filter create-lace test`, the CLI upgrade tests and `node scripts/generated-project-acceptance.mjs snapshots`

## 3. Acceptance journey

- [x] 3.1 Add the controlled HTTPS hook (throwaway cert, `NODE_EXTRA_CA_CERTS`, modes) and the expired-token fixture helper to `scripts/cloudflare-consumer-acceptance.mjs`, with unit tests for pure helpers in `tests/generated-project-acceptance.test.mjs` or a new test; verify the tests pass
- [x] 3.2 Extend the journey per design D4/D5: origins, offline doctor, expired-token browser rejection and re-issue, browser setup/sign-in/media/edit/publish, unavailable then recovered hook through `/__scheduled`, running doctor, build token, Astro build with media checks, draft isolation, restart persistence of export and draft, secret scanning; pass `capturedDiagnostics`/scan helpers from `generated-project-acceptance.mjs`
- [x] 3.3 Install Playwright Chromium in `.github/workflows/generated-project-acceptance.yml`; verify by reading the workflow
- [x] 3.4 Run `pnpm acceptance:cloudflare` end to end; verify every stage passes

## 4. Quality gates

- [x] 4.1 Run focused tests (create-lace, cli upgrade, root tests), root typecheck, `pnpm lint`, `pnpm format:check` and `openspec validate step-31b-cloudflare-consumer-journey --type change --strict`; all pass
