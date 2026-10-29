# mcp-content-server Specification

## Purpose

Lets an authorized MCP client inspect Lace models and prepare content drafts
through the same portable behavior used by the admin API on Node and Cloudflare.

## Requirements

### Requirement: MCP is explicitly enabled per installation
The installation SHALL expose MCP at its canonical `/mcp` path only when
`LACE_MCP_ENABLED` is the string `true`. An absent variable or the string `false`
SHALL disable MCP. Other values SHALL fail configuration validation without
printing their values, using the runtime's existing safe startup/unavailability
behavior. Disabled installations SHALL return `404` for MCP, MCP-only OAuth,
discovery and connection-management endpoints without serving an admin SPA or
starting an authorization flow. Browser authentication, REST and build-token
behavior SHALL remain available as before. Disabling SHALL prevent token
issuance, refresh and use; it SHALL NOT erase existing durable connections.

#### Scenario: Default installation
- **WHEN** an installation starts without `LACE_MCP_ENABLED`
- **THEN** `/mcp` and MCP-only discovery return `404` and ordinary admin login and content REST routes retain their behavior

#### Scenario: Explicit activation and invalid configuration
- **WHEN** the variable is `true`, or has an unsupported value such as `1`
- **THEN** the former enables MCP and the latter produces the runtime's sanitized configuration failure naming only the variable

#### Scenario: Disabled existing connection
- **WHEN** a previously connected client calls MCP or refresh after an operator disables MCP
- **THEN** the request returns `404` and no content operation or token issuance runs

### Requirement: The first tool set is closed and draft-oriented
The MCP tool surface SHALL contain only `list_content_models`, `list_entries`,
`get_entry`, `create_entry` and `save_draft`. Read tools SHALL require the
effective `content:read` permission; create and save SHALL require effective
`content:write`. Tool discovery SHALL expose only permitted tools, and every
call SHALL independently authorize its operation. The server SHALL NOT provide
an arbitrary HTTP, SQL, code-execution or operation-name proxy. Publication,
unpublication, deletion, revert, duplication, media operations, build requests,
user/settings management and configuration/source editing SHALL be unavailable.
Unknown or forbidden tool names SHALL fail without invoking a content command.

#### Scenario: Viewer discovers tools
- **WHEN** a connected viewer lists tools with read consent
- **THEN** only the three read tools are listed and a direct `save_draft` call is refused without mutation

#### Scenario: Administrator uses MCP
- **WHEN** an administrator grants read/write access and lists tools
- **THEN** exactly the five supported tools are listed and requests for publish, unpublish or delete cannot execute

### Requirement: Tools reuse content models and complete-draft semantics
`list_content_models` SHALL return the same serializable field, allowed-block,
SEO, layout and runtime query-limit metadata as the admin model endpoint.
`list_entries` SHALL accept a model key and the existing bounded cursor, limit,
search, sort, status and typed-filter semantics, returning the admin list
representation including totals and continuation. `get_entry` SHALL return the
admin entry representation including draft revision, published snapshot when
present, derived state and safe editor attribution, or the existing not-found
outcome. `create_entry` SHALL accept a model key and complete draft under the
same singleton rules as REST. `save_draft` SHALL require an entry ID, complete
draft and explicit expected revision. All tools SHALL reuse current content
validation, defaults, references, limits and DTO representations. A draft write
SHALL NOT publish, change public state or request a site build.

#### Scenario: Metadata changes once
- **WHEN** the configuration adds a supported field or changes an allowed block's metadata
- **THEN** REST model discovery and MCP discovery return the same updated representation without an MCP-specific metadata definition

#### Scenario: Runtime-specific query limits
- **WHEN** a client submits a search beyond the advertised Cloudflare budget
- **THEN** MCP rejects it before content reads just as REST does, without substituting the Node budget

#### Scenario: Invalid draft
- **WHEN** a writer submits an unknown field, invalid block, inactive media reference or invalid internal link
- **THEN** the existing shared validation outcome is returned and content, references and revision remain unchanged

#### Scenario: Concurrent browser and MCP save
- **WHEN** a browser and MCP client save the same entry from the same revision
- **THEN** only one write commits, the other returns the existing revision conflict, and neither adapter silently reloads and overwrites the winning draft

#### Scenario: Editing published content
- **WHEN** MCP successfully saves the draft of a published entry
- **THEN** its draft revision advances while its published snapshot, public-state version and build outbox remain unchanged

### Requirement: MCP transport is bounded and runtime-portable
The server SHALL provide authenticated stateless Streamable HTTP tool calls on
both runtimes, including ordinary tools discovery and invocation by an MCP
`2025-11-25` client. Protocol negotiation and JSON-RPC validation SHALL follow
the pinned protocol implementation; unsupported versions/methods SHALL fail
explicitly. The first release SHALL NOT require persistent protocol sessions,
server-initiated sampling, subscriptions, resumability or background MCP tasks.
Identity and tool state SHALL be isolated per request. Host and any supplied
browser Origin SHALL be validated against explicit deployment policy;
origin-less authenticated non-browser clients SHALL remain supported. Browser
CORS SHALL NOT broaden the admin session's trusted origins. The server SHALL
enforce the existing content payload/query bounds before content work, with a
request-body ceiling no larger than the existing admin JSON ceiling and a
per-user MCP limit of 60 requests per minute. Rate-limit responses SHALL carry
`Retry-After`. Separate calls SHALL NOT share one user's credentials or actor.

#### Scenario: Ordinary MCP client connects
- **WHEN** a `2025-11-25` Streamable HTTP client completes OAuth, initializes, lists tools and calls a permitted tool
- **THEN** Node and Cloudflare return equivalent tool schemas and content results without a protocol session store

#### Scenario: Concurrent identities
- **WHEN** viewer and administrator calls interleave in the same server instance
- **THEN** every call uses its own resolved authority and no tool result or tool visibility inherits the other identity

#### Scenario: Hostile Origin or oversized request
- **WHEN** a request has an untrusted browser Origin, invalid Host or an oversized body
- **THEN** it is refused before content work and credentials or submitted content do not appear in logs

### Requirement: MCP results retain shared errors and safe observability
Successful tool calls SHALL expose validated JSON in `structuredContent` and a
text representation of the same result. Known application failures SHALL
preserve their shared stable code and safe issue paths inside an MCP tool error;
protocol failures SHALL use protocol errors. Missing/invalid authorization and
insufficient scope SHALL retain the OAuth HTTP challenges rather than being
reported as successful tool results. Completion logs SHALL record request ID,
tool name, outcome, duration and resolved actor ID where available, excluding
bodies, tokens, authorization codes and client secrets. Unexpected failures
SHALL return only the existing sanitized internal-error classification.

#### Scenario: Equivalent validation failure
- **WHEN** the same invalid complete draft is submitted through REST and MCP
- **THEN** both expose the same stable content error code and issue paths using their respective transport envelopes

#### Scenario: Token is invalid
- **WHEN** a client calls a tool with an expired or revoked token
- **THEN** it receives the OAuth authorization failure before tool execution and the token never enters the completion log
