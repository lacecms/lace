## Context

See proposal.md for motivation. Current state that shapes the approach:

- **Block definitions** (`packages/content/src/index.ts`).
  - `defineBlock` accepts a closed key set (`defaultValue`, `description`,
    `fields`, `label`, `migrations`, `type`, `version`) and returns a frozen
    definition with `validate(value, mode)`.
  - `toBlockMetadata` builds the JSON projection that config embeds per model
    (`blockDefinitions`) in the canonical structure and both hashes
    (`packages/config` `modelForHash`/`contentModelStructure`). A new metadata
    key changes every hash unless it is omitted when empty.
  - `BlockMigration` is `(data) => JsonObject`; `migrateBlockData` composes
    steps and checks each result with `migrationResult`.
  - Contracts re-run `defineBlock` in `isBlockMetadata` and compare canonical
    JSON, with a closed allowed-key set.
- **Aggregate validation.** `validateEntryAggregate` checks exact block keys
  (`data`, `key`, `schemaVersion`, `type`) through `assertExactKeys`, then
  validates data with `validateBlockData(definition, data, mode, path)`. Issue
  paths are `["blocks", i, …]`.
- **Domain value.** `ContentBlock` is `{data, key, position, schemaVersion,
  type}`. `cloneBlock` copies it field by field, and every snapshot copy goes
  through it.
- **Use cases.** `validateDraft` maps input blocks to the aggregate, maps the
  validated blocks back with their positions, collects media references per
  block key and fingerprints the normalized draft. `duplicate` re-keys blocks
  and calls `validateDraft`.
- **Persistence.** Block columns are listed at every site:
  - shared: `BLOCK_COLUMNS_SQL`, `BlockRow`, `storedSnapshots`,
    `copySnapshotBlocksSql`, the sync migration scan
    (`SYNC_MIGRATION_BLOCKS_SQL`, `SyncMigrationBlockRow`, `syncMigrationPage`)
    and the migration rewrite (`MIGRATED_BLOCK_VALUES`, an
    `update … from (values …)`);
  - Node: `insertBlocks` and the publish copy;
  - D1: `addBlockInserts`, a multi-row `insert … select from (values …)`
    chunked to 100 parameters, and the publish copy.

  Saves delete a draft's blocks and insert them again in the same transaction
  or batch.
- **Public projection.**
  - `publicEntry` (db) and the fake's `publicView` hand the published snapshot
    to contracts. `toPublicEntryDto`/`toPublicGlobalDto` map blocks with the
    admin `toContentBlockDto`.
  - The media dictionary comes from `publicSnapshotMediaSql` over
    `content_media_references`, and the public media route from
    `PUBLIC_MEDIA_SQL`. Neither looks at blocks.
- **Contracts.**
  - One `contentBlockSchema` (strict) serves admin requests, admin snapshots
    and public entries and globals.
  - SDK `PublishedBlock` is an alias of `ContentBlockDto`.
- **Admin.**
  - The form keeps `ContentBlockDto` values and saves them by spreading them,
    so unknown keys survive only if the DTO type allows them.
  - `insertDefinition` builds a block literal, and `duplicate` clones a block.
  - `issueLocation` maps unknown `/blocks/i/<x>` paths to block level.
- **D1 budgets.** The 34B acceptance limits a 200-block save to 50 queries and
  100 parameters per statement.

## Goals / Non-Goals

**Goals:**

- One envelope value type in domain, one rule set in `@lacecms/content`, used
  by use cases, contracts and sync.
- Existing blocks, existing clients and existing configuration hashes keep
  working without a sync or a resave.
- Hidden blocks are filtered at the public projection boundary, so every public
  surface (entries, globals, export, media dictionary, public media route)
  follows one rule.
- No new D1 statement count growth beyond a constant for large saves.

**Non-Goals:**

- Render-core and SDK view changes beyond the type alias (CE6B).
- Admin envelope controls (CE6C).
- Using hidden-only media to decide whether a media metadata edit requests a
  build. Any published reference keeps requesting it, so a spurious build is
  possible.
- Settings for built-in blocks.

## Decisions

### D1. Envelope value and defaults

Domain:

```ts
interface ContentBlock {
  readonly anchor?: string;
  readonly className?: string;
  readonly data: JsonObject;
  readonly hidden: boolean;
  readonly key: BlockKey;
  readonly position: number;
  readonly schemaVersion: number;
  readonly settings: JsonObject;
  readonly type: string;
}
```

- `cloneBlock` completes missing values (`hidden: block.hidden === true`,
  `settings: cloneJson(block.settings ?? {})`) and copies `anchor` and
  `className` only when they are strings. Repositories therefore receive
  complete blocks even from legacy callers, such as `.mjs` tests and stored
  fixtures.
