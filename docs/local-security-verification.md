# Local 34B security and resilience verification

Run from the repository root with Node >=24.12.0, pinned pnpm 12.3.4, a running local Docker engine/Compose, local MinIO support, and installed Playwright Chromium. Install workspace dependencies with `pnpm install --frozen-lockfile`. The runner builds the relevant workspace packages before tests. No remote Lace installation or infrastructure credentials are used. The dependency phase reads public npm advisory and package/license metadata; network failure makes that phase incomplete.

Use explicit locally available API/builder image identities for the disposable Compose host-maintenance fixture. An older reviewed fixture image can test the new host CLI guard, but does not count as corrected candidate acceptance. `LACE_34B_MINIO_IMAGE` optionally selects a cached local MinIO image; otherwise the fixture builds its generated MinIO service. Source security/storage suites use a disposable MinIO container and isolated local Miniflare D1/R2 state.

```sh
LACE_34B_API_IMAGE=<local-api-image-id> \
LACE_34B_BUILDER_IMAGE=<local-builder-image-id> \
LACE_34B_MINIO_IMAGE=<optional-local-minio-image-id> \
pnpm verify:34b
```

The runner prints an owned `.lace-acceptance/step-34b-*/result.json` path. Phases run sequentially: prerequisites, build, security, repository/restart, provider faults, Compose host safety, storage/admin recovery, static secret exclusion, authenticated D1 budgets, dependency audit. Test phases also retain Vitest JSON. Each required phase must execute; failed/skipped/empty/missing test reports and unavailable prerequisites fail the run. Later phases remain `not-run`. Interruption is failure, forwards termination to the owned process group, waits for child cleanup and records incomplete state. Fixture signal/finally handlers remove only owned containers, volumes and temporary data; ordinary development state is untouched.

The audit report records the lock hash, data/tool timestamp, all locked licenses and every residual advisory. Only the two reviewed restricted tooling dispositions are recognized; a new advisory or unknown/missing license fails acceptance. Native dependency and font notices accompany compiled admin assets. Initial findings and final dispositions are archived separately, without suppressing advisories to manufacture a zero count.

D1 fixture measurements include authentication, handler, batch members and owned post-commit jobs. Setup/seeding is outside the measured invocation. Export sizes 100/201/501 and near-1MB JSON values are finite evidence points; they introduce no installation-wide export cap and prove no unbounded maximum. Local Miniflare does not establish remote quotas or production memory/timing behavior.

A passing source runner does not prove candidate acceptance. Shipped corrections require a reviewed clean Git revision, newly prepared packages/images, checksum and both-platform image smokes, and exact-consumer security/recovery checks against the recorded inventory/platform. Historical 34A artifacts stay immutable. Real deployment/TLS/proxy/capacity checks, backup/restore session 34C, publication and stable approval remain separate open gates.
