# Video embed verification — 2026-10-22

Implemented videoEmbed v1, portable provider URL restrictions and descriptions,
site-owned Astro preview activation, CLI distribution, maintained sites and docs.
All 14 implementation tasks are complete. No video-file uploads or SQL migrations.

## Passed checks

- Content: 146 unit tests and TypeScript type tests; config: 60 tests.
- Application: 103 tests including provider-restriction schema evolution.
- Render: 103 tests; Astro adapter/registry: 70 tests.
- CLI block command, map/lock and registry suites: 35 tests, including clean
  installation, all-block selection, component/CSS conflicts and .new recovery.
- Admin block editor and metadata validation: 37 tests, including provider URL
  errors, poster selection/removal, viewer controls and stale-revision recovery.
- create-lace: all 64 tests, including generated starter build and dev reload.
- Maintained source identity/bundled registry: 6 tests.
- Reference static-site suite: 4 tests. Its real Chromium check intercepts player
  requests and verifies preview deferral, pointer/Enter/Space activation, focus,
  multiple instances, duplicate events, reduced motion and no-JavaScript fallback.
- Focused real Node/MinIO and Workers/D1/R2 acceptance test passed for both
  compositions: save/publish, no-poster delivery, poster usage/deletion guard,
  hidden-only media exclusion, immutable public snapshots, viewer rejection and
  stale revision conflicts.
- Generated-project snapshots updated and independently rechecked; all six site/
  platform combinations match two deterministic regenerations.
- Public docs check: 3 tests.
- Root pnpm typecheck, pnpm lint (Oxlint and boundary/color checks),
  pnpm format:check, git diff --check and OpenSpec strict validation passed.

Local-server, Chromium and Docker integration checks ran with sandbox escalation.
No external provider credentials, publication or hosted deployment was required.
Player responses are stubbed in automated browser tests: actual third-party
playback availability and owner-controlled domain/privacy permissions were not
verified. The maintained guides contain the optional manual playback smoke check.

The earlier video-a-media-upload-delivery proposal remains deferred. This change
has not been archived or synchronized into accepted specs; archive requires the
user's explicit request under the repository workflow.
