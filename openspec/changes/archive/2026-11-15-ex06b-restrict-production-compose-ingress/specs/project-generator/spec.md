## ADDED Requirements

### Requirement: Generated Node guides provide distinct development and production ingress
All site modes, with or without Cloudflare support, SHALL ship an explicitly
selected managed development Compose file. The generated `pnpm dev:api`
command SHALL use it to publish the local API on loopback at
`LACE_API_PORT` (default 3000) and start the existing development services.
`pnpm prod:start` and the documented production setup command SHALL use the
production Compose definition without the development file. Development
and production commands SHALL retain the same project configuration and
persistent services.

The production guide SHALL describe first-administrator setup and build-token
creation through Nginx before any builder or dispatcher is started. It SHALL
document `LACE_PUBLIC_BASE_URL` as the public HTTPS origin and
`LACE_API_BASE_URL` as the HTTP endpoint used by host CLI requests and manual
Astro builds, with the public HTTPS ingress as the documented production
value. It SHALL document the loopback Nginx upstream, an explicit alternate
ingress configuration, and the internal builder endpoint. Host commands
that directly open SQLite SHALL continue to follow the stopped-service
procedure.

The upgrade guidance SHALL identify removal of the production API host
port and the new Nginx default, direct existing installs to migrate proxy and
host HTTP endpoints, and require a check of the resolved port bindings
after recreating the services. Existing managed-file conflicts SHALL be
handled through the normal upgrade review flow. User-owned overrides and
`.env` SHALL remain operator-controlled.

#### Scenario: A generated project starts local development
- **WHEN** the operator runs `pnpm dev:api` using the generated local settings
- **THEN** the local API and admin respond on the configured loopback development port

#### Scenario: A new production installation needs its first build token
- **WHEN** the operator follows the production setup guide before issuing a build token
- **THEN** Nginx can reach the migrated API, so the operator can open the admin, complete setup, sign in and create the token for a configured site before starting the full stack

#### Scenario: An installation used the old production API port
- **WHEN** its operator follows the upgrade guidance
- **THEN** the operator can move the proxy and host consumers to the supported ingress, recreate the stack and verify that the former direct API mapping is absent

## MODIFIED Requirements

### Requirement: Upgrade instructions start at the latest published template
The generated `.lace/upgrade-instructions.json` SHALL describe only the
database and configuration steps from the latest published template to the
current template, and SHALL NOT keep entries for upgrades from older
templates. Its database steps SHALL state that a database created by the
latest published release already starts from the baseline migration and is
upgraded by applying forward migrations with `lace db migrate`, without
recreation, and that a database created before rc2 predates the baseline, is
refused and is not supported. The generated operations guide SHALL describe the baseline
migration and SHALL NOT name numbered migrations that are no longer checked
in.

#### Scenario: Latest published template project reads the next template's instructions
- **WHEN** an operator plans an upgrade from the published rc4 template `0.49.0` to the current template
- **THEN** the upgrade guidance names forward migration with `lace db migrate` without database recreation, and the ingress and configuration changes since that published template

#### Scenario: Generated operations guide names only checked-in migrations
- **WHEN** a project is generated in any site mode
- **THEN** its operations guide mentions the baseline migration and no
  migration file that is not checked in
