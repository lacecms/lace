## ADDED Requirements

### Requirement: Admin settings status includes safe MCP configuration
`GET /api/v1/admin/settings/status` SHALL retain its existing session and `settings:manage` authorization and fields, and SHALL include a required strict `mcp` object containing `enabled: boolean` and `endpoint: string`. `enabled` SHALL reflect the running deployment's parsed MCP configuration; `endpoint` SHALL be the canonical absolute `/mcp` URL derived from validated deployment configuration, including when disabled. Neither request headers nor browser location SHALL choose that URL. Node and Cloudflare SHALL expose the same contract. The authenticated status route SHALL remain available when MCP is disabled, without opening any disabled MCP-only route.

This summary SHALL report configuration, not successful OAuth, public reachability, or client connectivity. It SHALL include no credentials, account connections, private environment configuration, or token material, and SHALL require no external probe or OAuth issuance. Unknown configuration SHALL NOT be represented as confirmed disabled state.

#### Scenario: Enabled and disabled configurations
- **WHEN** an authorized administrator requests settings status on either supported runtime with MCP enabled or disabled
- **THEN** the response contains the corresponding boolean and canonical endpoint alongside the existing settings data

#### Scenario: Request headers suggest another URL
- **WHEN** an otherwise accepted settings request supplies forwarding headers naming another host or port
- **THEN** the response endpoint retains the configured origin and `/mcp` path

#### Scenario: Insufficient authority
- **WHEN** an unauthenticated caller, viewer, editor, or caller presenting only an MCP/build bearer token requests settings status
- **THEN** the existing authentication or authorization error is returned without disclosing the summary

#### Scenario: Status cannot be loaded
- **WHEN** the settings status request fails
- **THEN** the client receives the existing safe failure rather than a fabricated successful response containing `enabled: false`