- Application `CompleteDraftInput.blocks` takes `ContentBlockInput`, which
  is `ContentBlock` with the four envelope values optional.

*Alternative:* `hidden?: true` stored sparse, like `noindex`. Rejected: the
envelope is always present in DTOs and storage (`hidden` column, `settings`
`'{}'`), so an always-present domain value avoids two representations.

### D2. Rules in `@lacecms/content`

Next to `BLOCK_KEY_PATTERN`, content exports:

- `MAX_BLOCK_ANCHOR_LENGTH = 64`;
- `isBlockAnchor(value)`, which tests `/^[a-z][a-z0-9-]{0,63}$/u`;
- `MAX_BLOCK_CLASS_NAME_LENGTH = 256`, `MAX_BLOCK_CLASS_TOKENS = 16` and
  `MAX_BLOCK_CLASS_TOKEN_LENGTH = 64`;
- `normalizeBlockClassName(value): string | undefined`. It splits on ASCII
  whitespace, tests each token with `/^[A-Za-z_-][A-Za-z0-9_\-:/.%#[\]]*$/u`,
  drops repeated tokens and joins the rest with one space. It returns
  `undefined` for an invalid or blank value.

`validateEntryAggregate`:

1. `assertExactKeys(block, ["data", "key", "schemaVersion", "type"],
   ["anchor", "className", "hidden", "settings"], path)`. The optional list is
   the existing helper's second argument.
2. Validates the envelope with the codes of the block-registry delta. It
   checks anchor uniqueness against a `Set` of earlier anchors, hidden blocks
   included.
3. Computes `blockMode = hidden ? "draft" : mode` for the data.
4. Validates settings with `validateBlockSettings(definition, value, path)`:
   `validateModelFields(definition.settings ?? {}, value ?? {}, "draft",
   [...path, "settings"])`. Defaults always fill every key, so the mode does
   not matter.

`ValidatedEntryAggregate.blocks` gains the normalized envelope.

Positions stay outside the aggregate, as today. Envelope issues are
`ContentValidationError`, so the server maps them to
`422 VALIDATION_FAILED`.

Contracts use the same predicates through `v.check`. This mirrors the SEO
pattern (CE4A D3), so a malformed anchor fails at the boundary with the same
path.

*Alternative:* put the rules in `@lacecms/domain`, like SEO. Rejected: the
envelope is a block-registry concern, and the aggregate validation that must
apply them already lives in content. Domain depends on content, not the
reverse.

### D3. The custom class is an envelope field (owner decision, CE6A)

`className` is stored in `class_name`, validated by D2 and delivered in admin
and public block DTOs. CE6B passes it to block components as a prop that
block sources merge into their root `class`. CE6C edits it in *Settings*.

The token alphabet allows utility-class syntax (`md:w-1/2`, `-mt-4`,
`bg-[#fff]`) because the field exists as a site-styling escape hatch. It
excludes quotes, `<`, `>`, `=`, whitespace inside tokens and control
characters. Astro escapes attribute values anyway, so the restriction keeps
values readable and predictable rather than defending against injection.

*Alternatives:*

- A project-declared `text` setting. Rejected by the owner: every block would
  need a version bump and a migration to gain it, and built-in blocks could
  not offer it.
- Leaving it out of CE6. Rejected: CE6B already changes every block source's
  root element for the anchor, and doing it later would repeat that break.

### D4. Declared settings in `defineBlock`

- **Input.** `BlockDefinitionInput` gains `settings?: Settings` (a second
  generic, `Settings extends ModelFieldDefinitions = {}`).
- **Normalization.** `normalizeBlockSettings` reuses `normalizeBlockFields`
  and then requires `type ∈ {select, boolean, number, text}` and
  `Object.hasOwn(definition, "defaultValue")`. Field-level
  `defaultValue` validation already happens in the field builders.
- **Metadata.** `BlockMetadata` gains `settings?: Settings`, emitted only when
  the map is non-empty. `toBlockMetadata` copies it, so config structure and
  hashes include settings automatically, and blocks without settings stay
  byte-identical. A config test pins the structural hash of a model using
  built-ins.
- **Types.** `BlockSettingsValues<Settings>` is all keys required, because
  every setting has a default. CE6B uses it for typed `BlockProps.settings`.
- **Contracts.** `isBlockMetadata` adds `settings` to its allowed keys and
  passes it to `defineBlock`, so the existing canonical round-trip check
  rejects malformed or non-normalized settings.
- **Sync.** Settings changes surface as `block-definition-changed`. The
  existing same-version refusal and migration path apply unchanged.

### D5. Migration signature

