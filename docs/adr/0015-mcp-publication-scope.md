# ADR 0015: MCP publication scope

Date: 2026-10-31
Status: Accepted; SM2 implemented

## Context

Agents can prepare drafts but require publication authority to complete content
migration and maintenance. Publication must remain a separate explicit choice.

## Decision

Add `content:publish`, implying write and read, and `publish_entry` through the
shared publication use case. Only users whose current role has `content:publish`
(today administrators) may consent. Read remains the default and narrower consent
is allowed. Every request intersects token scopes, the consent ceiling, current
role and the fixed operation allowlist. Demotion immediately removes publication;
promotion and refresh never widen an existing connection.

Unpublication and deletion remain forbidden through MCP: they remove public
content and can break internal links, whose CE10 confirmation flows require a
human. Revert, duplicate, media and administration remain outside the tool set.

## Consequences

A compromised publish-scoped token can change public content. Explicit admin
consent, fifteen-minute access tokens, durable revocation and unchanged validation,
revision, route and internal-link guards bound that authority. Publication uses
the existing idempotency storage and coalesced build outbox; content reaches the
site on the next build. No database migration is needed. Existing grants keep
their scopes and must re-authorize explicitly to gain publication. Deploy API,
admin and MCP together; after rollback revoke and reconnect affected clients.
