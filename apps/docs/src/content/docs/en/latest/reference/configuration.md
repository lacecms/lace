---
title: Configuration options
description: Every option of defineConfig, definePage, defineCollection, defineGlobal and defineBlock, and every field builder with its options.
kind: reference
verifiedAgainst: 0.1.0-rc2
---

`lace.config.ts` exports the result of `defineConfig`. Import `defineConfig`, `definePage`, `defineCollection` and `defineGlobal` from `@lacecms/config`, and `defineBlock`, `field` and `builtInBlocks` from `@lacecms/content`. Every definition is checked when the configuration loads; an invalid option fails with a message that names the model, block or field. For worked examples see [Define your content](../../content-modeling/).

```ts
export default await defineConfig({ blocks: [/* block definitions */], content: [/* models */] });
```

## defineConfig

| Option    | Required | Purpose                                                                                                                                                            |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `content` | Yes      | The models: results of `definePage`, `defineCollection` and `defineGlobal`. Keys are unique, and page paths must not collide with collection routes.               |
| `blocks`  | No       | The block definitions models may allow: built-in definitions such as `builtInBlocks.hero` and your `defineBlock` results. A model can allow only registered types. |

`defineConfig` is asynchronous; export it with top-level `await`.

## Options of every model

`definePage`, `defineCollection` and `defineGlobal` accept these options.

