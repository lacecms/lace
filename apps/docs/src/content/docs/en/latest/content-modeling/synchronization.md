---
title: Synchronize configuration
description: Review and apply changes to lace.config.ts against stored content, including renames, removals and block migrations.
kind: guide
verifiedAgainst: 0.1.0-rc2
---

Editing `lace.config.ts` does not change stored models on startup.
Configuration synchronization compares your configuration with the models and
content an installation holds, shows a plan, and applies it only when you ask.
Database migration changes the database schema; synchronization changes
content models. Neither publishes editorial drafts.

## Before you start

- Run `pnpm db:migrate` first after upgrading Lace packages.
- Back up the database before a change that removes, renames or migrates
  stored data, and try it against a restored copy.
- Deploy configuration and the matching CMS packages together: an older engine
  must never run against content synchronized by a newer configuration.

## Review and apply a plan

For a generated Node project, stop the services that use the SQLite file,
check, apply and restart:

```sh
docker compose stop api dispatcher
pnpm content:sync --check
pnpm content:sync
pnpm dev:api
```

Check mode is read-only. It exits `0` only when nothing needs to change and
nonzero when the plan has pending work or is refused; read the report in both
cases. Add `--json` for a machine-readable report. Repeating an unchanged
configuration is a no-op.

If content changed between planning and applying, the apply step fails with a
stale-plan error and writes nothing: rerun the command to review the current
state.

For Cloudflare, run `pnpm cf:content:sync` for the local simulation while local
development is stopped. For your account, select the remote target and the
private operator file explicitly:

```sh
pnpm exec lace content sync --target cloudflare-remote --operator-env .lace/cloudflare-operator.env --check
pnpm exec lace content sync --target cloudflare-remote --operator-env .lace/cloudflare-operator.env
```

Then deploy the Worker with the same configuration
([Cloudflare deployment](../../deployment/cloudflare/)).

## Know which changes need a version

