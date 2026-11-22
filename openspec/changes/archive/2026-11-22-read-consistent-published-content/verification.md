# Public delivery verification

Before the fix, the shared by-path fixture captured the complete old and new
projections on migrated file-backed SQLite and local D1. The independent writer
committed after the reader's route selector returned. Both production readers
failed the whole-result assertion with `Content entry published snapshot is missing.`

The size fixture reads the same publication before and after a draft-only
edit. The observer counts result rows and UTF-8 bytes of string-valued SQL
columns, including JSON, before repository decoding. Draft rows are identified
by their draft snapshot ID in the snapshot or block row. Fixture writes,
inspection queries and HTTP serialization are outside the measurement. D1
`rows_read` is the sum of engine metadata for the read statements.

| Reader | Runtime | Draft blocks | Result rows | Text bytes | Draft rows | Draft text bytes | D1 rows read |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Before | SQLite file and memory | 3 | 10 | 907 | 4 | 333 | — |
| Before | SQLite file and memory | 64 | 71 | 430,848 | 65 | 430,274 | — |
| Before | Local D1 | 3 | 10 | 907 | 4 | 333 | 22 |
| Before | Local D1 | 64 | 71 | 430,848 | 65 | 430,274 | 83 |
| After | SQLite file and memory | 3 | 5 | 480 | 0 | 0 | — |
| After | SQLite file and memory | 64 | 5 | 480 | 0 | 0 | — |
| After | Local D1 | 3 | 5 | 480 | 0 | 0 | 25 |
| After | Local D1 | 64 | 5 | 480 | 0 | 0 | 25 |

After the fix, the WAL test commits the independent writer after SQLite
returns the first SELECT. All four SELECTs run in the reader's transaction and
the response matches the old fixture. D1 returns the new fixture when the
writer commits before the batch and the old fixture when it commits after the
batch returns rows. Each D1 read uses one batch, and the next read after the
commit returns the complete new fixture. The shared tests cover by-path,
global, and both the first and continuation pages of both list families.

### Maximum list page

Both list families returned 100 entries per request, with 101 candidate keys,
100 snapshot rows, 100 visible block rows and zero media rows in the budget
fixture. This shape and the four statements stayed fixed as the collection
grew from 201 to 1,000 publications. A first-page statement bound at most two
parameters and a continuation statement at most five. D1 used one batch for
each request, within Lace's D1 budgets of 50 queries and 100 parameters per
statement. Query plans used the snapshot primary key and snapshot-scoped
indexes for visible blocks, delivered link manifests and media references.

The engine still reads candidates to determine publication-time order. Its
`rows_read` grows with the collection, while payload rows remain scoped to the
returned snapshots. The extra bounded selections also changed the small
single-entry read from 22 to 25 engine rows on D1.

| Local D1 list | Published items | First page rows read | Continuation rows read |
| --- | ---: | ---: | ---: |
| Routed | 201 | 4,616 | 3,421 |
| Routed | 1,000 | 20,596 | 19,401 |
| Route-less | 201 | 3,016 | 2,617 |
| Route-less | 1,000 | 12,604 | 12,205 |

### Checks

| Check | Result |
| --- | --- |
| Focused repository contracts on migrated file-backed and in-memory SQLite | 36 passed |
| Same repository contracts on migrated local D1 | 18 passed |
| Server public routes, content lifecycle and OpenAPI contracts | 27 passed |
| DB selectors, read groups, build export and SQL schema drift | 15 passed |
| Delivery wire schema tests | 49 passed |
| Shared case registry and application persistence delivery | 4 passed |
| Packaged exports for `@lacecms/db` and `@lacecms/test-utils` | 3 passed |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed, including dependency boundaries and Drizzle schema |
| `pnpm format:check` | Passed |
| `pnpm exec openspec validate read-consistent-published-content --type change --strict` | Passed |
