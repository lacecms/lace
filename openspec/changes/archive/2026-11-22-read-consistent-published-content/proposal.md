## Why

An anonymous read can find a published route and then fail with `Content entry published snapshot is missing` when a republish deletes the selected snapshot before its blocks are loaded. [Pre-1.0 audit item 4](page://page_422b3a21dfd08191b6efbf905d01ba3b) reproduced this on SQLite and traced the same sequence to the reader shared with D1.

## What Changes

- Return each ordinary public content response from one committed database state. This covers pages, collection items by slug, by-path lookup, routed collection lists, route-less record lists and globals.
- Fetch only published payloads and their delivered blocks, local link manifests and eligible media. Derive page membership, ordering and continuation from the same read.
- Reproduce the republish race on the production repositories. Measure SQL rows and payload bytes with a small publication and a large independent draft.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- [rest-contracts](../../specs/rest-contracts/spec.md) specifies the response an anonymous caller receives during a concurrent publication.
- [content-repository-contracts](../../specs/content-repository-contracts/spec.md) specifies shared consistency and published-only read coverage for SQLite and D1.

## Impact

One pre-1.0 audit session. The shared SQL reader in `@lacecms/db` assembles the published projection, and each native adapter supplies its atomic read boundary. Publication already replaces the pointer, route, snapshot and projections atomically. [Data model, §9](../../../docs/architecture/data-model.md) · [Publication, §10](../../../docs/architecture/publication.md) · [Public endpoints, §12](../../../docs/architecture/api.md#public-endpoints) · [Runtime boundaries, §§15–16](../../../docs/architecture/runtimes.md)

Existing API schemas, cursors and model-kind rules apply. EX5A is a separate active proposal concerning model-kind descriptors. This correction does not depend on its implementation. Build export, draft preview, static site generation, public media binary delivery and writer-side snapshot retention are outside this session.
