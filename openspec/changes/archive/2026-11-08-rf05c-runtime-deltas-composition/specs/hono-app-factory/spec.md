## ADDED Requirements

### Requirement: Runtime compositions share one service composition
The HTTP package SHALL provide one runtime-neutral service composition that
receives only runtime adapters and settings — persistence, security, object
storage, image inspection, clock, identifier generation, list-query limits,
logging, email delivery, rate-limit persistence, client-address lookup,
authentication boundaries, optional MCP and OAuth adapters, readiness and
HTTP settings — and returns the content, media, link, build, account and
optional OAuth-connection use cases together with the complete HTTP
application input. The Node and Cloudflare composition roots SHALL obtain
their use cases and application input from it and SHALL NOT construct those
use cases themselves. Account flows SHALL use the composed clock, so token
lifetimes follow the clock a runtime supplies. `LACE_API_DOCS_ENABLED` and
`LACE_MCP_ENABLED` SHALL be parsed by one shared rule that both runtime
settings parsers use, keeping the accepted values and the sanitized
diagnostics of the API documentation and MCP requirements. Route handlers
SHALL receive actor resolution and the capabilities they call, not the raw
application input, and SHALL depend only on the security capability ports
they call.

#### Scenario: Both runtimes compose the same services
- **WHEN** Node and Cloudflare composition roots supply equivalent adapters
  and settings
- **THEN** both obtain their use cases and application input from the shared
  composition and expose the same routes, contracts and MCP availability

#### Scenario: Account token lifetimes follow the composed clock
- **WHEN** a runtime composed with a fixed clock issues an invitation or a
  password-reset token
- **THEN** its expiry is computed from the fixed clock, not from the host
  system time

#### Scenario: An invalid feature flag is named once on both runtimes
- **WHEN** `LACE_API_DOCS_ENABLED` or `LACE_MCP_ENABLED` holds a value other
  than an accepted one
- **THEN** Node refuses startup and the Worker returns its sanitized
  invalid-environment response, each naming the variable exactly once and
  omitting the supplied value
