## ADDED Requirements

### Requirement: Site views resolve link values from one complete published export
The site, each entry and each global SHALL expose a pure `link(value)` lookup
returning a discriminated result: `resolved` with safe `href` and optional
`targetId`, `unavailable` with `targetId` and no href, or `empty` with no href
for an absent optional value. Manual safe URLs SHALL resolve unchanged. Invalid
values SHALL fail rather than become safe hrefs. Canonical references SHALL
look up a map of exported routed entry IDs to current paths, excluding globals.
Stored fields/blocks SHALL remain immutable and unchanged. The loader SHALL
reject duplicate source IDs across routed entries/globals, inconsistent/duplicate manifest locations or
tokens disagreeing with their manifest as `invalid_export`. Before exposing a
site view it SHALL collect bounded unresolved diagnostics under the shared
internal-link contract. It SHALL expose `linkDiagnostics: {total, items,
truncated}` and an optional caller diagnostic callback, invoked at most once
per newly assembled export. Resolution SHALL do no network or DB work.

#### Scenario: Immutable resolution
- **WHEN** a source stores `entry:target` and that target exports `/new`
- **THEN** `link()` returns `resolved` with `/new` and `targetId: target`, while the stored value remains `entry:target`

#### Scenario: Missing reference is recoverable
- **WHEN** a valid export's manifest references an absent target
- **THEN** the site view exists, its lookup reports `unavailable`, and diagnostics identify the location

#### Scenario: Duplicate identity or inconsistent manifest
- **WHEN** two exported routes claim one ID or a manifest location points to a different token
- **THEN** the loader fails with `invalid_export` rather than choosing an arbitrary route

#### Scenario: Revalidation updates links
- **WHEN** revalidation observes a new published version after target republishing
- **THEN** the replacement site view uses the new map and diagnostics, while a 304 reuses the prior view without duplicate warnings
