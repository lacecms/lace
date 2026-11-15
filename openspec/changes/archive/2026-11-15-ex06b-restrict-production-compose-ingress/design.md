## Context

The generated and repository production Compose files currently map both
`api:3000` and `web:8080` to the host. The generated development and
production guides both use `pnpm dev:api` to reach the admin on the direct API
port. The full site deployment requires a build token created in that admin.
Nginx already reaches `api:3000` on the frontend network. The builder uses
that same service address on the backend network.

## Goals / Non-Goals

Keep a working production bootstrap path, the current local API command and the
existing private service connectivity. Use the same deployment model for
starter, existing-site and no-site consumers. Gateway and API contracts stay
within their existing deployment responsibilities.

## Decisions

### Publish a single production ingress port

Remove the `api.ports` mapping from both production definitions. Use an
explicit Nginx host IP and port in the `web.ports` mapping. Default the IP to
`127.0.0.1` through `LACE_HTTP_BIND_ADDRESS` and retain `LACE_HTTP_PORT`
with default `8080`. An empty bind setting resolves to loopback. A proxy
reaching the Docker host over a controlled interface can explicitly bind
Nginx there. A containerized proxy may join the frontend network through
operator-owned configuration and target `web:8080`. Document the firewall
and TLS expectations of the selected topology. Leave the API's internal
listener and the Nginx and builder upstreams in place.

A loopback production API port was considered. It would leave two host paths
to administer and allow local clients to bypass the documented Nginx path.

### Preserve development access with an explicit Compose file

Ship a small managed `docker-compose.dev.yml` file in generated projects.
The existing `dev:api` script selects both generated files in order. The
development file adds only the API port at `127.0.0.1` and uses the existing
`LACE_API_PORT` local setting. Production commands select only the production
definition. Register the new file in the generator's ownership inventory and
refresh the reviewed snapshots. The engine checkout already has its own
development Compose definition.

Production initializes with `docker compose up -d web`. This starts the
existing API, MinIO, migration and output initialization dependencies without
the builder or dispatcher. Configure the host TLS proxy first so the initial
admin session and build token use the canonical HTTPS origin. In no-site
mode the same command serves the admin and setup without a token-creation
step for an absent builder.

Using Nginx for generated development too was considered. It would require
changing the local API URL, the development documentation and both browser
and Astro development defaults. The explicit Compose file preserves those
entry points and gives the production command one source for port mappings.

### Update production callers and keep upgrade provenance

The production guides, environment reference and generated upgrade instructions
distinguish the public HTTPS origin, loopback upstream and internal builder
address. Set production `LACE_API_BASE_URL` to the HTTPS ingress for HTTP
diagnostics and manual export consumers. Keep the local-development defaults in
`.env.example` and have operators review them when configuring production.
Review doctor inputs so `LACE_API_PORT` is interpreted as a development host
setting and the in-container API still uses port 3000. Redirect host-side
production probes, browser setup and manual-build acceptance to Nginx.
Re-establish an admin session on the production test origin when switching
origins. Make sure tests and scripts previously reaching a direct production
port exercise the new ingress.

Use published `create-lace@0.1.0-rc4` (template `0.49.0`, source
`1988e36d`) for upgrade coverage. Keep its fixture bytes and registry
provenance separate from the newer working-tree template. The existing
managed-file conflict review handles deployments with customized Compose
files. The generated upgrade instructions describe the move from the
published template. The public compatibility guide retains rc2 as the oldest
supported release.

The exact rc4 manifest has no managed file retired by this change. Verify
removal of an unchanged retired file in an independent synthetic upgrade
fixture; keep the published fixture immutable and verify its actual changes.

## Risks / Trade-offs

- **The builder token depends on first sign-in.** Prove production setup with
  the generated empty token, then start the builder after token creation.
- **The old API mapping remains on a running container.** Exercise the
  development-to-production transition and check both Compose's resolved
  model and the actual running port mappings after recreation.
- **A custom override restores the old mapping.** Require operators to review
  the merged Compose model, including locally maintained override files.
- **A proxy reaches the host from another container or machine.** Provide
  explicit instructions for the controlled interface and Compose network
  topologies.

## Migration Plan

Review the managed infrastructure upgrade, merge any conflicts and update
operator-owned proxy configuration and `.env`. Point the TLS proxy to the
configured loopback Nginx port and move host API consumers to the HTTPS
ingress. Recreate the affected services using the production definition and
verify the port mappings, readiness, admin and build access. Retain the data
volumes and managed upgrade backups. If rolling back to the former Compose
configuration, restore its matching proxy settings and restrict the host
ports it publishes.
