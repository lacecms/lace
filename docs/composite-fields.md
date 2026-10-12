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

No database migration, persisted item envelope or new public JSON format is
introduced by CE7C. Older CE7A/CE7B engines understand the existing composite data,
but remove `itemLabel` from configuration before rolling back to a version that
does not support that metadata. Older scalar-only versions need a matching
backup or an explicit data conversion. Gallery/Navigation definitions and
shipped site/starter adoption are separate CE7D work.
