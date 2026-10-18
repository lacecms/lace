## Purpose

Provide an optional browser reference for the running Lace API, controlled by explicit operator configuration with equivalent Node and Cloudflare behavior.

## ADDED Requirements

### Requirement: Documentation UI is explicitly enabled through runtime configuration

Both runtime compositions SHALL accept `LACE_API_DOCS_ENABLED` as an optional string environment variable. An absent value or the exact string `false` SHALL disable the UI; the exact string `true` SHALL enable it. Other supplied values, including an empty string, SHALL be invalid. Node SHALL reject startup; Cloudflare SHALL use its existing invalid-environment `503` response boundary. Diagnostics SHALL identify the variable without repeating its supplied value. A configuration change SHALL take effect after runtime restart or redeployment.

#### Scenario: Default and explicit disabled configuration
- **WHEN** either runtime starts with the variable absent or set to `false`
- **THEN** `GET /api/docs` returns the standard API `404` error envelope

#### Scenario: Operator enables the reference
- **WHEN** either runtime starts with `LACE_API_DOCS_ENABLED=true`
- **THEN** `GET /api/docs` returns `200` with an HTML API reference

#### Scenario: Invalid configuration is rejected safely
- **WHEN** the variable contains an empty string, `1`, `TRUE`, or another unsupported value
- **THEN** Node refuses startup and Cloudflare returns its sanitized invalid-environment `503`, with diagnostics naming `LACE_API_DOCS_ENABLED` and omitting the supplied value

### Requirement: Browser reference reflects the running API

The enabled reference SHALL load the existing `/api/v1/openapi.json` document from the same origin and display its operations, schemas, search, and request examples. It SHALL provide interactive requests directed to the current Lace origin without an external request proxy. The UI SHALL NOT embed server secrets or prefilled credentials or enable persistent credential storage. Its page SHALL be anonymously accessible when enabled; executed API requests SHALL retain the existing authentication, authorization, validation, and concurrency checks. The existing OpenAPI JSON endpoint SHALL remain available independently of the UI setting and SHALL retain its generated API contract.

#### Scenario: Browser discovers and calls the API
- **WHEN** an operator opens the enabled reference with its browser assets available
- **THEN** it displays methods and schemas from the live JSON document, permits search, and sends a selected public request directly to the same Lace origin

#### Scenario: Anonymous caller tries a protected operation
- **WHEN** an anonymous user submits a protected API request through the reference
- **THEN** the API returns its existing authorization failure without granting a session or additional permissions

#### Scenario: Disabled UI preserves machine-readable documentation
- **WHEN** documentation UI is disabled and a client requests `/api/v1/openapi.json`
- **THEN** the existing generated OpenAPI document is returned as before

### Requirement: Documentation routes retain API namespace behavior

The documentation route SHALL remain inside the API namespace through the Node development gateway and Cloudflare asset routing. Disabled or unknown documentation routes SHALL NOT return an admin or site fallback. Documentation responses SHALL retain shared request identifiers and completion logging. Operator documentation SHALL explain the environment switch, route, public accessibility, and browser asset network requirements.

#### Scenario: Disabled route crosses development or asset routing
- **WHEN** the UI is disabled and a browser requests `/api/docs` through the development gateway or a deployment with admin static assets
- **THEN** it receives an API `404` with a request identifier and a completion log record rather than frontend HTML
