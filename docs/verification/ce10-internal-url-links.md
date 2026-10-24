# CE10 verification evidence

Change: `ce10-internal-url-links`. Local verification on 2026-10-23.

## Indexed reads

Fixture: 1,000 published incoming sources; one source has 200 locations.
Local D1 metadata reports the following actual work (all are read-only):

| Read | SQL statements | Rows read | Rows written |
| --- | ---: | ---: | ---: |
| impact-50-sources | 3 | 1024 | 0 |
| impact-50-locations | 4 | 62 | 0 |
| picker-50-prefix | 1 | 254 | 0 |
| resolve-200 | 1 | 1399 | 0 |

These are local D1 counters. Source groups and locations have independent
keyset pages, with at most 50 groups/locations and ten initial locations per
source. There is no incoming total/count query. Query-plan review found two
joins that could scan entries; both now join through the snapshot's entry ID
and check the current draft/publication pointer after the primary-key lookup.

Observed indexed plan steps:

```text
SEARCH e USING INDEX sqlite_autoindex_content_entries_1 (id=?)
SEARCH e USING INDEX sqlite_autoindex_content_entries_1 (id=?) LEFT-JOIN
SEARCH r USING COVERING INDEX content_entry_link_references_target_idx (target_entry_id=? AND snapshot_id>?)
SEARCH r USING INDEX content_entry_link_references_target_idx (target_entry_id=? AND snapshot_id=? AND (source_key,area,field_path)>(?,?,?))
SEARCH r USING INDEX content_entry_link_references_target_idx (target_entry_id=? AND snapshot_id=?)
SEARCH r USING INDEX content_entry_link_references_target_idx (target_entry_id=?)
SEARCH s USING INDEX content_snapshots_title_prefix_idx (title>? AND title<?)
SEARCH t USING INDEX sqlite_autoindex_content_entries_1 (id=?) LEFT-JOIN
```

The picker uses a literal escaped title prefix with the title/ID index; `%`
and `_` are tested as literal input. The 200-ID resolver uses one JSON rowset.
Foreign/malformed cursors fail before reads; graph drift fails the page rather
than mixing dependency revisions.

## Complete authenticated Worker invocations

Fixture: maximum 200 blocks, 200 media references and 200 internal-reference
occurrences. Counts include Better Auth and post-response dispatch/context work.

| Invocation | Total statements | Largest atomic batch |
| --- | ---: | ---: |
| create | 36 | 26 |
| save | 42 | 29 |
| stale-save | 38 | 29 |
| publish | 28 | 13 |
| duplicate | 41 | 28 |
| revert | 22 | 12 |
| unpublish | 22 | 10 |
| delete | 13 | 4 |

Every invocation asserts at most 50 statements, every mutation batch at most 40,
and every statement at most 100 bound parameters. Title-only saves are checked
with SQL write probes: zero reference writes and zero graph revision updates.

A 100-entry export page, including entries with maximum media/internal links,
remains two batches and at most ten reads (below CE10's twelve-read ceiling).
Delivered manifests are correlated only to the selected local snapshots, are
included in page byte accounting and do not fetch destination aggregates.
Published version guards/ETags cover both export batches and continuation pages.

## Product verification

- Shared Node/D1 contracts cover publication and removal guards, 200/201 limits,
  projection rollback/diff/copy/remap, high fan-out pagination, schema/default/
  nested/block migrations and populated-model removal refusal.
- Real Node and authenticated Worker HTTP journeys traverse format-2 export
  pages and feed static Astro builds through slug changes, draft isolation,
  confirmed unpublication, same-ID recovery and slug reuse by another ID.
  Missing destinations build as plain labels without token hrefs. An injected
  build failure leaves the committed publication intact. Lost-response
  unpublication replay and stale-impact races are verified.
- SDK/render/registry checks cover malformed manifests, duplicate identities,
  immutable pure resolution, unavailable targets, first-100 diagnostics,
  callback/304 deduplication, both Link appearances and newTab, navigation
  descendants, accessible image names and lightbox fallback.
- Chromium CE10 authoring scenarios cover deduplicated status reads, debounced
  selection, nested publication-error reveal, both appearances, viewer controls,
  impact continuation/refresh and retained unsaved values. Their WCAG A/AA
  accessibility checks pass.

The owner requested spec synchronization and archive on 2026-10-24. All 13
capability deltas were merged into accepted specs and verified before archiving
at `openspec/changes/archive/2026-10-24-ce10-internal-url-links`. Strict validation
passed for all 78 accepted specs. Package publication and deployment remain
separate operations.

## Completed checks

- Content: 180; application: 104; contracts: 116; SDK: 104; render: 104;
  DB: 19; server: 86 tests passed.
- Node repository: 174 tests passed; runtime: 27 passed; migration suite passed.
  Real Node and Worker API-to-Astro journeys passed, including injected build
  failure and retained publication.
- D1 repository/Worker affected suites: 130 tests passed; D1 migration suite
  passed. Compact cursor/anchor and query-budget follow-up checks passed.
- Admin: 818 tests passed; focused URL/impact/client/palette checks passed.
  Three new Chromium scenarios and existing entry/layout browser regression
  scenarios passed, including their accessibility audits.
- Registry/CLI: 35 source-installation/update/lock/conflict tests passed;
  populated-model CLI refusal passed in text and JSON modes. Maintained source
  parity and existing-site guide/build checks: eight tests passed.
- Generator: 64 tests passed. Six generated project variants each matched two
  byte-identical regenerations. `pnpm acceptance:starter` installed 14 packed
  Lace tarballs, typechecked and built with/without globals and site URL, and
  passed cold/warm image delivery checks.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `git diff --check` and
  `pnpm exec openspec validate ce10-internal-url-links --type change --strict`
  passed. `pnpm openapi:check` passed against a temporary Git index containing
  the regenerated snapshot; the repository index was not staged or changed.

## CI follow-up on 2026-10-24

CI run `40076901192` failed because the reference-site fixture build test still
expected the markup from before the two standalone Link blocks were added.
The failure was reproduced locally. Updating the test also exposed its omitted
Link root tag and built-in type. It now verifies both appearances, resolved
destination paths and the absence of entry-token hrefs across all fixture pages.

The subsequent full `pnpm test` run exposed two more stale expectations in the
real Node-server and Worker smoke tests: both still expected export format 1.
They now require format 2 and verify empty reference manifests on their sources.

After these corrections, the complete `pnpm test` command passed: all 42 Turbo
tasks and all 211 root tests across 32 files. Typecheck, lint, formatting and
strict validation of all 78 accepted specs also passed. These results are local;
they do not assert that a new GitHub Actions run has completed.

CI run `40077934891` subsequently passed tests, the workspace build and packed
starter acceptance, then failed the existing-site acceptance's stale home-block
list. That list now includes both Link blocks, with assertions for the remapped
article href, unavailable-target label fallback and absence of token hrefs.
The journey now derives all block files from its fixture lock so installation
recreates Link and every stylesheet companion instead of retaining copied files.
The complete `pnpm acceptance:existing-site` command passed locally after this
correction, including source parity, public media and operator-edit protection.
Documentation checks and the sequential locale/version variant builds passed.
Checking all specs also exposed the still-active `video-embed-block` delta's
outdated copies of two shared requirements after CE10 synchronization: strict
validation requires those copies to preserve the newly accepted Link scenarios.
After owner approval, both shared requirement copies were updated from the
accepted specs, preserving all existing video scenarios and provider-restricted
video URLs. Full `pnpm spec:validate` then passed all 80 items (78 accepted specs
and two active changes).
