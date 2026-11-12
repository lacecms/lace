## 1. Establish release inputs

- [x] 1.1 Record dated read-only npm, GHCR and GitHub evidence for the complete rc3 publication and its source, and rc4 availability for all sixteen packages, two images and tag/release; stop on missing or conflicting evidence.
- [x] 1.2 Review the full diff since the rc3 tag and record the shipping scope and applicable upgrade actions; verify rc2 remains the supported floor and no unimplemented roadmap unit is included.

## 2. Prepare repository coordinates and upgrade baseline

- [x] 2.1 After verified publication, add rc3 to immutable history and select rc4/next and template 0.49.0 across release metadata, public manifests, platform versions, registry requirements, image/Docker defaults, generated dependencies and lockfile; verify `pnpm release:check` and `pnpm release:plan` and private package status.
- [x] 2.2 Update template upgrade instructions and regenerate all generated-project snapshots; verify managed hashes and focused generator/snapshot tests.
- [x] 2.3 Obtain the published rc3 generator, verify source and archive/registry digests, generate default and Cloudflare published-template fixtures and replace rc2 fixtures; verify provenance, fixture integrity and generic upgrade/conflict tests without building release packages or images.
- [x] 2.4 Update the accepted fixture specification in accordance with the delta and verify the rc2 support floor and preserved generic acceptance requirements.

## 3. Documentation and verification

- [x] 3.1 Update changelog, compatibility/upgrade guidance, consumer commands, current documentation and release instructions for rc4; verify links, current scope, version references and no unsupported publication or deployment claim.
- [x] 3.2 Run narrow relevant source, generator, release-model and documentation checks, then root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:validate` and `pnpm exec openspec validate prepare-rc4-release --type change --strict`; record commands, outcomes and any limitations.
- [x] 3.3 Record repository-only handoff and remaining clean-source preparation, both-platform artifact checks, exact-artifact acceptance, publication and real-deployment gates; verify no release archives, images, tags or publications were created by this change.
