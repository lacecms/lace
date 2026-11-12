---
title: Define your content
description: Define pages, collections, globals, fields and blocks in lace.config.ts and evolve them safely.
kind: guide
verifiedAgainst: 0.1.0-rc2
---

`lace.config.ts` is the source of your content structure. It declares pages,
collections and globals, their fields and the blocks each one allows. Admin
edits values; it never creates or changes model definitions. This guide shows a
complete model, the model kinds, field options and the collection list
settings, and explains how to change a model after it holds content.

## Before you start

- A generated Lace project with `lace.config.ts` at its root and the CMS
  running locally ([Getting started](../getting-started/)).
- Each configuration change reaches stored content only through
  [configuration synchronization](synchronization/). Read that page before
  changing a model that already has entries.

## Define a starting model

A **page** is one editable entry at a fixed `path`. A **collection** holds any
number of entries; with a `route`, each entry's slug fills the route's `:slug`
segment. A **global** is one shared entry without a public URL, used for site
settings or navigation.

This example defines a Home and an About page, a collection of articles at
`/articles/<slug>`, and a site settings global. Place it in the generated
project's `lace.config.ts`, or adapt the existing definitions:

```ts
import { defineConfig, definePage, defineCollection, defineGlobal } from "@lacecms/config";
import { builtInBlocks, field } from "@lacecms/content";

export default await defineConfig({
  blocks: [builtInBlocks.hero, builtInBlocks.richText, builtInBlocks.image],
  content: [
    definePage({
      key: "home",
      version: 1,
      label: "Home",
      path: "/",
      fields: { introduction: field.textarea({ description: "A short introduction." }) },
      blocks: ["hero", "richText", "image"],
      seo: true,
    }),
    definePage({
      key: "about",
      version: 1,
      label: "About",
      path: "/about",
      fields: { contactEmail: field.text({ label: "Contact email" }) },
      blocks: ["richText", "image"],
      seo: true,
    }),
    defineCollection({
      key: "articles",
      version: 1,
      label: "Articles",
      route: "/articles/:slug",
      fields: {
        summary: field.textarea({ description: "Shown on article cards." }),
        author: field.text({ required: true, placeholder: "Author name" }),
        featured: field.boolean({ defaultValue: false }),
      },
      blocks: ["hero", "richText", "image"],
      seo: { description: "summary" },
    }),
    defineGlobal({
      key: "settings",
      version: 1,
      label: "Site settings",
      fields: {
        siteName: field.text({ required: true }),
        description: field.textarea(),
        image: field.media(),
      },
      seoDefaults: { siteName: "siteName", description: "description", image: "image" },
    }),
  ],
});
```

Keys are stable identities, and `version` is the model's structural version.
After synchronization, every page and global has one draft; collections start
empty. Publish the settings global for its values to reach the site. The
starter also defines a `navigation` global; keep it if your site's layout reads
it. See [SEO](seo/) for the fallback rules.

The configuration describes content; it does not create Astro pages. Add the
matching site route files, including a `getStaticPaths` route for each routed
collection, and render the published data
([Astro integration](../astro-integration/)).

## Add a collection without a route

Some content is only listed on another page: CV rows, testimonials, press
mentions. Leave out `route` and the collection has no public URLs:

```ts
defineCollection({
  key: "testimonials",
  version: 1,
  label: "Testimonials",
  fields: {
    quote: field.textarea({ required: true }),
    source: field.text(),
  },
  listFields: ["source"],
}),
```

Entries of a route-less collection have a title but no slug. The editor asks
only for a title, shows no path or SEO card, and publishes without a slug. The
entries never appear in the sitemap and cannot be chosen as
[link destinations](links/); `seo` is not allowed on such a model. `listFields`
and `listOptions` work as for any collection.

Site code reads published entries with `site.records("testimonials")`, newest
publication first. Each record has `id`, `title`, `fields`, `blocks` and
`publishedAt`, plus the `image()` and `link()` helpers of entries; sort by your
own field when order matters.

