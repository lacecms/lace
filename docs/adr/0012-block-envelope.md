# ADR 0012: Block envelope

- Status: Accepted
- Date: 2026-10-12
- Governing architecture: [section 8](../mvp-architecture.md#8-content-configuration),
  [section 9.4](../mvp-architecture.md#94-content-blocks),
  [section 9.5](../mvp-architecture.md#95-block-ordering-and-nesting),
  [section 10](../mvp-architecture.md#10-content-publication),
  [section 11](../mvp-architecture.md#11-block-registry-and-rich-text) and
  [section 12](../mvp-architecture.md#12-rest-api)
- Related: [content and editor roadmap](../content-editor-roadmap.md) step CE6,
  OpenSpec change `ce06a-block-envelope-contract`

## Context

A stored block was `{key, type, schemaVersion, position, data}`. Editors could
not link to a block, take a block off the site without deleting it, or pick
presentational options without mixing them into the block content. The block
contract has to settle before beta, because it shapes stored rows, the admin
and public DTOs and every user-owned block component.

## Decision

1. **An envelope beside the data.** A stored block is
   `{key, type, schemaVersion, position, anchor?, className?, hidden, settings, data}`
   in `content_blocks` columns `anchor`, `class_name`, `hidden` and
   `settings_json` (migration `0009`, additive with constant defaults).
   - `anchor`: a lowercase letter, then lowercase letters, digits and hyphens,
     at most 64 characters, unique within the entry (hidden blocks included),
     backed by a partial unique index per snapshot.
   - `className`: 1–16 whitespace-separated class tokens, normalized to single
     spaces without repeats, at most 256 characters. A token starts with a
     letter, `_` or `-` and uses letters, digits and `_ - : / . % # [ ]`, so
     utility classes such as `md:w-1/2` fit.
   - `hidden`: a boolean, default `false`.
   - `settings`: the values of the settings the definition declares, stored
     with defaults applied; `{}` when none are declared.
2. **The custom class is an envelope field (owner decision, CE6A).** It is an
   escape hatch for site styling that every block, including the built-ins,
   offers without a block version bump. CE6B passes it to block components,
   which merge it into their root `class`.
3. **Declared, typed, presentational settings.** `defineBlock({ settings })`
   uses the `select`, `boolean`, `number` and `text` builders, each with a
   `defaultValue`. Settings are part of the block metadata only when declared,
   so they enter the structural hash and changing them needs a block version
   increase; blocks without settings keep their hashes. Built-in blocks
   declare none.
4. **Migrations carry settings.** A migration step receives
   `{data, settings}` and returns `{data, settings?}`; a result without
   `settings` keeps the input settings. Sync validates migrated settings with
   their defaults and keeps each block's anchor, class and hidden flag.
5. **Hidden blocks stay stored but are never delivered.** They remain in
   drafts and published snapshots with their media references, so hiding,
   revert and the deletion guard lose nothing. Publication and sync migrations
   validate a hidden block in draft mode, so an unfinished block can be
   published hidden. Public responses and the build export leave hidden
   blocks out at the repository projection (contracts filter again), and the
   media dictionary and public media route leave out media referenced only by
   hidden blocks. Public blocks carry no `hidden` key.
6. **Compatible defaults for clients.** Create and save accept the envelope
   with every value optional; omitted values take their defaults. Admin DTOs
   always return `hidden` and `settings`; public parsing treats a missing
   `settings` as `{}`.

## Consequences

- An admin older than the API would erase envelopes on save; the admin ships
  with the API. Until CE6C the editor keeps loaded envelopes unchanged, starts
  new blocks with setting defaults and drops the anchor from duplicated
  blocks.
- An older SDK rejects public blocks with envelope keys; SDK and API move
  together in the next alpha.
- The CE1C migration signature changed before any published alpha shipped it.
- A media metadata edit still requests a build when the media is used only by
  hidden blocks of a publication; the build changes nothing and the trigger
  stays simple.
- D1 binds the envelope of each inserted block as one JSON value, keeping a
  200-block save within the statement budget.

## Alternatives considered

- **A project-declared `className` text setting.** Every block would need a
  version bump and a migration to offer it, and the built-ins could not.
- **Storing `hidden` sparsely, like SEO `noindex`.** The flag is always present
  in storage and DTOs, so one always-present value avoids two representations.
- **Removing hidden blocks' media references.** That would break the deletion
  guard and complicate unhiding, revert and publication copies.
- **A data-only migration plus a separate settings migration map.** A setting
  rename or a value moving between data and settings would need two
  coordinated functions.
- **A wrapper element around every block.** It changes page markup and CSS;
  block sources place the anchor and class on their own root instead (CE6B).
