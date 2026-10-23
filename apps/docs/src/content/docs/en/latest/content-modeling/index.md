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