| Option          | Required | Purpose                                                                                                                                                                                                                            |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`           | Yes      | Stable identity in lowercase kebab case, such as `blog-posts`. Changing it is a rename and needs `renamedFrom`.                                                                                                                    |
| `version`       | Yes      | Positive integer. Increase it for every structural change ([Synchronize configuration](../../content-modeling/synchronization/)).                                                                                                  |
| `label`         | No       | Name shown in Admin.                                                                                                                                                                                                               |
| `description`   | No       | Help text shown in Admin.                                                                                                                                                                                                          |
| `fields`        | No       | The fields, keyed by field key (an ASCII letter followed by letters or digits); each value is a [field builder](#field-builders) result.                                                                                           |
| `blocks`        | No       | Block types the entry's block area allows, unique and registered in `defineConfig`. Omit or leave empty for no block area.                                                                                                         |
| `layout`        | No       | Form layout of the top-level fields: `mode` (`sections` or `tabs`) and `groups`, each with `key`, `label`, optional `description` and the `fields` it shows ([Groups, lists and form layout](../../content-modeling/composites/)). |
| `visibility`    | No       | Conditional-field rules keyed by target field: `{ field, values }` names a sibling `select` or `boolean` controller and the values that show the target ([Conditional fields](../../content-modeling/conditional-fields/)).        |
| `renamedFrom`   | No       | Temporary synchronization hint: the model's former key. Remove it after synchronization has run everywhere.                                                                                                                        |
| `removedFields` | No       | Temporary synchronization hint: former field keys, or schema pointers such as `/cards/*/legacy` for nested fields, whose stored values synchronization deletes. Remove it after synchronization has run everywhere.                |
| `removedBlocks` | No       | Temporary synchronization hint: block types that are no longer allowed and whose stored blocks synchronization deletes. Remove it after synchronization has run everywhere.                                                        |

The temporary hints `renamedFrom`, `removedFields`, `removedBlocks` and `removedSeo` tell [synchronization](../../content-modeling/synchronization/) how to treat stored content; they are not part of the model's structure and change no hash. Configuration rejects contradictory hints, such as a removed field that is still configured.

## Page options

`definePage` creates one editable entry at a fixed path. It also accepts the [options of every model](#options-of-every-model) and rejects `listOptions`.

| Option       | Required | Purpose                                                                                                                                                      |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `path`       | Yes      | Fixed public path, such as `/` or `/about`.                                                                                                                  |
| `seo`        | No       | `true`, or an object of [SEO fallback fields](#seo-fallback-fields), enables the entry's SEO group ([SEO and search indexing](../../content-modeling/seo/)). |
| `removedSeo` | No       | Temporary synchronization hint, `true` only: after `seo` is turned off, synchronization deletes stored SEO values. Not allowed while `seo` is on.            |

## Collection options

`defineCollection` holds any number of entries. It also accepts the [options of every model](#options-of-every-model).

| Option        | Required | Purpose                                                                                                                                                  |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route`       | No       | Canonical route with one `:slug` segment, such as `/articles/:slug`. Omit it for a route-less collection, whose entries have no slug, path or SEO group. |
| `seo`         | No       | As for pages; only a collection with a `route` can enable it.                                                                                            |
| `removedSeo`  | No       | Temporary synchronization hint, as for pages.                                                                                                            |
| `listFields`  | No       | Ordered keys of scalar fields shown as columns in the Admin entry list.                                                                                  |
| `listOptions` | No       | Search, sort and filter options of the Admin entry list (below).                                                                                         |

### listOptions

| Option             | Purpose                                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sortableFields`   | Up to 16 field keys editors can sort by. Supported types: `text`, `textarea`, `number`, `boolean`, `date`, `datetime`, `select` and `url`.                                                                                   |
| `filterableFields` | Up to 16 field keys editors can filter by, of the same types.                                                                                                                                                                |
| `searchableFields` | Up to 16 `text` or `textarea` field keys included in the list search.                                                                                                                                                        |
| `defaultSort`      | The order used when a request names none: a system sort (`updatedAt`, `-updatedAt`, `title`, `-title`, `publishedAt`, `-publishedAt`; default `-updatedAt`) or `field:<key>` / `-field:<key>` for a key in `sortableFields`. |

The same options drive the [collection queries of the admin API](../api/). See [collection list queries](../../content-modeling/#collection-list-queries).

### SEO fallback fields

An object passed as `seo` names fields of the same model that fill SEO values the editor leaves empty.

| Option        | Purpose                                                              |
| ------------- | -------------------------------------------------------------------- |
| `description` | A `text` or `textarea` field used when the SEO description is empty. |
| `image`       | A `media` field used when the SEO image is empty.                    |

## Global options

`defineGlobal` creates one shared entry without a public URL, such as site settings. It accepts the [options of every model](#options-of-every-model) and rejects `path`, `route`, `listFields`, `listOptions`, `seo` and `removedSeo`.

| Option        | Required | Purpose                                                                               |
| ------------- | -------- | ------------------------------------------------------------------------------------- |
| `seoDefaults` | No       | Maps fields of this global to site-wide SEO defaults. At most one global declares it. |

### seoDefaults

| Option          | Required | Purpose                                                                                              |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `siteName`      | Yes      | A `text` or `textarea` field holding the site name.                                                  |
| `titleTemplate` | No       | A `text` or `textarea` field holding the title template; its value contains `%s` for the page title. |
| `description`   | No       | A `text` or `textarea` field used as the default description.                                        |
| `image`         | No       | A `media` field used as the default social image.                                                    |

`seoDefaults` must not name a conditional field.

## Block options

`defineBlock` defines a block type for the `blocks` of `defineConfig` ([Create a custom block](../../content-modeling/custom-blocks/)).

| Option               | Required | Purpose                                                                                                                                                                         |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`               | Yes      | Block type: an ASCII letter followed by letters, digits or hyphens.                                                                                                             |
| `version`            | Yes      | Positive integer. Increase it when the data or settings change; stored blocks then need `migrations`.                                                                           |
| `fields`             | Yes      | The block's data fields, built with `field` builders. Block fields reject `renamedFrom`.                                                                                        |
| `label`              | No       | Name shown in the block picker.                                                                                                                                                 |
| `description`        | No       | Help text shown in Admin.                                                                                                                                                       |
| `defaultValue`       | No       | Initial data of a new block; must conform to `fields`.                                                                                                                          |
| `layout`             | No       | Form layout of the data fields, as for models.                                                                                                                                  |
| `visibility`         | No       | Conditional-field rules over the data fields, as for models.                                                                                                                    |
| `settings`           | No       | Presentational settings: `select`, `boolean`, `number` or `text` fields, each with a `defaultValue`.                                                                            |
| `settingsLayout`     | No       | Form layout of the settings.                                                                                                                                                    |
| `settingsVisibility` | No       | Rules that only hide setting controls: `{ [setting]: { setting, values } }`, where `setting` is a required `select` setting. Hidden settings keep their values.                 |
| `migrations`         | No       | Steps keyed by target version, each a pure function from `{ data, settings }` to `{ data, settings? }`. Keys are contiguous and end at `version`; synchronization applies them. |

## Field options

### Options of every field

| Option         | Purpose                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `label`        | Name shown in the editor.                                                                                                                        |
| `description`  | Help text shown with the field.                                                                                                                  |
| `required`     | `true` makes the field required for publication; defaults to `false`.                                                                            |
| `defaultValue` | Value of new entries; must satisfy the field's constraints. Synchronization writes an added or changed default into entries that lack the value. |
| `renamedFrom`  | Temporary synchronization hint: the field's former key in a model field or a group child. Block fields reject it.                                |

`field.text`, `field.textarea`, `field.richText`, `field.number`, `field.select` and `field.url` also accept `placeholder`, a prompt shown in the empty control.

### Field builders

| Builder          | Stored value                               | Builder-specific options                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field.text`     | Single-line string                         | `minLength`, `maxLength`, `placeholder`                                                                                                                                                                                           |
| `field.textarea` | Multi-line string                          | `minLength`, `maxLength`, `placeholder`                                                                                                                                                                                           |
| `field.richText` | Safe rich-text document                    | `placeholder`                                                                                                                                                                                                                     |
| `field.number`   | Finite number                              | `min`, `max`, `placeholder`                                                                                                                                                                                                       |
| `field.boolean`  | `true` or `false`                          | None                                                                                                                                                                                                                              |
| `field.date`     | Calendar date `YYYY-MM-DD`                 | None                                                                                                                                                                                                                              |
| `field.datetime` | UTC instant such as `2026-11-12T09:30:00Z` | None                                                                                                                                                                                                                              |
| `field.select`   | One of the declared choices                | `options` (required, unique strings), `presentation` (`{ control: "cards", choices }` with a `value`, `label`, optional `description` and `diagram` per choice), `placeholder`                                                    |
| `field.url`      | Safe URL, or `entry:<id>` for a CMS entry  | `embedProviders` (`youtube`, `vimeo`) restricts the field to provider video URLs; `placeholder`. See [Internal links](../../content-modeling/links/).                                                                             |
| `field.media`    | ID of a media library item                 | None                                                                                                                                                                                                                              |
| `field.group`    | Object of named child values               | `fields` (required), `layout`, `visibility`                                                                                                                                                                                       |
| `field.list`     | Ordered array of `item` values             | `item` (required; any builder except `field.list`), `minItems` (default 0), `maxItems` (default and maximum 100), `itemLabel` (an immediate `text`, `textarea`, `select` or `url` child of a group item used as the item summary) |

A field branch nests at most six groups and lists, with at most two directly nested groups; one entry holds at most 500 list items in total. See [Groups, lists and form layout](../../content-modeling/composites/).
