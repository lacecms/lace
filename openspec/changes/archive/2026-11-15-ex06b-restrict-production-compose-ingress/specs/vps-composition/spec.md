## MODIFIED Requirements

### Requirement: VPS composition isolates persistent services
The production deployment SHALL provide API, object storage, static serving
and a dedicated dispatcher with persistent database, object and release
storage. It SHALL provide a builder when a site is configured. Services
SHALL have health checks and deterministic startup dependencies. API,
storage and builder communication SHALL use private Compose networks.
Neither the repository production example nor the generated production
definition SHALL publish a host port for the API, object store, dispatcher or
builder. Nginx SHALL reach the API on the Compose network.

With default settings Nginx SHALL publish its HTTP port on IPv4 loopback
(`127.0.0.1`) for a host TLS proxy. The host port SHALL default to 8080 and
remain configurable through `LACE_HTTP_PORT`. An operator SHALL explicitly
configure any alternate Nginx binding or proxy network topology. The public
HTTPS origin SHALL serve the admin, API and configured static site through
Nginx. The Compose builder SHALL access the API at `http://api:3000/`.

#### Scenario: Production stack starts
- **WHEN** an operator supplies valid settings and starts the production stack with a host TLS proxy
- **THEN** the HTTPS origin serves the API, admin and current static release through Nginx, and the Compose port mappings expose only Nginx on the configured loopback port

#### Scenario: Production starts without a site
- **WHEN** a generated no-site project starts its production stack
- **THEN** Nginx provides the same admin and API ingress, the API has no host mapping, and the stack requires no builder

#### Scenario: An operator configures an alternate Nginx bind
- **WHEN** a deployment explicitly selects an alternate host interface for a controlled proxy
- **THEN** the resolved Nginx mapping uses that interface and the API still has no host port
