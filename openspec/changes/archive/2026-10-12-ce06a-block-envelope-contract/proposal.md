## Why

A stored block is only `{key, type, schemaVersion, position, data}`. Editors
cannot link to a block (`#pricing`), cannot take a block off the site without
deleting it, and projects cannot offer presentational choices (alignment,
background, spacing) without mixing them into the block's content fields. Step
CE6 of [`docs/content-editor-roadmap.md`](../../../docs/content-editor-roadmap.md)
adds a block envelope. This change implements session **CE6A — Envelope data
contract**: definitions, storage, validation, lifecycle copies, sync
migrations and the REST/export contract. Rendering and site delivery (render
core, Astro adapter, registry block revisions, template bump) are CE6B, and the
admin *Settings* tab is CE6C. The block contract changes before beta, so it
lands now while the alpha may still break it.

## What Changes

- **Envelope.** A stored block becomes
  `{key, type, schemaVersion, position, anchor?, className?, hidden, settings, data}`:
  - `anchor`: optional; a lowercase letter followed by lowercase letters,
    digits and hyphens, at most 64 characters, unique within the entry.
  - `className`: optional; the CE6A owner decision makes the custom CSS class
    an envelope field, not a project setting. It holds 1–16 class tokens
    separated by whitespace, normalized to single spaces without duplicates,
    at most 256 characters. Each token starts with a letter, `_` or `-` and
    uses only letters, digits and `_ - : / . % # [ ]`, so utility classes such
    as `md:w-1/2` work.
  - `hidden`: boolean, default `false`.
  - `settings`: the values of the settings the block definition declares,
    stored with defaults applied; `{}` when it declares none.
- **`defineBlock({ settings })`**. Settings use the field builders limited to
  `select`, `boolean`, `number` and `text`, and every setting must declare a
  `defaultValue`. Settings enter the block metadata (only when declared), so
  they are part of the structural hash, and changing them needs a block version
  increase. Blocks without settings keep byte-identical metadata and hashes.
  Built-in blocks declare no settings.
- **BREAKING (unreleased alpha API): block migrations take and return the
  envelope's data and settings.** A step becomes
  `({ data, settings }) => ({ data, settings? })`. When the result leaves out
  `settings`, the input settings carry over. The built-in `image` identity
  migration, the docs and the managed operations guide follow.
- **Validation.**
  - Entry validation accepts the envelope. It checks the anchor format and its
    uniqueness within the entry, the class tokens, `hidden` and the declared
    settings, and rejects unknown settings.
  - At publication, a hidden block is validated in draft mode, so an unfinished
    block can be published hidden.
  - Sync migrations also validate hidden blocks in draft mode, and validate
    migrated settings.
- **Migration `0009`** adds `anchor`, `class_name`, `hidden` (`0`/`1`, default
  `0`) and `settings_json` (default `'{}'`) to `content_blocks` with additive
  `ALTER TABLE … ADD` statements, plus a partial unique index on
  `(snapshot_id, anchor)` where `anchor` is set.
  - Every block column list on both runtimes is updated: save, publish copy,
    revert, duplicate, sync migration rewrite and reads.
- **Hidden blocks stay stored but are never delivered.**
  - They remain in the draft and the published snapshot, and their media keep
    their reference rows. Hiding and revert therefore lose nothing, and the
    deletion guard still protects that media.
  - Public responses and the build export leave hidden blocks out.
  - The public media dictionary and the public media route leave out media that
    only hidden blocks reference.
- **Contracts.**
  - Admin block DTOs always carry `hidden` and `settings`, and carry `anchor`
    and `className` when set.
  - Create and save requests accept the envelope. When a client leaves out
    envelope fields, they default (no anchor or class, visible, declared
    defaults), so existing clients keep working.
  - Public blocks become `{key, type, schemaVersion, position, anchor?,
    className?, settings, data}`. They have no `hidden` key, and a missing
    `settings` key parses as `{}`.
  - Block metadata DTOs accept `settings`. OpenAPI is regenerated.
- **Admin round-trip, without envelope UI.**
  - The editor keeps every loaded envelope value through edits and saves.
  - A new block starts visible with its declared setting defaults.
  - Duplicating a block copies its envelope except the anchor.
  - Envelope validation issues appear at block level.
- **Documentation:**
  - architecture sections 9.4, 9.5, 10, 11 and 12;
  - ADR 0012 for the envelope, the class decision and the hidden-block
    delivery rule;
  - `docs/database-migrations.md`, `docs/compatibility.md` and
    `docs/configuration-synchronization.md`;
  - the managed operations guide's migration example;
  - the roadmap (CE6 in progress, the class decision recorded).

Not in this change:

- `RenderableBlock`/`BlockProps` envelope props and typed settings, the render
  core's hidden-block skip, the Astro adapter, `id={anchor}` and `class` in
  registry blocks, the starter and reference site, the template version bump
  and upgrade notes (CE6B);
- the admin *Content*/*Settings* tabs, anchor editing with copy-link, the
  hidden switch, the *Hidden* badge and settings controls (CE6C);
- any setting on a built-in block.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `block-registry`: declared settings, the migration signature with settings,
  and envelope validation of the ordered aggregate (anchor, class, hidden,
  settings, draft-mode hidden blocks at publication).
- `content-domain-rules`: the block envelope as part of the snapshot value and
  its defaults.
- `content-use-cases`: the envelope through create, save, publish, duplicate
  and revert, with hidden blocks validated in draft mode at publication.
- `schema-evolution`: migrations carry settings, and hidden blocks are
  validated in draft mode during sync migrations.
- `sqlite-schema-and-migrations`: the `content_blocks` envelope columns, the
  anchor index and migration `0009`.
- `content-repository-contracts`: envelope persistence, copies, anchor
  uniqueness and hidden-block omission on both runtimes.
- `rest-contracts`: admin and public block DTOs, block metadata settings, and
  hidden-only media left out of public media.
- `admin-draft-editor`: envelope round-trip, defaults for new blocks and
  duplicate without anchor.

## Impact

- Code:
  - `packages/content` (definition, metadata, migrations, aggregate validation,
    built-in `image` migration);
  - `packages/domain` (block value and clone defaults);
  - `packages/config` (structure includes settings through block metadata);
  - `packages/application` (use cases, sync migration);
  - `packages/db` (schema, migration `0009`, shared SQL);
  - `packages/platform-node`, `packages/platform-cloudflare` and
    `packages/test-utils` (fake and contract suite);
  - `packages/contracts`, `packages/server` and `packages/sdk` (the
    `PublishedBlock` type follows the public block DTO);
  - `apps/admin` (round-trip and defaults);
  - `apps/api/openapi/api-v1.json`.
- APIs. Additive admin block keys, and public blocks gain envelope keys while
  hidden blocks disappear from public output. Strict public parsing means an
  older SDK rejects the new keys; SDK and API already move together in the
  next alpha. There are new validation issue codes and a changed block
  migration signature.
- Database: migration `0009` (additive columns and one partial unique index).
- Architecture sections 9.4, 9.5, 10, 11 and 12; sections 13.3–13.5 change in
  CE6B.
- Depends on CE1C (block migrations) and CE3C (public media dictionary). CE6B
  and CE6C build on it.
