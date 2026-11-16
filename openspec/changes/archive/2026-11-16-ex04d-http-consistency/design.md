## Context

See [proposal.md](proposal.md). Entry detail already loads a DTO with
`draft.revision`, and `resolveExpectedRevision` already parses its quoted
numeric form. Media metadata has its own monotonic `updatedAt` version.
Publishing can replace a snapshot at the same draft revision, and both the
publication pointer and actor display metadata can change independently of
that revision.

The site-build repository already sorts on `requested_at, id` with an index.
Its adapter clamps the limit to 100, while the build use case fixes the
first read at 50. The OAuth repository reads by owner and grant creation
order but the route emits a grant ID and guesses continuation from page
length. The Node and D1 account adapters currently materialize the full
user and invitation result sets.

## Goals / Non-Goals

**Goals.** Let v1 clients round-trip the write precondition and traverse
bounded lists with a shared page contract. Preserve EX4C's inferred route
types and EX4B's application authorization as the wire contracts evolve.

**Boundaries.** Entry tags express draft concurrency. Build export and
media binary caching follow their existing public contracts. Application
commands continue to own the atomic guards, and the Admin editor continues
to send JSON revision values.

## Decisions

### Emit the observed draft revision

Derive the quoted tag from the authorized projection used to serialize
`GET /api/v1/admin/entries/:entryId`. Reuse the numeric formatter and the
strong-tag grammar already understood by the revision parser. Add the
header to the documented success response and document `If-Match` on
save, publish, revert, delete and the optional guard on duplicate. The
existing parser resolves the header and body into one revision, and the
existing atomic write path evaluates it.

Serve this composite admin response with `Cache-Control: no-store`. The
quoted revision is the v1 application precondition for the draft. A
full-representation strong HTTP validator would also have to track changes
to publication and attribution at the same draft revision. That would
require a different token and equality rule from the existing revision
precondition. See [RFC 9110 §8.8.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.8.1).

Use the draft revision for publish and the published snapshot ID for
unpublish. A draft tag can remain current while the published snapshot
changes, so replacing the unpublish guard with it would allow withdrawing a
publication the caller never observed. Keep media metadata's quoted
monotonic value and its existing conflict code. Its value already covers
every metadata edit without a separate revision column, as specified in
[ADR 0009](../../../../docs/adr/0009-media-metadata.md). The publication guard
follows [ADR 0008](../../../../docs/adr/0008-entry-lifecycle-commands.md).

### Normalize transport inputs once

Define the numeric bound and default from the existing page-size constants.
In `contracts`, make REST's query parser check the decimal grammar and
then feed the resulting number into the same validation used for MCP's JSON
integer. Keep schema inputs suitable for OpenAPI and discovery. All targets
dispatch the normalized number, and the existing error pipelines report
`/limit`. Ensure the admin entry and media handlers consume their validated
limit once. Public reads and reads with independent limit contracts keep
their existing parsing and defaults.

Use the common cursor-page schema for connections, invitations and builds
and extend the user page with `total` and `disabledCount`. Route registration
continues to own authentication, schema and OpenAPI wiring. Use cases accept
transport-neutral page input, check actor authority and call the narrower
read ports. Bring their direct callers and test fixtures onto the page
contract. Connection ownership comes from the actor on every page.

### Read keyset pages through the existing adapters

Apply a prepared keyset query and eligibility predicates before
`LIMIT (limit + 1)`. Return at most `limit` rows and use the last returned
row as the boundary only when the extra row exists. This handles an exact
multiple without an extra empty request. Use the existing versioned
`db/shared/cursors` codec and a distinct list kind for each list. For OAuth,
bind the kind to a deterministic digest of the authorized owner ID and
retain the owner predicate in the SQL. Treat cursors as untrusted
continuation hints and report invalid ones using a sanitized issue at
`/after`. Cursor or query diagnostics carry neither the token nor raw
database details.

Builds keep the indexed request-time/ID order through the shared content
reader and both production adapters. Connections keep the indexed
owner/creation-time/ID order through the existing shared OAuth persistence.
Invitations keep the filtered creation-time/ID order in the security
adapters. Add a partial index on `(created_at, id)` for rows with both
`accepted_at` and `revoked_at` null. Reuse security row projections and
share the list SQL and cursor logic where the adapters differ only in
execution.

Users keep their existing ascending SQLite email order with ID as the
tie-breaker. Encode the boundary row's ID and recover its indexed email
inside the same read, keeping email out of the cursor. If the boundary row
is gone, return the standard invalid-continuation issue and restart from the
first page. Compute `total` and `disabledCount` in the database, from all
accounts and the same read snapshot as the page, including when it is empty.
Use a single statement or the existing Node transaction and D1 batch read
boundaries. This preserves exact totals without materializing every user in
the request process.

### Keep pagination state with each Admin list

Use the existing TanStack Query patterns for independent user, invitation,
build and connection lists. Keep earlier pages on continuation failures.
On `/after` rejection, offer to restart the affected list and issue a fresh
first-page request. Preserve session recovery and existing row actions.
Read the latest user totals from a refreshed page. Refresh loaded pages
from the first page with freshly issued continuations after relevant
mutations and during build polling. Give the entry editor's current-build
lookup a distinct first-page query key from the infinite build history so
the queries can share invalidation without sharing a cache entry of the
wrong shape.

## Risks / Trade-offs

- Lists reflect live data. Inserts ahead of the boundary are visible on
  refresh, and removals or reordered users can affect an in-progress
  traversal. Keysets keep a complete and duplicate-free order on static
  data. Refresh replaces the loaded sequence with one using fresh cursors.
- Exact user totals require a database aggregate over account state.
  The result is two counts, while only the bounded page is materialized.
- Every build-history refresh must derive continuations from the new first
  page. Replaying old boundaries after a new build enters the first page
  would make it possible to display gaps or duplicates.

## Migration Plan

Add the partial invitation index through the normal forward SQLite/D1
migration and update the Drizzle schema and metadata. Existing rows are
indexed in place. Upgrade the API and bundled Admin together. Document that
users and invitations now default to a single page, strict list parsers
need the new schemas, OAuth adopts the 1–100 range and default 50, and
in-flight legacy OAuth IDs must be discarded. On rollback, discard cursors
from the newer API and restore the matching pre-upgrade state under the
existing [rollback procedure](../../../../apps/docs/src/content/docs/en/latest/operations/index.md#upgrade-and-roll-back).
