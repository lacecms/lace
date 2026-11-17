## Why

The pinned MinIO manifest on Quay is unavailable, so `pnpm dev:node` and the repository VPS example cannot start from a fresh image pull. PGSTY SILO supplies a maintained multi-platform image compatible with Lace's private S3 storage, and lets generated projects pull their object store instead of compiling the retired MinIO release.

## What Changes

- Use the verified SILO release and its multi-platform digest by default in the repository development and VPS stacks and in every generated Node Compose stack.
- Support an optional `LACE_MINIO_IMAGE` in the operator's `.env` for an explicit image reference. An absent or empty value selects the same pinned default across the three Compose files.
- Keep the existing service name, storage endpoint, credentials, bucket, volume, and private networking. Document a backed-up migration for installations with MinIO data and verify it on an isolated copy of the previously shipped storage layout.
- Deliver the prebuilt image in the generated Compose configuration and retire its managed MinIO Dockerfile through the existing template upgrade rules. Update current acceptance and verification paths to exercise the shipped default.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- [local-node-development](../../../specs/local-node-development/spec.md) uses SILO for the default development stack and smoke run and documents the image override.
- [vps-composition](../../../specs/vps-composition/spec.md) defines the shared image selection and preservation of existing private media across the operator-run storage switch.
- [project-generator](../../../specs/project-generator/spec.md) ships prebuilt SILO and carries its Compose and documentation changes through managed-template upgrades.
- [generated-project-acceptance](../../../specs/generated-project-acceptance/spec.md) verifies selection, privacy, media operations, and the legacy-volume transition using the generated Compose configuration.
- [node-minio-object-storage](../../../specs/node-minio-object-storage/spec.md) and [node-api-composition](../../../specs/node-api-composition/spec.md) describe the existing Node S3 boundary with SILO as the bundled provider.
- [local-product-acceptance](../../../specs/local-product-acceptance/spec.md), [local-operations-verification](../../../specs/local-operations-verification/spec.md), and [local-security-resilience-verification](../../../specs/local-security-resilience-verification/spec.md) exercise the new bundled provider while preserving existing scenarios.

## Impact

This is one owner-requested deployment maintenance unit outside the EX1–EX6 sequence in the [extensibility roadmap](../../../../docs/extensibility-roadmap.md). The three Compose files ship one storage default and share the same compatibility assumptions, so the deployment paths are verified together. [Architecture §§1, 3–5, 7, 15, 18, 19, 21, and 22](../../../../docs/architecture/README.md) govern the switch. The affected architecture wording will be updated first during apply.

The scope includes the repository and generated Compose files, environment examples, managed template inventory and upgrade verification, current storage fixtures, and deployment and recovery guides. First startup requires Docker access to the pinned public image or a local copy. The Node S3 adapter, media API, SQLite schema, and Cloudflare R2 configuration retain their current contracts. Real VPS deployment, automatic storage upgrades, and changes to RC5 release preparation are outside this change.
