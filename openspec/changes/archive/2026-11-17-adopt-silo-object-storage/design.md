## Context

The root development and VPS files reference Quay directly. The managed `create-lace` Compose file builds a MinIO Dockerfile and is shared by `pnpm dev:api` and `pnpm prod:start`. Current generated acceptance and the database-safety fixture explicitly build or tag that image. The cross-runtime fixture also references Quay for initial startup and credential rotation. The [proposal](proposal.md) covers these paths in one maintenance change.

The exact SILO image already passed an isolated container probe with the existing server command and health endpoint, repeated bucket initialization, streamed upload, full and ranged reads, anonymous access refusal, and deletion using Lace's AWS SDK dependency. The complete Compose stacks and an existing MinIO volume are still to be verified during apply.

## Goals / Non-Goals

- Use one reproducible storage default on Linux amd64 and arm64. Let an operator select a full image reference from `.env`.
- Change the bundled storage server at the Compose boundary. Keep the private S3 adapter, environment readers, browser media URLs, and Cloudflare binding outside the storage image decision.
- Cover the persistence and template transitions using owned test resources. Deployment execution and recovery on real VPS installations are owner operations.

## Decisions

1. Use the classic image `docker.io/pgsty/silo:RELEASE.2026-11-12T00-00-00Z@sha256:c20d112390b9a9ce8c11b8af95ad35bcaa62f4759663c09c936cd8d2b511f329`. Compose interpolates the full reference with `${LACE_MINIO_IMAGE:-<default>}` before starting containers. Document a commented override in the environment examples. The digest identifies the multi-platform manifest. SILO publishes date-based server tags, with `latest` moving between releases. A digest keeps rebuilds and deploys on the verified artifact. [Release](https://github.com/pgsty/silo/releases/tag/RELEASE.2026-11-12T00-00-00Z) · [Image versions](https://silo.pigsty.cc/compatibility/versions/)
2. Keep the Compose project and volume identity, the `minio` and `minio-init` service names, `/data`, the private endpoint and credentials, the existing `server /data` arguments including the dev console option, and the HTTP liveness probe. The classic image includes the shell and curl required by the probe and dev smoke. Compose continues to wait for initializer success, and Node continues to check the actual bucket before serving. The distroless image has a different probe and shell contract. An override needs to satisfy the command, probe, environment, and data-format contracts of its deployment. [SILO compatibility guide](https://silo.pigsty.cc/compatibility/migration/)
3. Make the shipped Compose definitions own image selection. Give the independently distributed template the same default, and verify equality with the repository defaults. Keep Compose-specific configuration out of `platform-node`. Use the existing managed inventory and upgrade rules for the new image reference and removal of `deploy/minio.Dockerfile`. An unchanged managed legacy file is eligible for removal, while an edited one conflicts and requires operator review. Preserve local `.env`, media, SQLite, and user source through the template update.
4. Have generated acceptance use the resolved image, and keep source fixtures tied to the shipped default. Preserve the database-safety runner's explicit `LACE_VERIFY_MINIO_IMAGE` fixture input for local image IDs or references. Use a fixture-owned tag and pass it to Compose through `LACE_MINIO_IMAGE` when that input is supplied. Keep legacy fixtures as evidence for upgrades. Seed the transition drill with MinIO `RELEASE.2025-02-07T23-21-09Z`, using a known cached image or the prior template's pinned build recipe in an isolated directory. The recipe identifies source commit `703f51164d3d0c44af41b0d86075a1f61e4779e7` and can be recovered from the pre-change revision after removing the current template file.

## Risks / Trade-offs

- A tag can move or a registry can be unavailable. Use the digest as part of the default and keep normal Compose startup failure visible. An operator can supply an already mirrored compatible image with the same reference contract.
- A server switch can write new on-disk metadata even when old objects are readable. Rehearse the exact previously shipped version on a separate named volume, take a consistent copy before changing the image, and use that copy for rollback. Test media integrity by reading pre-existing content through Lace beyond the health probe.
- Generated startup used to build MinIO. Update the acceptance and safety runners to pull or select the configured image, and update current template snapshots and guidance alongside the Compose change.

## Migration Plan

1. Update the architecture and roadmap with SILO as the bundled Node S3 server before applying the Compose and template changes. Update the OpenSpec project context to match. Existing S3 and R2 contracts continue to govern media behavior.
2. For a fresh installation, start the documented Compose workflow. It pulls the pinned server, passes its health probe, and initializes the private bucket before the API serves requests.
3. For an existing installation, record the Compose project and actual mounted volume, current image identity, and representative media keys and hashes. Pre-pull SILO. Pause writers and dispatch, stop storage, and take a consistent backup of the media volume and coordinated database state where applicable.
4. Keep the same project, credentials, bucket, and volume when recreating the storage service. Verify readiness, authenticated reads of previously stored media, a new media round trip, and persistence after restart. Reopen traffic after verification. If validation fails, stop SILO, restore the pre-switch state, and restart the prior image and configuration. Filesystem template rollback uses the existing Lace upgrade workflow and does not itself restore object metadata or data.
