---
title: Define your content
description: Use typed, version-controlled models for pages, collections, globals and blocks.
---

`lace.config.ts` is the source of content structure. Admin edits values rather than creating model definitions. A page is a singleton at a fixed path; a collection holds entries addressed by a slug route; a global is a singleton with no public route, for shared site settings or navigation.

## A complete starting model

This example defines a Home page at `/`, a collection of articles at
`/articles/<slug>`, and a shared site settings global. Place it in the generated
project's `lace.config.ts` (or adapt its existing definitions):

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

A page is one editable entry at its fixed `path`; a collection contains any
number of entries, each with a slug substituted into `route`. A global is one
shared entry and has no public URL of its own. Publish the settings global for
its values to reach the site. The starter also defines a `navigation` global;
keep it if your site's layout reads it. See [SEO](seo/) for fallback rules.

Register each block definition once in `blocks` and list its type in each
model that permits it. Custom types need their own definition and renderer:
[create a custom block](custom-blocks/). The configuration describes content;
it does not create Astro pages. Add corresponding site route files, including a
`getStaticPaths` route for a collection, and render the relevant published data.

## Change models after deployment

Keys are stable identities: removing one and adding another does not rename it.
For structural changes, increase the affected model's `version`, then review
and apply configuration synchronization in **each** environment. For example,
add a reading-time field to the `articles` definition above and change its
`version: 1` to `version: 2`:

```ts
fields: {
  summary: field.textarea({ description: "Shown on article cards." }),
  author: field.text({ required: true, placeholder: "Author name" }),
  featured: field.boolean({ defaultValue: false }),
  readingTime: field.number({ label: "Reading time (minutes)" }),
},
```

Run `pnpm content:sync --check`, review the plan, and then run
`pnpm content:sync` for a generated Node project with the SQLite services
stopped. Check mode exits nonzero for pending changes as well as errors; read
its report. On Cloudflare select the remote target explicitly and redeploy the
Worker with the updated configuration. Full commands and ordering are in
[synchronization](synchronization/) and [Cloudflare deployment](../deployment/cloudflare/).

To remove a model, remove its definition from `content` and review sync. A
model can be removed only when it has **no entries**. An empty collection can
therefore be removed; a page or global has a singleton created during sync,
even if nobody edited it, and its removal is blocked while that entry exists.
The Admin/API delete operation also rejects page and global singletons, so
there is currently no supported ordinary removal workflow for those models.
Sync does not infer a rename or automatically delete entries. Changes to a
populated model may require explicit hints or migrations; take a backup and
review the plan before applying destructive changes. Deleting a definition also
does not delete the site's Astro route or renderer: update those separately.
See [synchronization](synchronization/) for supported evolution and recovery.

## Fields and author guidance

Field builders include text, textarea, number, boolean, date, datetime, URL, select, media and rich text, plus groups and lists. Prefer a field description for instructions; supported scalar inputs accept `placeholder`. A placeholder is display metadata, never a saved content value. Required fields are required for publication, so otherwise valid incomplete drafts can still be saved. Invalid present values and hard maxima can block Save.

Text counters count JavaScript UTF-16 units without trimming; SEO counters have their own trimmed/code-point rules. Do not truncate content silently to satisfy a UI counter.

See [groups, lists and forms](composites/), [conditional fields](conditional-fields/) and [configuration synchronization](synchronization/).

## Blocks and SEO

A model declares which block types are allowed. Built-in types include hero, rich text, image, quote, CTA, Link, gallery, navigation and video embed. Blocks are ordered; their content schema and settings are versioned separately from the visual component source. Adding a block definition does not install its renderer into the Astro site.

The [SEO system group](seo/) provides metadata such as title/description, social image and indexing settings. Configure site defaults and use per-entry overrides deliberately. Admin shows inheritance; recommended title/description lengths are guidance, while hard validation limits still apply. SEO title/description recommendations are 60/160 characters and hard limits are 200/500. Published SEO reaches the build export and site helpers; saving a draft does not update a public page.

A global can supply shared header/navigation content. Publish it like another singleton; unpublished optional globals should have a deliberate site fallback.

## Provider video URLs