```ts
interface BlockMigrationInput { readonly data: JsonObject; readonly settings: JsonObject }
interface BlockMigrationOutput { readonly data: JsonObject; readonly settings?: JsonObject }
type BlockMigration = (block: BlockMigrationInput) => BlockMigrationOutput;
function migrateBlockData(definition, block: BlockMigrationInput, fromVersion): BlockMigrationInput;
```

- `migrationResult` checks for a plain object with exactly `data` and an
  optional `settings`, both JSON objects. An absent `settings` carries the
  previous step's settings. Each step receives a detached, frozen
  `{data, settings}`.
- The built-in `image` migration becomes `2: (block) => block`. Its metadata
  is unchanged because migrations are not metadata.
- `configuration-migration.ts` `migrateSnapshot` passes
  `{data: block.data ?? {}, settings: block.settings ?? {}}`, validates data
  with `mode = state === "published" && !block.hidden ? "publish" : "draft"`
  and settings with `validateBlockSettings`. It reports failures with paths
  `data.x`/`settings.x`, and emits `settings` on
  `ConfigurationSyncMigratedBlock`.

The CE1C API is not in a published alpha (`0.1.0-alpha.4` predates it), so it
breaks without a compatibility shim. `compatibility.md` still records it.

*Alternatives:*

- `(data, settings) => data` plus a separate settings map. Rejected: a
  setting rename or a value moving between data and settings would need two
  coordinated functions.
- Accepting both the old and the new return shape. Rejected: a data object
  with keys `data` and `settings` would be ambiguous.

### D6. Storage and migration `0009`

In `schema.ts`, `contentBlocks` gains:

- `anchor: text("anchor")`;
- `className: text("class_name")`;
- `hidden: integer("hidden", { mode: "boolean" }).notNull().default(false)`
  with a `check` restricting it to `0`/`1`;
- `settingsJson: text("settings_json").notNull().default("{}")`;
- a `uniqueIndex("content_blocks_snapshot_anchor_idx")` on
  `(snapshotId, anchor)` with `.where(sql\`anchor is not null\`)`.

`db:generate` output is reviewed and, if needed, hand-adjusted to additive
statements in the `0006` style:

```sql
ALTER TABLE `content_blocks` ADD `anchor` text;
ALTER TABLE `content_blocks` ADD `class_name` text;
ALTER TABLE `content_blocks` ADD `hidden` integer DEFAULT false NOT NULL CHECK (`hidden` in (0, 1));
ALTER TABLE `content_blocks` ADD `settings_json` text DEFAULT '{}' NOT NULL;
CREATE UNIQUE INDEX `content_blocks_snapshot_anchor_idx` ON `content_blocks` (`snapshot_id`,`anchor`) WHERE `anchor` is not null;
```

SQLite allows `NOT NULL` with a constant default in `ADD COLUMN`, so existing
rows read the defaults without a backfill. The migration gets a header comment
and an entry in `checkedInMigrations`. The usual count fixes in
`platform-node` `index.test.mjs` and the prior migration test are expected.

The index is a backstop. Validation rejects duplicates first, and saves delete
a draft's rows before inserting them again, so swapping anchors between two
blocks in one save never collides.

### D7. Column lists

Every block site lists `anchor, class_name, hidden, settings_json`:

- `BLOCK_COLUMNS_SQL`, `BlockRow` and `storedSnapshots` (parse settings with
  `parseObject`, read `hidden = 1`);
- `copySnapshotBlocksSql` (revert and duplicate copies);
- the Node and D1 publish copies;
- Node `insertBlocks`;
- D1 `addBlockInserts`;
- the migration scan: `SYNC_MIGRATION_BLOCKS_SQL` adds `hidden` and
  `case when … then settings_json end`;
- the migration rewrite: `set schema_version, data_json, settings_json`,
  where `MIGRATED_BLOCK_VALUES` goes from 4 to 5 and the key, anchor, class and
  hidden flag are untouched.

The fake stores domain entries and needs no column work.

**D1 insert width.** To keep a 200-block save within the 34B budget, D1 binds
the envelope as one canonical JSON value per row. That makes 6 values instead
of 9. The SQL extracts the columns:

```sql
v.column6 ->> '$.anchor', v.column6 ->> '$.className',
coalesce(v.column6 ->> '$.hidden', 0), coalesce(v.column6 -> '$.settings', '{}')
```

`->` yields the settings as JSON text. `hidden` is serialized as `0`/`1`.

*Alternative:* nine bound values per row. It is simpler, but a 200-block save
needs about twice the insert statements. Node binds plain values, because it
has no statement budget.

### D8. Hidden blocks at the public boundary

- **Entries and globals.** `publicEntry` (db) and the fake's `publicView`
  build the public published snapshot with `blocks.filter((b) => !b.hidden)`.
  Every public read and the export use them, so hidden blocks disappear
  before contracts.
