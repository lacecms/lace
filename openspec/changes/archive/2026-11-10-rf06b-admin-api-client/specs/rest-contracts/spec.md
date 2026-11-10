## ADDED Requirements

### Requirement: OpenAPI describes account and administration reads
The generated versioned OpenAPI document SHALL describe the existing user list, account capabilities, settings status, build-token list, and build-token revocation operations, including their path parameters, success responses, and applicable sanitized error responses. Their existing session authorization, permissions and runtime behavior SHALL remain unchanged on Node and Cloudflare.

#### Scenario: Account and administration operations are discoverable
- **WHEN** a consumer inspects the generated versioned OpenAPI document
- **THEN** it describes `GET /api/v1/admin/users`, `GET /api/v1/account/capabilities`, `GET /api/v1/admin/settings/status`, `GET /api/v1/admin/api-tokens`, and `DELETE /api/v1/admin/api-tokens/{tokenId}` with their response contracts

#### Scenario: Existing authorization is preserved
- **WHEN** an anonymous or insufficiently authorized caller invokes an operation documented by this requirement
- **THEN** the existing session and permission checks continue to deny the request with the existing sanitized failure response
