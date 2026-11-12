---
title: Edit and publish content
description: Create entries, edit fields and blocks, publish drafts, and search collection lists in Admin.
kind: guide
verifiedAgainst: 0.1.0-rc2
---

Admin edits the content that `lace.config.ts` defines: one draft for each page
and global, and any number of entries in each collection. You save drafts as
you work, publish when content is ready, and a site build then shows the
published version. This guide covers the editor from opening an entry to
publishing it, and how to find entries in long collections.

## Before you start

- An account with the editor or administrator role. Viewers can open every
  entry and expand every section but cannot change anything. Only
  administrators publish ([users and roles](accounts/)).
- Synchronized models: open **Content** to see the configured pages,
  collections and site globals. A model missing there has not been
  synchronized yet ([synchronization](../content-modeling/synchronization/)).

The optional **Introduction** tour explains Admin for your role. Start it from
the welcome panel, or replay it from the account menu at any time; it never
blocks your work or discards an unsaved draft. Its progress is remembered in
this browser only.

## Create an entry

Pages and globals already have their draft. In a collection, choose **Create
entry**, enter a title and, for a collection with a route, a slug.

The slug follows the title while **Suggest from title** is on: `Café & News`
becomes `cafe-news`. Editing or clearing the slug turns suggestions off until
you turn them on again. Suggestions keep only ASCII letters, digits and
hyphens, so a title such as `Новости` or one made of emoji gives no suggestion:
type a slug, or leave it empty while drafting. A suggestion does not guarantee
uniqueness; publication reports a route conflict. Changing the slug of a
published entry changes its URL after the next build; [CMS links](../content-modeling/links/)
follow the change, manual links do not.

Entries of a collection without a route have only a title: no slug, path or
SEO card.

## Edit fields

Fields follow the model's order, arranged in sections or tabs when the model
declares them.

- **Required** marks a field needed for publication. You can save an
  incomplete draft; the marker's tooltip says "Required for publication only".
- Text fields show their length. Values longer than a limit stay editable, and
  Save explains the problem instead of cutting the text.
- An invalid value, such as a malformed URL or a number out of range, blocks
  Save. The validation summary lists each problem and moves you to the exact
  field, opening the block, tab or list item that contains it.
- Each URL field can link to a manual URL or a CMS entry
  ([internal links](../content-modeling/links/)).

### Groups and lists

Use **Create** to add an absent group or list, and **Clear** (in the list's
actions menu) to remove it. List items appear as compact rows that start
collapsed; each row shows a summary, and a thumbnail with "No alt" when an
image has no alt text. A row's actions menu offers Move up, Move down,
Duplicate and Remove. To reorder with the keyboard, press Space on the drag
handle, move with the arrow keys, press Space again to drop or Escape to
cancel.

