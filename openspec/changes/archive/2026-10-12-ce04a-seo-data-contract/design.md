## Context

See proposal.md for motivation. Current state that shapes the approach:

- **Configuration.** `packages/config/src/index.ts`:
  - `normalizeCommonModel` validates the model hints.
  - `normalizeListFields` checks references to the model's own fields; it is
    the pattern for checking field references.
  - `assertUniqueModels` switches on kind and has an empty `global` branch.
  - `modelForHash` feeds the projection hash, and `contentModelStructure` (the
    projection minus `listFields` and display metadata) feeds the structural
    hash.
  - `publicModel` strips the hints from the admin projection.
  - Any new model property lands in both hashes unless it is stripped
    explicitly.
- **Sync classification.** `packages/application/src/configuration-evolution.ts`:
  - `diffContentModelStructures` reports every model property outside
    `MODEL_IDENTITY_PROPERTIES` as a breaking `model-property-changed`, so a
    `seo` structure property would be refused today.
  - Data evidence comes from an in-memory scan of the current snapshots
    (`createSnapshotEvidenceAccumulator` over `SYNC_SNAPSHOTS_SQL` pages).
  - Destructive decisions are made in `decideEvolution`
    (`configuration-sync.ts`): `FIELD_REMOVAL_HAS_DATA` without a hint,
    otherwise a content write.
  - Content writes are a union rendered to SQL by
    `configurationSyncWriteStatements` (`db/src/sql-content.ts`) and applied
    inside the guarded final mutation.
- **Snapshot persistence.** Snapshot columns are listed explicitly at every
  write and copy site:
  - shared: `SNAPSHOT_COLUMNS_SQL`, `revertDraftSnapshotSql`;
  - Node `insertSnapshot`, `saveCompleteDraft` and the `publish` copy;
  - D1 `addSnapshotInsert`, `saveCompleteDraft` and the `publish` copy.

  Domain `cloneSnapshot`, `saveCompleteDraft` and `revertContentDraft` also
  build snapshots field by field. Media references are copied wholesale by
  `copySnapshotReferencesSql` and the publish copies, so a new source key rides
  along.
- **Media references.**
  - `DraftMediaReference.sourceKey` is `"$fields" | BlockKey`.
  - `mediaUsageEntries` treats every non-`$fields` source as a block and throws
    when the block row is missing.
  - Contracts `mediaUsageLocationSchema` is a two-variant union.
  - Sync field rename and removal touch only `$fields` rows.
  - Sync block migrations re-insert references only for migrated block keys.
  - Block removal deletes references whose source key matches a block of that
    type.
- **Validation.**
  - Use cases validate through `validateEntryAggregate` (`@lacecms/content`,
    which issues `ContentValidationError`), then collect media references and
    check that the media are active.
  - `@lacecms/domain` already holds the media text rules (`normalizeMediaText`),
    which contracts reuse through `v.check`.
  - Contracts already have an absolute-URL check (`isSiteBaseUrl`) that uses a
    locally declared `URL` type, so it compiles without DOM or Node types.
  - The boundaries are: content ← domain ← contracts. The server reaches
    domain only through application and contracts. The SDK imports only
    contracts.
- **Admin.** The admin save (`EntryPage` `mutationFn`) builds the request from
  form values and drops unknown keys, so a whole-draft save would erase SEO set
  by API clients.
- **Public reads.** Public reads and the export are mapped by contracts from
  `ContentEntry` values without model configuration. The server holds the
  configuration.

## Goals / Non-Goals

**Goals:**

- One SEO value type and one rule set, in domain, used by use cases, contracts
  and repositories.
- The group travels with every snapshot copy and through the existing media
  reference projection, so deletion guard, usage, public media and the media
  dictionary need no special paths.
- A sync classification that keeps existing hashes stable and makes disabling
  SEO explicit.
- A public contract complete enough that CE4B is SDK, Astro and starter work
  only.

**Non-Goals:**

- Resolving fallbacks anywhere in the API or the SDK (CE4B).
- Admin SEO inputs (CE4C).
- Soft-limit warnings; only the hard limits exist in CE4A.
- Validating the content of the title template (`%s`). The template is a
  content value of the defaults global, and the CE4B resolver handles
  templates without `%s`.
- Enabling SEO in the root, reference or starter configuration. That is CE4B,
  together with the template bump; CE4A tests use dedicated fixtures.

## Decisions

### D1. Value type and storage: a sparse JSON object in `seo_json`

Domain adds:

