---
title: Link to other entries
description: Store links to pages and collection entries that follow slug changes, and render them safely in your site.
kind: guide
verifiedAgainst: 0.1.0-rc2
---

An ordinary URL field can hold either a manual URL or a link to a CMS entry.
A CMS link stores the target's identity instead of its current path, so it
follows later slug changes, and Lace warns before a delete or unpublish would
break it. This guide explains how editors choose destinations, what happens
when a target is unavailable, and how site code turns a stored value into an
`href`.

## Before you start

- A model or block with a URL field (`field.url()`), or the built-in Link,
  Hero, CTA, Image, Gallery or Navigation blocks.
- Site packages of the same release as the CMS and the current installed
  block components ([update installed components](#update-installed-components)).

## Choose a destination in the editor

Every ordinary URL field offers two modes:

- **Manual URL** keeps a typed URL, path or `#anchor`, as before.
- **CMS entry** opens a searchable picker of pages and entries of collections
  with a route. It shows each target's title, model, published path and
  availability.

Choosing an entry stores a token such as `entry:<id>`, never the slug.
Switching modes does not change the value until you type, choose or clear;
in Manual URL mode the selected entry is kept until you enter or clear a URL.
The picker works in model and global fields, groups, lists and block data.
Block settings, rich-text links, video URLs and SEO canonical URLs keep their
own rules and have no picker.

Globals and entries of [route-less collections](../#add-a-collection-without-a-route)
can contain links but cannot be link targets. One entry holds at most 200 CMS
links across its fields and blocks, hidden blocks included.

To write a token in code, for example in an import script, use the helper
instead of concatenating strings:

```ts
import { encodeEntryLink } from "@lacecms/content";

encodeEntryLink("01JC8Z3V6Q0F7K2M9N4P5R8S1T"); // "entry:01JC8Z3V6Q0F7K2M9N4P5R8S1T"
```

[`lace import`](../../editing-content/import/) writes the same tokens from
`{"$entry": "<key>"}` references.

## Publish with unavailable targets

A draft can keep a link to a missing or unpublished entry: the field shows a
warning, keeps the target's ID and offers to replace or clear it. Publishing
requires every visible CMS link to point at a published entry with a route; a
link to the entry being published counts its new route. Links inside hidden
blocks or [hidden conditional fields](../conditional-fields/) do not block
publication.

Manual URLs, paths and anchors are not tracked: changing a slug or deleting a
block anchor does not update them, and Lace does not check that they work.

## Delete or unpublish a linked entry

When you delete or unpublish an entry, the confirmation dialog lists every
entry that links to it, grouped into drafts, published links and links in
hidden content, with their exact fields. When published content would lose a
working link, the dialog adds a checkbox that you must tick before confirming.
If the set of incoming links changes while the dialog is open, Lace reloads it
and asks you to review it again. The impact list never grants permissions:
deleting or unpublishing still needs the usual role.

After the target is gone, the linking content stays unchanged. The next site
build renders those links as unavailable: a Link block, Hero or CTA shows its
label as plain text, Navigation keeps the label without a link, and an image or
gallery item renders without its link. Republishing the **same** entry
restores the links on the following build. A different entry that later takes
the old slug never receives them. Publishing the linking entry again requires
fixing or clearing the unavailable link.

## Render links in your site

Never write a URL field straight into `href`. Resolve it with the published
site, the entry or the global that contains it:

```astro
---
const site = await getSite();
const destination = site.link(entry.fields.relatedPage);
// entry.link(value) and site.global("settings")?.link(value) work the same way.
---
{destination.state === "resolved" ? (
  <a href={destination.href}>Read more</a>
) : destination.state === "unavailable" ? (
  <span>Read more</span>
) : null}
```

| `state`       | Meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `resolved`    | `href` holds a safe URL; `targetId` is set for CMS links.      |
| `unavailable` | A CMS target is not published. Keep the label, render no link. |
| `empty`       | The field has no value.                                        |

Resolution uses only the downloaded build export and makes no network request
per link. Build export format 2 carries an `internalLinks` list on every entry
and global; it requires an SDK of the same release.

`site.linkDiagnostics` reports unavailable links once per build: `total`, the
first 100 `items` (source ID, model key and field location, never content) and
`truncated`. Pass `onLinkDiagnostics` to the site loader to log them.

## Use the Link block

The built-in Link block has a required **Label** and **Destination** and two
settings: **Appearance** (`button`, the default, or `text`) and **Open in new
tab**. A resolved link renders as an anchor in both appearances; a new-tab link
adds `target="_blank"` and `rel="noopener noreferrer"`. An unavailable link
renders its label without button styling. Style it with
`.link[data-lace-appearance]` and the `link` and `label` part hooks.

To offer the block, register `builtInBlocks.link`, add `"link"` to a model's
allowed blocks, increase that model's version and
[synchronize](../synchronization/).

## Update installed components

The installed Hero, CTA, Navigation, Image, Gallery and Link components resolve
links with these helpers. Update the site packages first, then review and
install the components before editors store CMS links:

```bash
pnpm exec lace add block image gallery navigation hero cta link --site site --dry-run
pnpm exec lace add block image gallery navigation hero cta link --site site
```

The command never overwrites files you edited. For edited components, write
proposals next to them and merge by hand:

```bash
pnpm exec lace add block image gallery navigation hero cta link --site site --write-new
```

Merge each `.new` file into your component, keeping your changes. Custom
components and custom REST consumers must resolve links the same way before
rendering URL fields.

## Reference

- [Configuration reference](../../reference/configuration/): `field.url` and
  the built-in blocks.
- [CLI and environment](../../reference/cli-environment/): `lace add block`
  and its flags.
- [API reference](../../reference/api/): link targets, link impact and the
  build export.
