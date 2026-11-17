## ADDED Requirements

### Requirement: Generated Node Compose uses a prebuilt storage image

The managed Node Compose file SHALL use the repository's pinned SILO reference and optional `LACE_MINIO_IMAGE` override in every site mode, including projects with optional Cloudflare support. The generated `.env.example` and deployment guides SHALL explain the override and identify the generated template upgrade and coordinated volume backup procedure for existing installations. The default development and production commands SHALL pull or reuse the storage image, with no consumer MinIO build. The current template and managed inventory SHALL omit `deploy/minio.Dockerfile`. Existing projects SHALL receive the updated managed files through the established hash and conflict rules, preserving the user's `.env`, deployment data, and user-owned source.

#### Scenario: A fresh project is generated
- **WHEN** a user generates a project in any site mode and follows its Node Compose workflow
- **THEN** the `minio` service uses the shared image selection, and the generated project contains no MinIO build recipe

#### Scenario: A deployed project's managed MinIO Dockerfile is unedited
- **WHEN** the operator reviews an upgrade from a supported template that still manages `deploy/minio.Dockerfile`
- **THEN** the plan proposes the Compose replacement and deletion of that unchanged Dockerfile with the existing private service and volume identity preserved

#### Scenario: The managed MinIO Dockerfile was edited
- **WHEN** the baseline owns `deploy/minio.Dockerfile`, its working copy differs, and the target omits it
- **THEN** the upgrade reports a conflict, and applying that plan changes neither the edited file nor the deployment
