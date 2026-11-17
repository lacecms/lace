## 1. Record the deployment decision

- [x] 1.1 Update the architecture and roadmap first to record the bundled Node S3 server and the owner-requested maintenance unit. Reconcile the OpenSpec project context with the architecture while preserving the Node/R2 adapter boundary and the repository compatibility policy. Check the deployment, runtime, and distribution references against the proposal and delta specs.

## 2. Ship and resolve the storage image

- [x] 2.1 Set the exact classic SILO image from the design as the default in `docker-compose.dev.yml` and `docker-compose.yml`. Let `LACE_MINIO_IMAGE` select a compatible full reference from the operator's `.env`. Verify both resolved files with absent, empty, and explicit overrides and confirm the current service, healthcheck, initializer dependency, and mounted volume.
- [x] 2.2 Apply the same image selection to the managed `create-lace` Compose file. Remove the obsolete Dockerfile and its current inventory entry, and document the override in the repository and generated environment examples. Verify the same default, override, private network, volume, and initializer for the six generated variants. Confirm production ingress still publishes only Nginx, and run the focused generator and Compose configuration tests.
- [x] 2.3 Update the generated acceptance image preparation, current cross-runtime storage fixture, and database-safety runner for the prebuilt default. Exercise the compatibility path for `LACE_VERIFY_MINIO_IMAGE` and check both initial and replacement storage startup. Verify current default paths can run without Quay or a MinIO source build. Preserve historical template fixtures and their recorded hashes.

## 3. Verify data preservation and document the switch

- [x] 3.1 Write the operator procedure for selecting the image, pausing writers, taking a consistent backup, keeping the Compose project and mounted volume, verifying existing and new media, restarting, and recovering from a failed switch. Update the engine development, repository VPS, generated project, and matching public documentation, and refresh current template snapshots. Verify guide commands and links against the generated modes and run the docs check.
- [x] 3.2 Use the published-template upgrade journey to verify the managed Compose replacement and removal of an unchanged legacy Dockerfile, conflict handling for a locally edited Dockerfile, and preservation of `.env` and user bytes. Exercise the retry or repeat no-op on the upgraded project. Run the focused upgrade and snapshot checks.
- [x] 3.3 Rehearse the storage switch from the exact prior MinIO release on a disposable named volume with recorded Lace media identifiers, object keys, and hashes. Take a pre-switch copy and confirm historical media, new writes, and restart persistence with SILO through the API. Verify failure and recovery using the saved copy and previous server. Check that startup with an unavailable image fails without resetting stored data, and remove only fixture resources.

## 4. Verify the deployment paths

- [x] 4.1 Run `pnpm dev:smoke`, `pnpm test:vps`, and the packed generated starter journey through Node development and production. Verify private bucket initialization, media readback, and normal cleanup. Run the affected local storage verification phases, including credential replacement, and record any unexecuted deployment checks separately from passed checks.
- [x] 4.2 After focused tests, run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm exec openspec validate adopt-silo-object-storage --type change --strict`. Verify the final diff and record local evidence independently of real VPS deployment and exact-artifact release evidence.
