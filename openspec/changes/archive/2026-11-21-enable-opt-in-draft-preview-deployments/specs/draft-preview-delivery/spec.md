## MODIFIED Requirements

### Requirement: Preview has an isolated host and a closed surface
Preview SHALL be served from an explicitly configured HTTPS origin on a
hostname distinct from the administrative and public site hostnames, including
local development. The preview hostname SHALL expose only its access handoff
and generation resources. Routing the same process or Worker through multiple
hostnames SHALL NOT expose admin, OAuth, MCP, import or build-control routes
on the preview hostname. Unknown hosts SHALL be rejected by the preview ingress.
An identifiable distinct preview hostname SHALL remain closed when activation
is absent or configuration is incomplete. Undoing activation SHALL deny
creation, new handoffs, delivery to existing preview sessions and preview
runner requests as soon as the updated configuration is serving. Retained
objects or in-flight runner work SHALL NOT permit access through another host
or bypass normal fencing.

#### Scenario: Admin API requested on preview host
- **WHEN** a caller requests an administrative endpoint on the preview hostname
- **THEN** it is unavailable even with a valid preview cookie

#### Scenario: Site code tries to inspect the admin frame
- **WHEN** preview JavaScript attempts to read the embedding admin document
- **THEN** browser origin isolation prevents access

#### Scenario: Disabled or partially configured preview hostname
- **WHEN** a request reaches the known preview hostname with activation disabled or configuration incomplete
- **THEN** it is denied without falling through to the CMS, static site, development proxy or runner routes

#### Scenario: Turn off an active deployment
- **WHEN** an operator disables preview while keeping its configuration and private data and a client presents an existing handoff, preview session or runner credential
- **THEN** the updated deployment denies handoff, artifact reads and runner writes, and public site output remains available
