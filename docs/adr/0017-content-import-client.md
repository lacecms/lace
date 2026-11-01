# ADR 0017: Content import client

Date: 2026-11-01
Status: Accepted; SM4B

## Context

`lace import` loads a portable package of media files and entries into a
running installation. It must work the same against Node, a local Worker and a
remote Cloudflare installation, be safe to rerun and never lose an editor's
work by accident. SM4A ([ADR 0016](0016-import-credentials.md)) added the
import token, media hashes and exact slug lookups on the admin REST API.

## Decision

`lace import` is an HTTP client of the admin REST API authenticated by an
import token. It never opens the database or object storage, so every write
passes through the same use cases, media verification, link guards, build
requests and actor identity as an editor's write, and it needs no database or
storage credentials. `@lacecms/cli` may therefore import `@lacecms/contracts`
to validate responses and build requests.

The package format is versioned (`formatVersion: 1`) and ships with a JSON
Schema. Media are matched by SHA-256, page and global entries by model and
collection entries by exact draft slug; the server stays the source of truth.
Draft normalization is one pure application function used by the server and
the CLI, so "unchanged" is decided exactly and a rerun writes nothing.

A local state file records, per API origin, the IDs and the draft revision the
import last wrote. A draft changed after that revision that differs from the
package is a conflict: the run writes nothing unless `--overwrite` is given.

Rejected: writing through platform repositories like `content sync` (bypasses
media verification and storage, needs remote D1 and R2 credentials); a
server-side "save only if changed" endpoint (new REST contract for what a
shared pure function decides); always overwriting matched drafts (silently
reverts editors' changes).

## Consequences

Import speed is bounded by the upload rate limit; the CLI waits for
`Retry-After` and resumes on rerun. The CLI and the server should be the same
release so normalization matches. Entries and media missing from a package are
never deleted or unpublished.
