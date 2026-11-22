## 1. Capture the race and the cost of loading a draft

- [x] 1.1 Add a shared delivery fixture with two distinguishable publications. Use independent reader and writer repositories, commit between the current selector and child reads, and confirm the production by-path reader fails the old-or-new response assertion on file-backed SQLite and local D1. Capture both complete expected bodies.
- [x] 1.2 Establish the pre-fix baseline for a small published item with a small draft and the same item with a large draft. Record draft block count, SQL result row count and text/JSON bytes from the read boundary on both runtimes, plus engine-reported rows read on D1.

## 2. Read the published projection in one database view

- [x] 2.1 Add the shared bounded selectors and row assembly in the DB delivery area. Verify selection by path or global key, routed and route-less list ordering, cursor tie-breaks and the limit-plus-one boundary. Verify only returned snapshot IDs contribute visible blocks, local link manifests or media, including when the lookahead has large children.
- [x] 2.2 Execute the ordinary public statement group in one Node read transaction or one local D1 batch and wire all four public reader methods to it. Assert a file-backed WAL reader stays coherent across a writer commit and each D1 read produces the corresponding complete fixture when the writer commits on either side of the batch. Verify there are no content reads after the atomic group.
- [x] 2.3 Exercise both list families and the global in the shared suite. Move an item across the list boundary on republish and compare whole first and continuation pages, including the cursor. For each family assert the new state is visible on a fresh read and that hidden/draft-only values and unrelated media are absent.
- [x] 2.4 Repeat the size comparison from 1.2, check the maximum supported list limit and record before/after evidence. Verify growing only the draft adds no draft payload rows or bytes, queries stay bounded as item count grows and all D1 statement and binding limits are respected.

## 3. Verify the public contract and document its scope

- [x] 3.1 Verify the public route tests cover pages, collection slug and path aliases, globals and both list families, including a stable address (200), a genuinely withdrawn or moved address (404), and the current invalid-cursor response. Confirm the wire schemas and build export version-change behavior still pass their existing checks.
- [x] 3.2 Document request-level consistency in `docs/architecture/api.md`, the runtime read boundaries in `docs/architecture/runtimes.md`, and the public guarantee in the latest API reference. Verify the docs distinguish one list page from a version-pinned build export.
- [x] 3.3 Run the focused repository, HTTP and build-export checks on their applicable targets, including migrated file-backed SQLite, in-memory SQLite and local D1. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate read-consistent-published-content --type change --strict` and record the results.
