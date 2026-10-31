# ADR 0016: Import credentials

Date: 2026-10-31
Status: Accepted; SM4A

## Context

`lace import` must write drafts and media into a running installation from a
terminal or CI job and must be safe to rerun. Admin REST accepted only browser
sessions with a trusted Origin, API tokens carried only `content:build:read`,
and MCP tokens never authenticated admin REST. Media had no content hash and
entries could not be found by exact slug.

## Decision

Add a second API-token kind, `content:import`, stored in `api_tokens` with a
required expiry of 1 to 7 days and its creating administrator. Publication is
an optional extra capability, `content:publish`, granted only when the creator
currently holds that permission.

`Authorization: Bearer` on an admin or account route is an import request. It
never falls back to a session cookie and is accepted only on a fixed literal
allowlist: content models, entry list/create/read/draft save/publish, media
list/upload/read/metadata update, and the import-credential description. The
actor is the creator's current enabled account, attenuated to `content:read`,
`content:write`, `media:write` (and `content:publish`) and the delegated content
operations. Because the credential is not ambient, the cross-site Fetch
Metadata rule does not apply; an explicit untrusted `Origin` is still refused.

Account-security events of the creator (disable, password reset, sign-out
everywhere, password change ending other sessions) revoke its import tokens.
Every token verifier filters by kind, so build, import and MCP credentials never
authenticate each other's surfaces.

New uploads record a SHA-256 of their bytes; admin media lists filter by it.
Entry lists filter by exact current draft slug. Both are list parameters, not
new routes.

Rejected: an OAuth loopback flow reusing MCP delegation (browser-dependent,
unusable headless, more moving parts) and a separate `import_tokens` table
(duplicate lifecycle code for one column difference).

## Consequences

A leaked import token writes as an administrator until it expires or is
revoked. The short lifetime, closed destructive and administrative routes,
Settings revocation and account-security invalidation bound that risk. Media
uploaded before migration `0015` have no hash and may be duplicated once by an
import. Migration `0015` is additive; older releases run against it unchanged.