- **Contracts.** `toPublicEntryDto`/`toPublicGlobalDto` map with a new
  `toPublicBlockDto` that also skips hidden blocks, as a cheap defensive
  second filter, and never emits `hidden`.
- **Media dictionary and public media route.** `publicSnapshotMediaSql` and
  `PUBLIC_MEDIA_SQL` add:

  ```sql
  and not exists (select 1 from content_blocks b
                   where b.snapshot_id = r.snapshot_id and b.block_key = r.source_key
                     and b.hidden = 1)
  ```

  `$fields` and `$seo` never match a block key (block keys cannot start with
  `$`). The fake mirrors this by ignoring references whose source block is
  hidden. A media item also referenced by a visible block, a field or SEO
  stays, because another reference row satisfies the query. This adds no
  statements, so the export budget formula is unchanged.
- **Unchanged paths.** The deletion guard, usage counts, usage details and
  `MEDIA_USAGE_*` keep reading all references, so hidden-block media stays
  protected and listed. The media-metadata build trigger also stays as it is
  (see Non-Goals).

*Alternative:* delete hidden blocks' references or store them separately.
Rejected: that would break the deletion guard and complicate unhide, revert
and publication copies.

### D9. Contracts and server

- **Envelope schemas.** `blockEnvelopeEntries` holds:
  - `anchor: v.optional(v.pipe(v.string(), v.check(isBlockAnchor)))`;
  - `className: v.optional(v.pipe(v.string(), v.check(isClassName)))`;
  - `hidden: v.optional(v.boolean(), false)`;
  - `settings: v.optional(jsonObjectSchema, {})`.
- **Admin.** `contentBlockSchema` spreads them, so the output type always has
  `hidden` and `settings`. It is used for admin requests and snapshot DTOs.
  `toContentBlockDto` emits `hidden`, `settings` and the set optional values.
- **Public.** `publicBlockSchema` has the same entries without `hidden`
  (strict, so a `hidden` key is rejected). `publicEntrySchema`,
  `publicGlobalSchema` and the export use it.
- **Types.** `ContentBlockDto` and the new `PublicBlockDto` are exported. SDK
  `PublishedBlock` becomes `PublicBlockDto`, the only SDK change.
- **Server.** The create and save handlers already spread request blocks into
  the use case. The `ContentBlockInput` typing covers the envelope.
- **OpenAPI.** It is regenerated and staged.

### D10. Admin round-trip

- The form already spreads `ContentBlockDto`. Typed `hidden` and `settings`
  make `withoutClearedValues` and saves carry the envelope.
- `insertDefinition` adds `hidden: false` and settings built from
  `definition.settings` defaults.
- `duplicate` removes `anchor` from the clone.
- `issueLocation` keeps mapping `/blocks/i/{anchor|className|hidden|settings…}`
  to `blocks.i.block`, which tests pin.
- Mock e2e fixtures need no edits: DTO parsing fills the defaults.

## Risks / Trade-offs

- **Old SDKs reject the new public blocks.** Public parsing is strict, and SDK
  and API move together in the next alpha, as for CE3C, CE4A and CE5A.
  `compatibility.md` records the block keys and the hidden-block omission.
- **An admin older than the API erases envelopes on save.** The admin ships
  with the API. Envelopes exist only through direct API use until CE6C.
- **User-owned block migrations break at the next sync.** The signature is
  unreleased, but generated projects on the source template may have
  written CE1C migrations. Docs, the managed guide and `compatibility.md` show
  the new shape. Sync reports a migration that returns the old shape as
  `BLOCK_MIGRATION_INVALID`, naming the step, instead of failing obscurely.
- **A media metadata edit may request a build that changes nothing.** This
  happens when the media is used only by hidden blocks. The build is harmless,
  and the trigger stays simple.
- **The D1 JSON extraction must produce the same stored values as Node.** The
  repository contract suite compares envelope round-trips on both runtimes,
  and the 34B budget acceptance runs as verification.
- **Anchor validation rejects uppercase anchors.** That makes anchors
  predictable for links. CE6C can suggest slugified anchors.

## Migration Plan

1. Deploy the API with migration `0009` (Node: `lace migrate` /
   `migrateNodeDatabase`; Cloudflare: `wrangler d1 migrations apply`).
   Columns are additive with defaults, and the index is created on rows that
   all have `NULL` anchors.
2. Projects that declared CE1C migrations rewrite them to
   `({ data, settings }) => ({ data, settings? })` before the next sync.
3. Rollback: restore the pre-migration backup. A `0008` binary ignores the new
   columns but would show hidden blocks publicly and reset envelopes on save,
   so it is unsupported against a database holding envelopes.