Increase a model's `version` for every structural change: fields, field
options that affect validation, allowed blocks, `route`, `seo`, conditional
`visibility` rules and URL provider restrictions. A block's data or settings
change needs a block version increase and, when stored blocks exist,
[migrations](#migrate-block-data); every model that allows the block also
increases its own version.

For a model that already holds entries, synchronization decides each change:

| Change                                                                                                                               | Decision                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Added field, relaxed limit, required to optional, new select option, added or changed default, newly allowed block type, SEO enabled | Applied                                                                                                  |
| Reordered select options or allowed blocks                                                                                           | Applied                                                                                                  |
| Tightened limit, removed select option, optional to required                                                                         | Applied only when every stored value conforms                                                            |
| Removed field or allowed block type, SEO disabled                                                                                    | Applied when no entry holds data; otherwise needs a [hint](#rename-or-remove-stored-fields)              |
| Changed definition of an allowed block type                                                                                          | Needs a [block migration](#migrate-block-data) when stored blocks exist                                  |
| Changed field type                                                                                                                   | Refused                                                                                                  |
| Changed page path, or a collection `route` added, changed or removed                                                                 | Refused while entries are published; removing a route also needs entries without slugs or incoming links |

Added or changed defaults are written into stored drafts and published entries
that lack the value; existing values are never overwritten. Media defaults
cannot be backfilled this way.

Changes to labels, descriptions, placeholders, item labels, form layout,
choice-card presentation, `settingsVisibility`, SEO fallback mappings and
`listOptions` need synchronization but no version increase and never rewrite
content.

## Rename or remove stored fields

Synchronization never guesses a rename from a removed and an added field.
Declare it with temporary hints, increase the model version and synchronize:

```ts
defineCollection({
  key: "posts",
  version: 3,
  route: "/blog/:slug",
  blocks: ["richText"],
  fields: {
    title: field.text({ renamedFrom: "headline" }), // moves headline to title
  },
  removedFields: ["legacy"], // deletes stored legacy values
  removedBlocks: ["quote"], // deletes stored quote blocks
});
```

- `renamedFrom` names the field's former key. It works on model fields and
  named children of groups, not in block definitions.
- `removedFields` lists fields whose stored values are deleted. Nested fields
  use schema pointers; `*` stands for every item of a list:

  ```ts
  fields: {
    cards: field.list({
      renamedFrom: "links",
      item: field.group({
        fields: {
          title: field.text({ renamedFrom: "headline" }),
          image: field.media({ renamedFrom: "photo" }),
        },
      }),
    }),
  },
  removedFields: ["/cards/*/legacy"],
  ```

- `removedBlocks` lists block types whose stored blocks are deleted. The type
  must no longer be allowed; it need not be registered.
- `removedSeo: true` deletes stored SEO values after you turn `seo` off
  ([SEO](../seo/#turn-seo-off)).

Configuration rejects contradictory hints, such as a removed field that is still
configured or two fields renamed from the same key. A rename is refused when
both keys already exist, when the former key does not exist, or when stored
content already holds the new key. A renamed field is still compared with its
former definition, so a type change remains refused.

Workflow: add the hint and increase the version, review `--check`, deploy and
run synchronization **immediately** in every environment, then delete the hint
(no version increase needed). An applied hint is inert. Run synchronization
right after deploying: an editor whose draft was opened before synchronization
could otherwise save an empty renamed field over the moved value.

## Migrate block data

Stored block data changes through block versions and declared migrations:

```ts
export const quote = defineBlock({
  type: "quote",
  version: 3,
  label: "Quote",
  fields: { text: field.text({ required: true }), source: field.text() },
  migrations: {
    // Each key is a target version; each function receives the previous
    // version's { data, settings } and returns { data, settings? }.
    2: ({ data: { quote, ...rest } }) => ({ data: { ...rest, text: quote ?? "" } }),
    3: ({ data: { attribution, ...rest } }) => ({
      data: attribution === undefined ? rest : { ...rest, source: attribution },
    }),
  },
});
```

- Migration keys form one contiguous range that ends at the block's `version`;
  a version 1 block declares none. Keep old steps while any environment may
  still hold older blocks.
- Each function is pure and synchronous. It receives a frozen copy of the
  stored `{ data, settings }` and returns plain JSON. Leaving out `settings`
  keeps the input settings; new settings receive their defaults.
- A migration cannot introduce media the entry did not already reference.
- `--check` runs every migration and validates each result against the new
  definition, so failures appear before anything is written.

Workflow: increase the block version, add the migration, update the site
component, increase the version of every model that allows the block, review
`--check`, then deploy and synchronize immediately in every environment. An
editor with the entry open receives a revision conflict after a migrated draft.

If synchronization stops during migrations (for example, because a draft was
saved meanwhile), already migrated entries stay migrated. Rerun the same
command: it migrates only the remaining blocks and then completes.

## Read the report

The report lists each model's planned operation and, for populated models,
every change with its schema path (such as `/cards/*/title`), the number of
affected entries and up to 20 named entries. A refusal names a stable code and
what to do. Common codes:

| Code                                                                                                  | Meaning and fix                                                                                 |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `FIELD_REMOVAL_HAS_DATA`, `BLOCK_TYPE_REMOVAL_HAS_BLOCKS`, `SEO_REMOVAL_HAS_DATA`                     | Stored data would be lost. Restore the definition or declare the removal hint the report names. |
| `FIELD_TYPE_CHANGED`, `FIELD_CHANGE_UNSUPPORTED`                                                      | The change cannot be converted. Add a new field and move values by editing content.             |
| `CONSTRAINT_VIOLATED`                                                                                 | Stored values break a tightened rule. Fix the named entries first.                              |
| `ROUTE_CHANGE_HAS_PUBLISHED`, `ROUTE_REMOVAL_HAS_SLUGS_OR_LINKS`                                      | Unpublish the entries, or clear slugs and incoming links, before changing the route.            |
| `FIELD_RENAME_SOURCE_MISSING`, `FIELD_RENAME_TARGET_EXISTS`, `FIELD_RENAME_TARGET_HAS_DATA`           | Review the rename hint and the named entries.                                                   |
| `BLOCK_DEFINITION_CHANGE_HAS_BLOCKS`                                                                  | Increase the block version and add a migration.                                                 |
| `BLOCK_MIGRATION_MISSING`, `BLOCK_VERSION_AHEAD`, `BLOCK_MIGRATION_FAILED`, `BLOCK_MIGRATION_INVALID` | Fix the migration chain; the report names the entry, block and stored version.                  |
| `MEDIA_DEFAULT_BACKFILL_UNSUPPORTED`, `BACKFILL_EXCEEDS_LIMIT`                                        | The new default cannot be written into stored content.                                          |
| `STRUCTURE_BASELINE_MISSING`                                                                          | Restore the previous definition, synchronize once, then apply the change.                       |
| `SNAPSHOT_EVIDENCE_STALE`                                                                             | Content changed during planning. Rerun.                                                         |

## Understand publication and builds

Synchronization can update published content when a change requires it (a
default backfill, a pruned field, a migrated block or hidden conditional
values). It then advances the published state and requests one site build.
This is separate from an editor publishing a draft.

A `listOptions` change affects only Admin: it updates the model without a site
build once the installation has recorded its public baseline. The first such
synchronization after an upgrade may request one build. Other metadata changes,
such as labels, `listFields` or SEO mappings, are part of the published
projection and request one build, also when combined with `listOptions`.

## Reference

- [Configuration reference](../../reference/configuration/): `renamedFrom`,
  `removedFields`, `removedBlocks`, `removedSeo` and block `migrations`.
- [CLI and environment](../../reference/cli-environment/): `lace content sync`,
  `--check`, `--target`, `--operator-env` and exit codes.
