## ADDED Requirements

### Requirement: D1 media tag operations are guarded and bounded
D1 SHALL replace an item's tags inside the existing guarded metadata-update
`batch()`: deleting the item's tag rows and inserting the new set SHALL be
conditional on the same guard as the row update, so a zero-row guard leaves
tags unchanged. An upload SHALL store its tags in the same batch as the new
metadata row. Final media metadata removal SHALL delete the item's tag rows in
its guarded batch, independent of foreign-key enforcement. A filtered media
list page SHALL use one indexed query per page plus the existing usage and
uploader reads, and a tag catalog page SHALL use one indexed aggregate query,
both within the existing D1 statement and invocation budgets and with
parameter counts bounded by the five-tag filter and 20-tag item limits.

#### Scenario: Concurrent tag edits commit once
- **WHEN** two updates with the same expected `updated_at` replace the tags of one item concurrently
- **THEN** exactly one tag set is stored and the other update fails with `MEDIA_UPDATE_CONFLICT`

#### Scenario: Filtered lists stay within budgets
- **WHEN** the D1 budget suite lists a 500-item library filtered by five tags and reads the tag catalog
- **THEN** each page stays within the recorded statement and invocation budgets