**Add** inserts a new item and opens it. In a list of images, such as a
gallery, **Add** opens the media picker instead: select several images in
order, then confirm with **Add N images**
([media](rich-text-media/#add-several-images-to-a-list)).

The list header shows its count against the maximum. When an entry reaches a
list's maximum or the entry-wide limit of 500 list items, Add and Duplicate are
disabled with an explanation; removing and reordering stay available.

## Conditional fields

Some fields apply only when another field selects them, for example a Video URL
that appears when an item's Type is Video. Changing that field shows and hides
the dependent fields immediately, in each list item separately. Values you
typed in a hidden field are kept: switch back and they reappear. Hidden values
are saved with the draft but never published, and a hidden field is never
required.

If a hidden field holds a value that cannot be saved, such as an invalid URL,
it stays shown with a note naming the field that controls it, so you can fix or
clear it. A publication problem in a field that no longer applies disappears
from the validation summary. Revert to published restores only published
values, so it discards hidden draft values.

## Work with blocks

Blocks are the ordered sections of an entry. Use **Add block** after the list,
or the insert control between two blocks, to choose from the block types the
model allows; the menu can be filtered by name or description.

Each block is a card. Its header shows the block's type, a one-line summary and
its `#anchor`, and stays visible when you collapse the card. The card's actions
menu offers Move up, Move down, Duplicate, Hide block or Show block, and
Remove. After Remove, a notice offers **Undo** until your next block action.
With two or more blocks, **Collapse all blocks** and **Expand all blocks** next
to the Blocks heading change only what is shown; blocks with errors stay
expanded.

An expanded card has two tabs:

- **Content** holds the block's fields.
- **Settings** holds the **Anchor** (lowercase letters, digits and hyphens,
  starting with a letter, unique in the entry), **Hide on site**, the block's
  own settings and **CSS classes**. With a valid anchor, **Copy link** copies
  the entry's URL with `#anchor`.

A hidden block shows a **Hidden** badge. It stays in the draft and in the
published content but is not rendered on the site, and its missing required
values do not block publication. Duplicating a block copies its settings,
classes and hidden state but not its anchor.

## Publish and manage entries

**Save** stores the complete draft as a new revision. **Publish** makes the
saved draft public and requests a site build; with unsaved changes the button
reads **Save and publish** and saves first. Later draft edits do not change
what readers see until you publish again.

The publication card shows the status (draft, published, or published with
later changes), revisions, the last editor, the public path and the state of
the build that covers your publication. When the site URL is configured,
**Open on site** opens the published page.

The **Entry actions** menu offers what your role and the entry allow:

- **Duplicate** (collection entries) creates a copy from the last saved draft
  and opens it.
- **Revert to published** replaces the draft with the published version and
  lists what you would lose.
- **Unpublish** removes the entry from the site after the next build and keeps
  its draft.
- **Delete** (collection entries) is permanent. Deleting a published entry
  requires typing its title.

Unpublish and Delete show every entry that links to this one and may ask you
to confirm that working links will stop navigating
([internal links](../content-modeling/links/#delete-or-unpublish-a-linked-entry)).
Published content has no unlimited history: do not rely on recovering every
earlier publication.

## Resolve conflicts and check builds

If someone saved the entry after you opened it, Save reports a revision
conflict and keeps your unsaved work. Use **Copy my JSON** to keep a copy, then
**Reload server draft** to adopt the other version, and reapply your changes.
Do not overwrite another editor's work blindly.

Open **Builds** for the site build results. During local development, reload
existing routes after publication and restart the site for new or renamed
slugs. An automatic Compose build serves the new release only after it
succeeds; a failed build keeps the previous release. A Cloudflare deploy hook
reported as accepted does not prove that a deployment completed.

## Search, sort and filter collections

A collection list shows each entry's title, slug (for collections with a
route), status, the configured columns, publication date and last edit. Above
it you can:

- **Search** titles and slugs, plus any extra fields the model enables. The
  hint under the box describes what is searched.
- **Filter by status**: draft, published or changed. The totals follow your
  search and field filters.
- **Sort** by title, publication date, last edit or an enabled field. Sortable
  column headers sort too. The list opens in the collection's default order,
  normally the last edit.
- **Filter by fields** with the Filters control or a column's filter button.
  Text and URL fields offer Equals and Contains, numbers Equals and ranges,
  booleans Equals, selects Any of, dates and datetimes ranges, and every field
  Is set or Is not set. Conditions on different fields must all match; several
  selected options match any of them.

Search, status, sort and field filters are part of the page URL, so reload,
Back and shared links restore them. Each active condition can be removed on its
own; **Clear filters** removes search, status and field conditions and keeps
the sort.

Matching ignores ASCII case only: `Е`, `е`, `Ё` and `ё` are different letters,
and no transliteration happens. `%`, `_` and backslash match themselves. Empty
values sort last in either direction; zero and false are values. Date ranges
include both ends; datetimes compare in UTC. Search is limited to 200
characters on Node and to 48 characters (fewer for non-ASCII text) on
Cloudflare; an invalid search or filter stays editable and the list keeps the
last valid results until you fix it.

**Load more** fetches the next page. If it reports that the list changed (for
example, because the entry at the page boundary was saved), the loaded rows
stay visible: choose **Restart list** to reload from the first page with your
search, filters and sort kept.

## Reference

- [Configuration reference](../reference/configuration/): the model options
  behind these controls, such as `listFields`, `listOptions` and `layout`.
- [API reference](../reference/api/): entry, draft and publication endpoints
  for direct requests.