Adding or removing a `route` later is a structural change that synchronization
refuses while the collection has published entries. Removing a route also
requires that no draft holds a slug and that no other entry links to the
collection's entries.

## Configure fields

The `field` builder provides `text`, `textarea`, `richText`, `number`,
`boolean`, `date`, `datetime`, `select`, `url` and `media`, plus `group` and
`list` for nested values ([groups, lists and form layout](composites/)). Every
builder accepts `label`, `description`, `required` and `defaultValue`.

- **Required fields** are required for publication only. An incomplete draft
  can still be saved; the editor marks the field Required and explains this.
  Invalid present values, such as a number outside its `min`/`max` or text
  longer than `maxLength`, block saving.
- **Placeholders** (`placeholder`) are prompts in empty text, textarea, URL,
  number, select and rich-text controls, including inside groups, lists, block
  data and block settings. A placeholder is never saved as content. Set it to
  `""` to suppress the control's generic prompt. Boolean, date, datetime,
  media, group and list fields reject it: use `description` to explain them.
- **Descriptions** appear under the field and are read by assistive technology.
  Write instructions there rather than in labels.
- **Text counters** show the current length of text and textarea values. They
  count JavaScript UTF-16 units without trimming, so `" 😀 "` counts four. The
  editor never truncates text; Save explains a value that is too long.

```ts
const fields = {
  title: field.text({
    label: "Title",
    required: true,
    placeholder: "A short, descriptive title",
    description: "Shown on the article card.",
    maxLength: 80,
  }),
  amount: field.number({ min: 1, max: 5, placeholder: "1 to 5" }),
  category: field.select({ options: ["news", "guide"], placeholder: "Choose a category" }),
  body: field.richText({ placeholder: "Tell the story…" }),
};
```

Placeholders, labels and descriptions are display metadata: changing them
needs synchronization but no model version increase, and it never rewrites
content.

To ask for some fields only in some cases, use
[conditional fields](conditional-fields/). To link to other entries, use a URL
field ([internal links](links/)).

## Allow blocks

Register each block definition once in the top-level `blocks` array and list
its type in each model that permits it. Built-in definitions are
`builtInBlocks.hero`, `richText`, `image`, `quote`, `cta`, `link`, `gallery`,
`navigation` and `videoEmbed`. A block's content definition and settings are
versioned separately from the visual component installed in your site; adding a
definition does not install its renderer. To add your own type, see
[create a custom block](custom-blocks/).

### Allow provider video URLs