Register `builtInBlocks.videoEmbed` and add `"videoEmbed"` to the selected model's
allowed blocks. Advance existing model versions and run normal configuration sync.
The v2 block has required Video URL and Title, optional Preview image and Caption.
Its Settings contain aspect-ratio cards (`16:9` default, `4:3`, `1:1`, `4:5`,
`9:16`) and playback cards (`player` default, `ambient`). Ambient plays muted,
looping, without controls; reduced motion and no JavaScript fall back to player.
Unknown setting values fail draft save and publication. Version 1 blocks receive
`16:9` and `player` during configuration sync, preserving content and poster usage.
Install registry revision 2 before building; see [Astro integration](../astro-integration/)
for upgrade steps, bandwidth advice and a site-owned stop control example.
Ambient has no built-in pause control and does not meet WCAG 2.2.2 for videos
longer than five seconds.
It supports YouTube watch/share/shorts/embed links and Vimeo video/player links,
including unlisted privacy hashes. Other providers and pasted iframe code fail
validation. Custom URL fields can declare the same restriction:

```ts
field.url({ required: true, embedProviders: ["youtube", "vimeo"] });
```

This restriction is structural. Adding or narrowing it is breaking; removing or
widening it is compatible. Ordinary URL fields keep their existing behavior.

## Collection list queries

Collections can opt into queries over their current drafts. `listFields` selects
visible columns; `listOptions` independently enables sorting, filters and extra
search targets. A hidden field can still be queried.

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
  },
});
```

Each list contains at most 16 distinct top-level field keys. Sort/filter targets
can be text, textarea, number, boolean, select, date, datetime or URL; extra
search targets are text/textarea only. Nested fields, blocks, SEO, rich text and
media are excluded. Pages/globals cannot declare `listOptions`. Empty arrays
normalize away. These capabilities grant the same read controls to all roles;
they do not grant write permissions.

Admin keeps the existing title/slug search, status filter and system sorts. One
field sort is active at a time. Missing, null and empty-string values appear last
in either direction; zero and false are present. String ordering ignores ASCII
case; selects sort by stored value. Dates use calendar dates; datetime ranges
and sorting compare UTC instants.

Search and Contains use literal SQLite LIKE: ASCII case is ignored, while
Cyrillic/non-ASCII case is retained. `Е`, `е`, `Ё` and `ё` are distinct. `%`, `_`
and backslash match themselves. There is no transliteration or Unicode folding.
Node/VPS permits 200 UTF-16 code units. Cloudflare permits 48 code units and at
most 50 UTF-8 bytes **after** escaping and adding the two substring wrappers:
48 ordinary ASCII characters or 24 Cyrillic letters fit; 24 percent signs fit
because each is escaped, but adding one ASCII character produces 51 bytes and
fails. Mixed scripts and emoji must fit both limits. Search trims surrounding
whitespace; Contains retains it. Text Equals retains 200 code units on both
runtimes and uses literal `= COLLATE NOCASE`, without a pattern byte budget.
Admin advertises the active budget and retains invalid editing drafts without
sending them or truncating them.

Different field filters combine with AND; selected category values combine with
OR. Text/textarea/URL support Equals and Contains, booleans support Equals,
numbers support Equals and inclusive ranges, selects support Any of (1–50
configured values), dates/datetimes support inclusive ranges. Every enabled
field supports Is set/Is not set. An optional blank bound is omitted; a range
needs one bound. Date values are `YYYY-MM-DD`; API datetime bounds require an
explicit offset and normalize to UTC. Text operands have a shared 200-code-unit
ceiling, and Contains additionally follows the runtime budget. At most 16
conditions are allowed, one per field, in an 8192-byte JSON filter parameter.

Query settings affect full projection identity, while content structure and
model version remain unchanged. Run database migrations before deploying the
new API/admin, then normal configuration sync. Query-only sync avoids a build
when stored public identity or the legacy hash proves public content unchanged;
unknown legacy baselines conservatively rebuild once. A combined query/SEO
change still rebuilds. See [synchronization](synchronization/).

These controls query drafts in Admin. They do not change published content,
public API/SDK ordering or the order of articles rendered by your site.
