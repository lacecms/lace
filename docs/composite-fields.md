# Groups and lists in configuration and the editor

Groups store ordinary JSON objects; homogeneous lists store ordinary JSON arrays.
Use the same descriptors in model `fields` and block `fields`. Page, collection
and global entries share the recursive editor.

```ts
import { field } from "@lacecms/content";

const links = field.list({
  label: "Links",
  itemLabel: "title",
  maxItems: 20,
  item: field.group({
    fields: {
      title: field.text({ label: "Link title" }),
      url: field.url({ label: "Address", required: true }),
      children: field.list({
        label: "Children",
        item: field.group({
          fields: {
            title: field.text(),
            url: field.url(),
          },
        }),
      }),
    },
  }),
});
```

Model fields use the same builders. A page with a contact group and a team list:

```ts
definePage({
  key: "about",
  version: 2,
  path: "/about",
  fields: {
    contact: field.group({
      label: "Contact",
      fields: { email: field.text(), phone: field.text() },
    }),
    team: field.list({
      label: "Team",
      itemLabel: "name",
      maxItems: 12,
      item: field.group({
        fields: {
          name: field.text({ required: true }),
          photo: field.media(),
          links: field.list({ item: field.url() }),
        },
      }),
    }),
  },
});
```

Site code reads these values from `entry.fields` as plain JSON and resolves nested
media with `entry.image(id, usageAlt?)`.

`itemLabel` optionally names an immediate text, textarea, select or URL child
of a group item. It changes the editor summary only; it does not change stored
values, structural configuration hashes or schema versions. Update it if its
target field is renamed or removed. Nested paths, callbacks and labels on
scalar-item lists are rejected. Without a useful label, summaries use available
text, rich-text plain text, URLs/select values or “Media selected”; they never
show a media identifier or raw rich-text JSON.

Groups and items can be collapsed without changing values or creating unsaved
changes. Their controls stay mounted, preserving rich-text and media editing
state through collapse and reorder. Viewers can expand every disclosure but
cannot edit, choose/upload media or perform list operations.

Use Create to distinguish an absent group/list from a present `{}` or `[]`.
Create group applies child defaults; Create list produces `[]`. Clear omits a
named field from the save payload. If it has a configured default, the server
applies that default again when normalizing the save. Optional absent containers
without defaults stay absent, and their children are not created automatically.
Opening an entry applies applicable defaults as its clean starting baseline.

Add uses a detached item default, or a draft-valid group with child defaults.
A scalar without a valid starting value opens an inline Add/Cancel editor;
for example, a number with `min: 10` must receive a valid number before insertion.
Clearing a committed scalar item keeps its last committed value and blocks Save
until the input is corrected or the item is removed. Arrays never acquire empty
slots, and false, zero and explicit empty containers are retained.

Duplicate inserts an independent deep copy after its source. Move up/down and
pointer/keyboard drag reorder only the current list. Space picks up/drops a drag,
arrow keys move it and Escape cancels. Focus and errors follow the item; Remove
focuses an adjacent item or Add when the list becomes empty. Item identities
exist only in editor state and never appear in saved content or Copy my JSON.

Each list displays its count, maximum and publication minimum. The hard ceiling
is 100 items per list and 500 list elements per snapshot, counting nested lists,
applicable defaults and all block data including hidden blocks. A lower
`maxItems` takes precedence. Exactly 500 is allowed. Add, Duplicate and container
or block growth are disabled with an explanation when their normalized result
would exceed a limit. Removal and ordering remain available. Rich-text document
arrays and the block array do not contribute to this list budget. Existing JSON
size and media-reference limits still apply, with the server authoritative.
Schemas allow at most six containers, two consecutive groups and no direct
list-of-lists; nest a list inside a group item instead.

Missing required descendants and lists below `minItems` are allowed in drafts
and identified as publication requirements. Invalid present values and maxima
block Save. Validation summaries link to exact nested controls and open enclosing
blocks, tabs and disclosures. Required/minimum publication problems in hidden
blocks retain their non-blocking treatment. During pending lifecycle requests,
mutation controls are locked while disclosures remain usable.

Save adopts the normalized response as the clean baseline. Failed requests and
revision conflicts retain local values; Copy my JSON contains complete content,
and Reload server draft explicitly adopts the server version. Discard and revert
reset transient editing identities along with their baseline.

## Shipped examples: Gallery and Navigation (CE7D)

`builtInBlocks.gallery` and `builtInBlocks.navigation` are defined with these
builders only and are edited with the generic controls above:

```ts
gallery: defineBlock({
  type: "gallery",
  version: 1,
  fields: {
    title: field.text(),
    images: field.list({
      defaultValue: [],
      minItems: 1,
      maxItems: 50,
      itemLabel: "caption",
      item: field.group({
        fields: {
          media: field.media({ required: true }),
          alt: field.text(), // overrides the media item's alt text
          caption: field.text(), // overrides the media item's caption
        },
      }),
    }),
  },
}),
navigation: defineBlock({
  type: "navigation",
  version: 1,
  fields: {
    name: field.text(), // the <nav> accessible name
    links: field.list({
      defaultValue: [],
      minItems: 1,
      maxItems: 20,
      itemLabel: "label",
      item: field.group({
        fields: {
          label: field.text({ required: true }),
          url: field.url(),
          children: field.list({
            maxItems: 20,
            itemLabel: "label",
            item: field.group({
              fields: {
                label: field.text({ required: true }),
                url: field.url({ required: true }),
              },
            }),
          }),
        },
      }),
    }),
  },
}),
```

A new block starts with an empty list, so editors can add items immediately;
publication requires at least one. Gallery nests two containers and Navigation
four; a full navigation (20 links with 20 children each) counts 420 of the 500
list elements an entry may hold, and a full gallery 50 of its 200 media
references. Gallery media appear in Media usage and are protected from deletion
like any media field. Gallery and Navigation `alt`/`caption` overrides are
plain fields; the "Uses media alt" hint of the top-level `image` block is not
shown inside list items, so the field descriptions explain the fallback.

The starter and reference site declare a route-less `navigation` global that
allows only the Navigation block; `BaseLayout.astro` renders its published
blocks in the header with `LaceBlocks` and shows static links until it is
published. Saving a draft of the global does not change the site; publishing
it requests a build. The registry components and site CSS are described in
[Styling the public site](site-styling.md#gallery-and-navigation). Evolving
these or your own composites follows
[configuration synchronization](configuration-synchronization.md#ce7b-nested-schema-evolution):
model fields evolve with version bumps and hints, block data with block
versions and migrations.

## Compatibility

No database migration, persisted item envelope or new public JSON format is
introduced by CE7C. Older CE7A/CE7B engines understand the existing composite data,
but remove `itemLabel` from configuration before rolling back to a version that
does not support that metadata. Older scalar-only versions need a matching
backup or an explicit data conversion. CE7D adds no migration either; a
configuration that registers Gallery or Navigation needs the content package of
the same release.

For configurable placeholders, required markers and text counters, see
[field guidance](field-guidance.md).
