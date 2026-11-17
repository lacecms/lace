## ADDED Requirements

### Requirement: Node Compose selects a pinned private storage image

The repository development and VPS Compose configurations and the generated Node Compose configuration SHALL select the same prebuilt PGSTY SILO release pinned to its multi-platform manifest digest for Linux amd64 and arm64. An absent or empty `LACE_MINIO_IMAGE` SHALL select the pinned default. A nonempty `LACE_MINIO_IMAGE` in the Compose environment, including the operator's `.env`, SHALL select the supplied full image reference. The storage service SHALL retain the `minio` service name, the private `http://minio:9000` endpoint, existing credential and bucket inputs, and the existing `minio-data` mount at `/data`. Its health check and idempotent private bucket initializer SHALL gate normal API startup. A storage image change SHALL preserve the production network isolation and host port bindings required by this capability.

#### Scenario: The default is consistent and private
- **WHEN** Compose resolves the repository development stack, repository VPS stack, or a generated Node stack with `LACE_MINIO_IMAGE` unset or empty
- **THEN** the `minio` service resolves to the same pinned SILO image, uses the existing private endpoint and volume mapping, and has no published host port

#### Scenario: An operator selects an alternate compatible image
- **WHEN** an operator sets `LACE_MINIO_IMAGE` to a compatible full image reference in `.env`
- **THEN** Compose selects that image and retains the service name, private network access, initializer dependency, and volume mapping

#### Scenario: The configured object store cannot start
- **WHEN** the image cannot be pulled and is unavailable locally, or the replacement cannot become healthy or initialize the bucket
- **THEN** a fresh stack cannot become ready, and the operator can diagnose the failed Compose dependency without recreating the data volumes

### Requirement: Operator storage migration preserves persisted media

Deployment guidance SHALL describe switching an existing supported MinIO volume to SILO under the same Compose project, with writes paused and a consistent pre-switch backup. It SHALL require readback of representative existing Lace media by identifier or key with byte comparison, a new write/read verification, and persistence after restarting storage. Recovery guidance SHALL use the previous image and pre-switch backup when reverting a failed migration. Normal startup and template upgrades SHALL preserve the named volume and SHALL NOT reset its contents.

#### Scenario: A previously shipped MinIO volume is reused
- **WHEN** an operator switches an isolated stack from the previously shipped MinIO release to SILO using the same named volume, bucket, and credentials
- **THEN** Lace reads the previously recorded media with unchanged bytes and media identifiers, can write and read new media, and still reads both after a storage restart

#### Scenario: A migrated volume fails validation
- **WHEN** startup or historical media readback fails during the migration
- **THEN** the documented recovery path restores the saved volume and corresponding pre-switch state for the previous image before resuming writes