```ts
interface EntrySeo {
  readonly title?: string;
  readonly description?: string;
  readonly image?: MediaId;
  readonly canonical?: string;
  readonly noindex?: true;
}
// SnapshotBase gains: readonly seo?: EntrySeo
```

`content_snapshots.seo_json` holds the canonical JSON of the group or `NULL`;
an all-empty group is never stored.

- `snapshotValue` parses the column.
- Every insert, update and copy site lists the column.
- `cloneSnapshot`, `saveCompleteDraft` (its `CompleteDraftMutation` gains
  `seo?`) and `revertContentDraft` carry it.

*Alternatives:*

- Relational columns (`seo_title`, …). Rejected: five columns copied at every
  site, and later SEO keys would each need a migration.
- Store the group inside `fields_json` under a reserved key. Rejected by the
  owner decision (no key collisions); it would also leak into field validation,
  sync field diffs and the public `fields`.

### D2. Migration `0008`: additive column, no check

`schema.ts` adds `seoJson: text("seo_json")`. `db:generate` produces
`0008_content_snapshot_seo.sql`:

```sql
ALTER TABLE `content_snapshots` ADD `seo_json` text;
```

The migration gets a header comment in the style of `0006` and is listed in
`checkedInMigrations`. There is no `json_valid` check, matching `fields_json`.
The application writes only validated canonical JSON, and a check would make
drizzle-kit propose a table rebuild later.

### D3. Rules in domain, issues as content validation errors

Domain exports:

- `MAX_SEO_TITLE_LENGTH = 200`, `MAX_SEO_DESCRIPTION_LENGTH = 500` and
  `MAX_SEO_CANONICAL_LENGTH = 2048`;
- `normalizeSeoText(value, "title" | "description")`, which returns
  `string | null | undefined` like `normalizeMediaText`;
- `isCanonicalUrl(value)`;
- `normalizeEntrySeo(input: unknown, options: { enabled: boolean }):
  EntrySeo | undefined`.

`normalizeEntrySeo` throws `ContentValidationError` from `@lacecms/content`
with these issues:

| Pointer | Code | Case |
| --- | --- | --- |
| `/seo` | `seo_not_allowed` | non-null input for a model without SEO |
| `/seo` | `invalid_seo` | not an object |
| `/seo/<key>` | `unknown_key` | unknown key |
| `/seo/title`, `/seo/description` | `invalid_seo_text` | a control character or a non-string |
| `/seo/title`, `/seo/description` | `seo_text_too_long` | over the limit |
| `/seo/canonical` | `invalid_canonical_url` | not an allowed URL |
| `/seo/canonical` | `canonical_too_long` | over the limit |
| `/seo/image` | `invalid_seo_image` | not an identifier string |
| `/seo/noindex` | `invalid_noindex` | not a boolean |

`null` is accepted for every value and clears it.

`isCanonicalUrl` accepts a trimmed string of at most 2,048 characters with no
whitespace or control characters. Parsed with the locally declared `URL`
constructor (the same technique contracts use), it must have protocol `http:`
or `https:`, a non-empty host, an empty user name and password, and no `#`.
A query is allowed. The value is stored as submitted after trimming, not
re-serialized, so editors see what they typed.

Contracts define `seoInputSchema` as a strict object of optional nullable
values, with `v.check` predicates from domain. They re-export the limits. The
use case still calls `normalizeEntrySeo`, which also enforces
`seo_not_allowed` because only it knows the model. Server `onError` already
maps `ContentValidationError` to `422 VALIDATION_FAILED` issues.

*Alternative:* put the rules in `@lacecms/content` next to `isSafeUrl`.
Rejected: the roadmap places them in domain, next to the media text rules.
`isSafeUrl` deliberately accepts relative, `mailto:` and `tel:` values, which
a canonical URL must not.

### D4. Use cases

`CompleteDraftInput` gains `seo?: unknown | null`. `validateDraft`:

1. runs `validateEntryAggregate`;
2. runs `normalizeEntrySeo(input.seo ?? null, { enabled: model.seo !== undefined })`;
3. collects media from `$fields` and the blocks, then pushes
   `{sourceKey: "$seo", fieldPath: "image"}` when an image is set;
4. applies the 200-reference cap and the active-media check to the combined
   list, unchanged.

`NormalizedDraft` and therefore the idempotency fingerprint include `seo`.

