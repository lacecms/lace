## ADDED Requirements

### Requirement: Template 0.26.0 delivers block envelope rendering
The generator SHALL advance the managed template version to `0.26.0`. In
starter mode the user-owned block components and `site/lace.site.json` SHALL
hold the registry block revisions that place the block anchor and class name
on their root element. The managed Astro site guide SHALL document the
`anchor`, `className` and typed `settings` block props, the root-element
convention for anchors and class names, declaring settings with
`defineBlock({ settings })`, and that hidden blocks are never delivered or
rendered. The managed operations guide's styling section SHALL state that the
block `id` and the editor class name are content chosen by editors, not part
of the `data-lace-*` styling contract. Template upgrade instructions SHALL
state that the engine requires the additive migration
`0009_content_block_envelope`, with the Compose and Cloudflare backup,
migration and sync sequence, and that the migration only adds columns and an
index but an older engine would deliver hidden blocks publicly and reset
envelopes on save, so rolling back once envelopes exist requires restoring
the backup. They SHALL state that a
user-written block migration now receives `{ data, settings }` and returns
`{ data, settings? }`, that the API, admin and site packages move together
because older SDKs reject public blocks carrying the envelope, and that block
components are user-owned: `lace add block --all` updates unchanged
components to the new revisions and reports edited ones as conflicts, and
scaffolded custom components are updated by hand. Upgrades SHALL preserve
user-owned files and retain deterministic managed hashes and existing
conflict detection.

#### Scenario: A new starter project is generated
- **WHEN** a starter project is generated
- **THEN** its manifest records template `0.26.0` and its block components
  and lock equal the current registry revisions byte for byte

#### Scenario: Existing project upgrades to 0.26.0
- **WHEN** a 0.25.0 project with unmodified managed files is upgraded
- **THEN** the upgrade instructions describe migration `0009`, the block
  migration signature change, the coordinated package upgrade and adoption of
  the block revisions with `lace add block --all`, and user-owned files
  including `lace.config.ts` and site sources are unchanged
