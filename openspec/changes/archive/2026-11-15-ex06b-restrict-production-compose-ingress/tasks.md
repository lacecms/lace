## 1. Deployment contract

- [x] 1.1 Update architecture §5 and §7 before changing the Compose files.
  Verify the diagrams and generated layout describe the new production
  ingress, the private API address and the explicit development file.
- [x] 1.2 Apply the production port changes to the generated template and
  repository example. Verify the resolved Compose model exposes only
  Nginx on loopback by default, honors the configured Nginx port and bind
  address, and retains the API's internal network connectivity.
- [x] 1.3 Add the managed development file and wire `pnpm dev:api` to it.
  Keep `LACE_API_PORT` scoped to local development and align environment and
  doctor validation with the internal port and host ingress settings.
  Verify local setup and development scripts, including a custom
  `LACE_API_PORT`, and verify production never loads the development file
  by default.

## 2. Operator workflow and upgrade

- [x] 2.1 Update generated and public Compose guides, environment examples
  and CLI reference for TLS proxy setup, alternate ingress, production
  bootstrap via `docker compose up -d web`, and the supported browser,
  host HTTP and manual-build endpoints. Validate the generated guide command
  sequences and links in every site and Cloudflare variant.
- [x] 2.2 Document the upgrade and rollback for existing installations in
  the managed upgrade instructions and public upgrade guide. Check that the
  instructions cover custom Compose overrides, preserved `.env` and data,
  recreation of the affected services and verification of effective bindings.
- [x] 2.3 Regenerate the reviewed six-variant snapshots with the managed
  development file. Replace retained rc3 template fixtures with exact
  default and Cloudflare fixtures from the published rc4 package. Verify its
  source revision, archive hash, npm integrity and managed-file digests.
  Run the packed upgrade journey and confirm conflict detection, delivery of
  the new managed file, user-file preservation and a repeat no-op plan. Verify
  removal of an unmodified retired file in a separate synthetic upgrade test.

## 3. Compose and packaged consumer verification

- [x] 3.1 Add resolved Compose assertions for the repository example and
  all six generated variants, covering default, custom and alternate
  Nginx bindings and the explicit development mapping. Check that the
  no-site variant has no builder and that all variants leave API, object
  storage and dispatcher without production host mappings.
- [x] 3.2 Update the existing generated and exact-artifact acceptance paths,
  including production smoke, builder diagnostics and the Compose database
  safety fixture, to use the documented ingress where they launch
  production. Verify an isolated packed project can initialize and sign
  in through Nginx before token issuance, then run protected export and
  serve a built site through Nginx. Verify the running API has no host
  publication after switching from `pnpm dev:api` to production.
- [x] 3.3 Run the focused generator, guide, fixture, doctor and Compose
  integration checks and the generated Node acceptance against packed
  artifacts. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and
  `pnpm exec openspec validate ex06b-restrict-production-compose-ingress --type change --strict`.
