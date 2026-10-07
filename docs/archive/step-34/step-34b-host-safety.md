# 34B host SQLite safety — partial source evidence

Recorded 2026-10-07. This closes task 2.2 only. Overall 34B acceptance and refreshed candidate acceptance remain pending.

Source: working tree based on `35273f425cace64ba20c6a4883fae34ae98f504c`, including the uncommitted 34B guard and generated template 0.19.0. Node 24.12.0; local VM-backed Docker is OrbStack, linux/aarch64. This run uses the source CLI/generator with explicit older fixture images; it does not establish that those images ship the new guard.

## Reproduction

After building the source CLI and generator:

```sh
LACE_34B_API_IMAGE=ghcr.io/lacecms/api:0.1.0-alpha.4-arm64-81acb4f9b21d \
LACE_34B_BUILDER_IMAGE=ghcr.io/lacecms/builder:0.1.0-alpha.4-arm64-81acb4f9b21d \
LACE_34B_MINIO_IMAGE=488030552b80 \
node scripts/compose-database-safety.mjs
```

The optional MinIO image avoids recompiling the generated pinned MinIO Dockerfile; omit it to build that Dockerfile. The generated CMS-only consumer uses source dependencies for this source verification, an allocated loopback API port, random credentials and a unique Compose project. It removes only its own containers, volumes, temporary MinIO tag and consumer directory in `finally`.

Verified fixture image identities (all linux/arm64):

| Role | Image ID |
| --- | --- |
| API | `sha256:832f37a633292097a392e82cca37232fda96f5bad465bd67b3544211dbf41b64` |
| Builder (configured, CMS-only mode does not start it) | `sha256:fde64f00e8291e2575d9dcd3b7b4d2ade88206d9b586a3a1e53c6b0324bb3b72` |
| MinIO | `sha256:488030552b8008fd316fcc1eb5c86963e0540c533c50d89dbbc641964b628485` |

## Observed results

- Initial host migration and synchronization succeeded before services started.
- With generated API and dispatcher running, migrate, sync, sync/check and bootstrap each exited 6 with sanitized `OPERATION_FAILED` and explicit stop guidance, without returning a token. In-container snapshots of users, API/setup tokens, entries and snapshots remained identical after every refusal. The earlier CLI pre-open fixture additionally verifies refusal creates no database directory.
- Explicitly stopping both database consumers allowed migration, sync, sync/check and bootstrap. Bootstrap returned its intentional one-time setup credential; it was used privately and never logged.
- After restart, administrator setup and sign-in succeeded; a collection entry was created. Another stop/check/restart preserved the entry title and authenticated access.
- Cleanup completed successfully. No application development database or existing Docker deployment was modified.
- Six generated snapshot variants matched two byte-stable regenerations. Generator/upgrade focused tests passed (49 tests). Root typecheck, lint, formatting and OpenSpec strict validation passed. Lint retains four existing database-test warnings.

## Next-task finding

Task 3.1 is **not complete**. Two new regression cases in `tests/security-boundary.test.mjs` reproduce an origin-boundary defect in both actual Node/SQLite and local Worker/D1 compositions: an administrator session submitted to `POST /api/v1/admin/users` with a foreign `Origin` receives HTTP 201 rather than 403. Better Auth protects its own routes, while Lace's actor resolver does not currently enforce the configured trusted-origin policy on management mutations. The regression tests intentionally fail until the correction is approved and implemented; the complete source security suite must not be reported as passing.

Follow-up: the owner confirmed `/private/tmp/lace-34b-origin-plan.diff`; it was applied, the shared auth boundary was corrected, and task 3.1 passed its extended 12-case Node/Worker matrix. See `step-34b-origin-verification.md`. Task 3.2 subsequently exposed a separate Node image-container validation defect; tasks 3.2–6.4, exact-artifact refresh, 34C, remote deployment acceptance and publication remain open.

## Later progress

The owner approved the image correction and tasks 3.2–4.3 are now verified. Current progress is 11/18; task 5.1 has reproduced a separate full-HTTP D1 N+1 budget failure. See `step-34b-resilience-progress.md` for current results and the proposed planning revision. Earlier pause descriptions above are retained as historical evidence.
