# Media upload commit verification

The upload scenarios ran against production repositories on file-backed
SQLite, in-memory SQLite and local D1 under Miniflare. They used a 68-byte PNG
and byte-retaining object storage. SQL assertions independently inspected the
stored row and tags. The expected SHA-256 was
`5e3d382db4dd83d59aa5742793ad6b7903409e865c83bcbc54835049f043bc15`.

| Upload failure | Database after failure | Object after failure |
| --- | --- | --- |
| Repository reload after commit, before the fix | One active row, `birch` and `ibiza`, matching SHA-256 | Missing in all three database configurations |
| Tag insert aborted the write | No media row, hash or tags | One put and one successful delete |
| Repository reload after commit, with the fix | One active row, both tags and matching SHA-256 | Authorized preview returned all 68 original bytes |
| Commit acknowledgment lost, ownership found | One active row, both tags and matching SHA-256 | Authorized preview returned all 68 original bytes |
| Commit acknowledgment lost, ownership read failed | One active row, both tags and matching SHA-256 | Authorized preview returned all 68 original bytes |
| Application catalog read failed after commit | One active row, both tags and matching SHA-256 | Authorized preview returned all 68 original bytes |

Each committed failure case remained discoverable through the SHA-256-filtered
list. Both acknowledgment-loss cases issued one metadata write, one put, one
ownership check and zero deletes. The failed ownership read logged
`MEDIA_METADATA_CREATE_OUTCOME_UNRESOLVED` with the opaque key. The rollback
logged `MEDIA_METADATA_CREATE_FAILED` with the same key. The ownership check
used one statement and both unique indexes, and found matching ownership for
`deleting` and `delete_failed` rows.

D1 reconciliation uses the database binding directly. Cloudflare routes reads
through that binding to the primary and rolls back a batch when one of its
statements fails. [D1 Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)

## Focused tests

| Suite | Passed |
| --- | ---: |
| Application media use cases | 30 |
| Application media persistence and repository contract registration | 22 |
| SQLite error translation and pass-through | 3 |
| Shared repository contracts on file-backed SQLite | 10 |
| Shared repository contracts on in-memory SQLite | 10 |
| Shared repository contracts on local D1 | 10 |
| Error classification in the shared matrix, REST and MCP | 94 |
| Packaged application and database exports | 3 |

## Repository checks

| Command | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed, including source boundaries and Drizzle schema checks |
| `pnpm format:check` | Passed |
| `pnpm exec openspec validate distinguish-media-upload-commit-outcomes --type change --strict` | Passed |