- `publish` re-validates `entry.draft` with its stored `seo` in publish mode.
- `duplicate` passes the source draft's `seo`.
- `revertDraft` stays a pure repository copy.
- `DraftMediaReference.sourceKey` widens to `"$fields" | "$seo" | BlockKey`.
  Block keys cannot start with `$` (`BLOCK_KEY_PATTERN`), so the sources cannot
  collide.

### D5. Repositories

Node, D1 and the fake persist `seo` on create, save, sync singleton insert
(always `NULL`), publish (the snapshot copy selects `s.seo_json`) and revert
(`revertDraftSnapshotSql` sets `seo_json = p.seo_json`). The reference copies
already move `$seo` rows.

`mediaUsageEntries` maps `source_key = '$seo'` to an SEO location before the
block branch. `MediaUsageLocation` (application) and the contract union gain
`{source: "seo", field: "image", states}`.

The fake's `copyEntry` and `publicView` work unchanged once domain carries
`seo`, because the fake stores domain entries and reference lists.

### D6. Configuration

- **Inputs.** `PageModelInput` and `CollectionModelInput` gain
  `seo?: boolean | { description?: FieldKey; image?: FieldKey }` and
  `removedSeo?: true`. `GlobalModelInput` gains
  `seoDefaults?: { siteName; titleTemplate?; description?; image? }`.
  `defineGlobal` rejects `seo` and `removedSeo`, and `definePage` and
  `defineCollection` reject `seoDefaults`.
- **Normalized form.** `seo?: { description?: string; image?: string }`, where
  presence means enabled, and `seoDefaults?: {…}`. `seo: false` normalizes to
  absent.
- **Validation.** It reuses the `normalizeListFields` style:
  - `SEO_TEXT_FIELD_TYPES = {text, textarea}`;
  - `media` for images;
  - `ConfigurationError` messages name the model, option and field.
- **Uniqueness.** `assertUniqueModels` gains the "at most one `seoDefaults`"
  check in its global branch.
- **Hashes.**
  - `contentModelStructure` replaces `seo` with `true` and drops `seoDefaults`.
  - `modelForHash` keeps both.
  - `publicModel` strips `removedSeo`.
  - `modelForHash` strips it from the hashes like the other hints.
  - Absent options produce no key, so canonical JSON and the hashes of existing
    models are byte-identical. A config test pins a known structural hash to
    prove this.

### D7. Sync classification and the prune write

- **Identity properties.** `MODEL_IDENTITY_PROPERTIES` gains `seo`.
- **Diffs.** `diffContentModelStructures` emits:
  - `seo-enabled`, class `compatible`, when the baseline lacks `seo` and the
    configuration has it;
  - `seo-disabled`, class `destructive`, with `hinted` when the model declares
    `removedSeo`.
- **Hints.** `StructureHints` gains `removedSeo`, read from `current.removedSeo`
  in `classifyMatchedModel`.
- **Evidence.**
  - `SYNC_SNAPSHOTS_SQL` adds `s.seo_json is not null as has_seo`, and
    `SyncSnapshotRow` and the portable scan value carry `hasSeo`.
  - The evidence accumulator gains `seoHolders` (the same `SnapshotHolders`
    shape) when a `seo-disabled` change is pending.
  - `changeNeedsEvidence` already covers destructive changes.
- **Decisions.** `decideEvolution`:
  - with no holders, accepts;
  - with holders and a hint, emits the content write `{action: "remove-seo"}`;
  - otherwise refuses with `SEO_REMOVAL_HAS_DATA` and the message
    `Model posts disables seo while N snapshots hold SEO values (…). Declare removedSeo: true to prune them.`
- **The `remove-seo` write** renders to:

  ```sql
  update content_snapshots set seo_json = null
   where entry_id in (<model entries>) and seo_json is not null;
  delete from content_media_references
   where source_key = '$seo' and snapshot_id in (<model snapshots>);
  ```

  It runs inside the existing guarded mutation on both runtimes, so failure
  injection and the stale-snapshot guard (the snapshot fingerprint and
  evidence) apply unchanged. Revisions, actors and timestamps are untouched,
  as for field removal.
- **Inert cases.**
  - A `removedSeo` hint without a `seo-disabled` change is inert, like a
    removal hint for an absent field.
  - Projection-only `seo` mapping and `seoDefaults` changes take the existing
    `label-update` path, which `configurationSyncAdvancesPublicState` already
    counts.
- **Report.** `renderConfigurationSyncPlanText` and the JSON report list the new change kinds.

### D8. Contracts and server mapping

