## ADDED Requirements

### Requirement: Public content reads are consistent and load published payloads only

The production SQLite and D1 repositories SHALL assemble ordinary public reads from the selected published snapshots and their delivered projections. They SHALL NOT fetch or decode the independently mutable draft's snapshot payload, blocks or reference payloads to construct the public result. The shared repository contract SHALL verify complete old-or-new results for a routed lookup, routed collection page, route-less record page and global, including their eligible media. The contract SHALL verify page limits and that child payloads belong only to items returned on that page.

#### Scenario: Republish overlaps selection and assembly

- **WHEN** an independent writer replaces a publication during a controlled public read whose before and after fixtures differ in fields, blocks, media and delivered links
- **THEN** each complete result matches one committed fixture, with no missing blocks, leaked hidden content, unrelated media, dropped item or mixed cursor
- **AND** a fresh read after the writer commits returns the new fixture

#### Scenario: A large draft accompanies a small publication

- **WHEN** the same small published item is read with a small draft and again after draft-only fields and block data have grown substantially in size and row count
- **THEN** both reads return the same public representation, and increasing the draft contributes zero draft payload rows or bytes to the data fetched from SQL
- **AND** verification records SQL result row counts and payload bytes for both reads on SQLite and local D1, together with D1's reported rows read