Register `builtInBlocks.videoEmbed` and add `"videoEmbed"` to the model's
allowed blocks. Increase that model's version and synchronize. The block has a
required Video URL and Title and an optional Preview image and Caption. Its
settings choose an aspect ratio (`16:9` default, `4:3`, `1:1`, `4:5`, `9:16`)
and playback (`player` default, or `ambient`, a muted loop without controls;
reduced motion and visitors without JavaScript get the player). Ambient has no
built-in pause control and does not meet WCAG 2.2.2 for videos longer than five
seconds. Install the matching site component before building; see
[Style video embeds](../astro-integration/styling/#style-video-embeds) for
behavior and a stop control.

The block accepts YouTube watch, share, Shorts and embed links and Vimeo video
and player links, including unlisted privacy hashes. Other providers and pasted
iframe code fail validation. Your own URL fields can declare the same
restriction:

```ts
field.url({ required: true, embedProviders: ["youtube", "vimeo"] });
```

The restriction is structural. Adding or narrowing it is a breaking change;
removing or widening it is compatible. Ordinary URL fields keep their behavior.

## Change models after deployment

Keys are stable identities: removing one key and adding another is not a
rename. For structural changes, increase the affected model's `version`, then
review and apply configuration synchronization in **each** environment. For
example, add a reading-time field to the `articles` definition and change its
`version: 1` to `version: 2`:

```ts
fields: {
  summary: field.textarea({ description: "Shown on article cards." }),
  author: field.text({ required: true, placeholder: "Author name" }),
  featured: field.boolean({ defaultValue: false }),
  readingTime: field.number({ label: "Reading time (minutes)" }),
},
```

Run `pnpm content:sync --check`, review the plan, then run `pnpm content:sync`
with the services that use the database stopped. Check mode exits nonzero for
pending changes as well as for errors; read its report. On Cloudflare, select
the target explicitly and redeploy the Worker with the updated configuration.
See [synchronization](synchronization/) for the full workflow, rename and
removal hints, and block migrations.

To remove a model, remove its definition from `content` and review the plan. A
model can be removed only when it has **no entries**. An empty collection can
be removed; a page or global always has its singleton entry, created during
synchronization, so its removal is refused while that entry exists, and Admin
cannot delete page or global entries. Synchronization never infers a rename or
deletes entries for you. Removing a definition also leaves the site's Astro
route and renderer in place: update those separately.

## Collection list queries

A collection can make its Admin entry list searchable, sortable and filterable
by its own fields. `listFields` chooses the visible columns; `listOptions`
independently enables sorting, filters, extra search targets and the order the
list opens in. A field does not need to be a visible column to be queried.

```ts
const articles = defineCollection({
  key: "articles",
  version: 1,
  route: "/articles/:slug",
  fields: {
    summary: field.textarea(),
    year: field.number(),
    featured: field.boolean(),
    category: field.select({ options: ["news", "events"] }),
    date: field.date(),
    updated: field.datetime(),
    source: field.url(),
  },
  listFields: ["year", "category"],
  listOptions: {
    sortableFields: ["year", "summary"],
    filterableFields: ["summary", "year", "featured", "category", "date", "updated", "source"],
    searchableFields: ["summary"],
    defaultSort: "-field:year",
  },
});
```

- Each list names at most 16 distinct top-level field keys.
- Sort and filter targets can be text, textarea, number, boolean, select, date,
  datetime or URL fields. Extra search targets are text or textarea only. The
  title and slug are always searched.
- Nested fields, blocks, SEO, rich text and media cannot be queried. Pages and
  globals cannot declare `listOptions`. Empty arrays are ignored.
- Every role with access to the list gets the same controls; they grant no
  write permission.

### Choose the default order

`defaultSort` chooses the order a list opens in. Write it like the API `sort`
parameter: a system sort (`title`, `-title`, `updatedAt`, `-updatedAt`,
`publishedAt`, `-publishedAt`) or `field:<key>` / `-field:<key>` for a key in
`sortableFields`. A leading `-` sorts descending. `defaultSort` alone is a valid
`listOptions`, for example `{ defaultSort: "title" }`. Without it a list opens
by last edit (`-updatedAt`).

The REST API and the MCP `list_entries` tool apply the default when a request
names no sort. Admin leaves the default out of the page URL and keeps any other
chosen sort there.

### Synchronize query settings

`listFields` and `listOptions` are list metadata: changing them needs ordinary
synchronization but no model version increase and no content rewrite. A
`listOptions` change alone normally requests no site build. Query settings only
query drafts in Admin. They do not change
published content, the public API or SDK order, or the order your site renders
entries in; sort published entries in site code.

Editors use the resulting controls as described in
[search, sort and filter collections](../editing-content/#search-sort-and-filter-collections).
API consumers find the request grammar and limits in the
[API reference](../reference/api/).

## Reference

- [Configuration reference](../reference/configuration/): every option of
  `defineConfig`, `definePage`, `defineCollection`, `defineGlobal` and
  `defineBlock`, list options, field builders and field options.
- [CLI and environment](../reference/cli-environment/): `lace content sync` and
  its targets.
- [API reference](../reference/api/): entry list sort and filter parameters.
