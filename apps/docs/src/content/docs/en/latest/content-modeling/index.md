---
title: Define your content
description: Use typed, version-controlled models for pages, collections, globals and blocks.
---

`lace.config.ts` is the source of content structure. Admin edits values rather than creating model definitions. A page is a singleton at a fixed path; a collection holds entries addressed by a slug route; a global is a singleton with no public route, for shared site settings or navigation.

```ts
import { defineCollection } from "@lacecms/config";
import { field } from "@lacecms/content";

const posts = defineCollection({
  key: "posts",
  version: 1,
  route: "/blog/:slug",
  fields: {
    excerpt: field.textarea({ description: "Shown on article cards." }),
    author: field.text({ required: true, placeholder: "Author name" }),
  },
});
```

Register definitions in the generated configuration, preserving its existing exports and block registry. Keys identify models; changing a key is not automatically interpreted as a rename. Model versions track structural evolution. Model routes do not generate Astro route files: add the corresponding rendering route in your site.

## Fields and author guidance

Field builders include text, textarea, number, boolean, date, datetime, URL, select, media and rich text, plus groups and lists. Prefer a field description for instructions; supported scalar inputs accept `placeholder`. A placeholder is display metadata, never a saved content value. Required fields are required for publication, so otherwise valid incomplete drafts can still be saved. Invalid present values and hard maxima can block Save.

Text counters count JavaScript UTF-16 units without trimming; SEO counters have their own trimmed/code-point rules. Do not truncate content silently to satisfy a UI counter.

See [groups, lists and forms](composites/) and [configuration synchronization](synchronization/).

## Blocks and SEO

A model declares which block types are allowed. Built-in types include hero, rich text, image, quote, CTA, gallery, navigation and video embed. Blocks are ordered; their content schema and settings are versioned separately from the visual component source. Adding a block definition does not install its renderer into the Astro site.

The SEO system group provides metadata such as title/description, social image and indexing settings. Configure site defaults and use per-entry overrides deliberately. Admin shows inheritance; recommended title/description lengths are guidance, while hard validation limits still apply. SEO title/description recommendations are 60/160 characters and hard limits are 200/500. Published SEO reaches the build export and site helpers; saving a draft does not update a public page.

A global can supply shared header/navigation content. Publish it like another singleton; unpublished optional globals should have a deliberate site fallback.

## Provider video URLs

Register `builtInBlocks.videoEmbed` and add `"videoEmbed"` to the selected model's
allowed blocks. Advance existing model versions and run normal configuration sync.
The block has required Video URL and Title, optional Preview image and Caption.
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
