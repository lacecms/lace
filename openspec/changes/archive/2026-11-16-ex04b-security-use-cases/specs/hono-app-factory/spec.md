## ADDED Requirements

### Requirement: Security and build administration routes defer authorization to application use cases

The HTTP application SHALL use application operations for build and import token administration, the import-credential description, users, invitations, account operations, setup, settings and site-build administration. Handlers SHALL resolve credentials and trusted session context, validate transport inputs, call the use case and map its outcome to the existing REST contract. Route metadata and middleware SHALL continue to enforce credential selection, origin and Fetch Metadata policy, body limits and rate limits. Handlers and route actor helpers SHALL delegate operation permissions and ownership to the application without calling account, session, token-management or profile persistence ports directly.

The application SHALL preserve the existing method/path inventory, credential matrix, response schemas, status codes and headers on Node and Cloudflare. Build export SHALL continue to use its callable credential verifier before any export read or conditional response. MCP SHALL expose only its existing six tools and use the same application content operations as REST. Administrative and account operations SHALL stay outside delegated MCP authority.

#### Scenario: HTTP authentication and use-case authorization return distinct outcomes

- **WHEN** a browser session is missing or invalid, or an authenticated editor sends a valid token-management request
- **THEN** the former receives the existing `401` with the route's session challenge, the latter receives `403`, and neither performs protected token work

#### Scenario: Build commands keep their authorization and validation precedence

- **WHEN** a viewer with a valid session submits a manual build or retry whose JSON body has an unexpected field, or an administrator submits the same request
- **THEN** the viewer receives the existing `403` and the administrator receives the existing validation error without enqueueing a build

#### Scenario: Credential kinds stay within their route boundaries

- **WHEN** a caller uses an import or MCP bearer credential alongside a valid cookie on a session-only management route, or uses only a session on the import-credential description
- **THEN** the request is denied without cookie fallback or disclosure of credential metadata

#### Scenario: Existing methods and responses match across runtimes

- **WHEN** equivalent Node and Cloudflare compositions serve an administrator, a signed-in viewer, an anonymous client and an authorized MCP client
- **THEN** the runtimes expose the same operation inventory and preserve the existing security responses, OAuth tool scope and OpenAPI contracts

## MODIFIED Requirements

### Requirement: Runtime compositions share one service composition

The HTTP package SHALL provide one runtime-neutral service composition that
receives only runtime adapters and settings (persistence, security, object
storage, image inspection, clock, identifier generation, list-query limits,
logging, email delivery, rate-limit persistence, client-address lookup,
authentication boundaries, optional MCP and OAuth adapters, readiness and
HTTP settings) and returns the content, media, link, build, account, security
administration and optional OAuth-connection use cases together with the
complete HTTP application input. The Node and Cloudflare composition roots
SHALL obtain their use cases and application input from it and SHALL NOT
construct those use cases themselves. Account flows and build and import token
administration SHALL use the composed clock, so token timestamps and
lifetimes follow the clock a runtime supplies. `LACE_API_DOCS_ENABLED` and
`LACE_MCP_ENABLED` SHALL be parsed by one shared rule that both runtime
settings parsers use, keeping the accepted values and the sanitized
diagnostics of the API documentation and MCP requirements. Route handlers
SHALL receive actor resolution and the application capabilities they call,
including the optional build-token verifier for build-export authentication.

#### Scenario: Both runtimes compose the same services

- **WHEN** Node and Cloudflare composition roots supply equivalent adapters
  and settings
- **THEN** both obtain their use cases and application input from the shared
  composition and expose the same routes, contracts and MCP availability

#### Scenario: Account token lifetimes follow the composed clock

- **WHEN** a runtime composed with a fixed clock issues an invitation or a
  password-reset token
- **THEN** its expiry is computed from the fixed clock

#### Scenario: An invalid feature flag is named once on both runtimes

- **WHEN** Node and the Worker receive a feature flag outside the accepted values
- **THEN** Node refuses startup and the Worker returns its sanitized
  invalid-environment response, each naming the variable exactly once and
  omitting the supplied value