- **Shared value schema.** `seoValueSchema` is
  `{title, description, image, canonical, noindex}` (nullable strings and a
  boolean). The mapper `toSeoDto(seo?: EntrySeo)` produces it.
- **Admin.** `snapshotFields` gains `seo: v.optional(seoValueSchema)`.
  `toContentSnapshotDto(snapshot, {seo: boolean})` emits it when the model has
  SEO. The admin entry mappers receive the flag from the server, which knows
  the model of every entry it returns.
- **Requests.** `editableDraftFields` gains
  `seo: v.optional(v.nullable(seoInputSchema))`. The server's create and save
  handlers pass `seo` to the use case.
- **Public.**
  - `publicEntrySchema` gains `seo: v.optional(seoValueSchema)`.
  - The `toPublicEntryDto` family takes a `seoModels: ReadonlySet<string>`
    option. The server builds that set once from configuration.
  - `publicGlobalSchema` stays strict without `seo`.
- **Model DTOs.** `contentModelSchema` gains
  `seo: v.optional({description, image})` (page and collection only) and
  `seoDefaults: v.optional({siteName, titleTemplate, description, image})`
  (global only), with checks that reject the wrong kind. `ServerContentModel`,
  `modelDto` and `toContentModelDto` copy both.
- **Export.**
  - `buildExportSchema` gains
    `seo: v.optional(exportSeoSchema, {models: {}, defaults: null})`.
  - `exportSeoSchema` is `{models: record(identifier, {description, image}),
    defaults: nullable({modelKey, siteName, titleTemplate, description, image})}`.
  - `toBuildExportDto(value, urlFor, seo)` takes the configuration section,
    which the server builds from configuration and sorts by model key.
  - The ETag stays the published-state version. Configuration changes that
    alter this section are projection changes, and sync advances the version
    for them.

*Alternatives:*

- Resolve fallbacks in the API and send resolved values. Rejected: it
  contradicts the owner decision that the SDK resolves. It would also freeze
  the fallback policy into the REST contract.
- Send the mapping inside every public entry. Rejected: it repeats model
  configuration per entry, and single reads still lack the defaults global.
- Emit `seo` only when stored. Rejected: consumers could not tell "no values"
  from "SEO disabled", and the roadmap asks for the key on SEO-enabled models.

### D9. Admin round-trip

`EntryPage` adds `...(currentEntry.draft.seo === undefined ? {} : { seo: currentEntry.draft.seo })`
to the save input, and `admin-client` `saveDraft` accepts `seo?`. No form
state changes; CE4C moves `seo` into the form. `issueLocation` leaves `/seo/*`
unmapped, so it reaches the summary.

`usageLocationLabel` handles `source === "seo"` and returns
`SEO image · <states>`. Create sends no `seo`. Duplicate copies on the server.

### D10. SDK pass-through

`PublishedEntry` gains `readonly seo?: PublicSeoDto`. `buildSite` copies
`entry.seo` when present. The SDK ignores the export `seo` section until CE4B
adds `site.seo()`. The contracts schema already validates the section.

## Risks / Trade-offs

- [Older SDKs reject the new export] → the export schema is strict, and CE3C
  and CE5A already require SDK and API to move together in the next alpha.
  `compatibility.md` records the `seo` key, the entry `seo` key and the
  admin usage variant.
- [An admin build older than the API erases SEO on save] → the admin ships
  from the same release as the API. API-set values exist only through direct
  API use until CE4C.
- [Canonical URLs stored as typed may differ in case from their parsed form] →
  output uses them verbatim. CE4C can normalize on input, and CE4B never
  rewrites them.
- [A `$seo` row in an older binary's usage mapping throws] → a binary at
  `0007` cannot reach `seo_json` writes. Rollback means restoring the
  pre-migration backup, as documented.
- [The export query count could grow] → SEO rides on the snapshot rows already
  read, and the configuration section is computed in memory, so D1 budgets
  are unchanged. The budget acceptance runs as verification.

## Migration Plan

1. Deploy the API with migration `0008` (Node: `lace migrate` /
   `migrateNodeDatabase`; Cloudflare: `wrangler d1 migrations apply`). The
   column is additive and needs no backfill.
2. Projects enable `seo` with a model version bump and run `lace content sync`.
   Disabling SEO later needs `removedSeo: true` when values exist.
3. Rollback: restore the pre-migration backup. A `0007` binary ignores the
   column, but it would drop SEO values on save and throw on `$seo` usage
   rows, so running an older binary against a database that holds SEO values
   is unsupported.
