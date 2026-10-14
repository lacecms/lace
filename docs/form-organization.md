# Form organization and slug suggestions

Use presentation metadata to split long forms into visual sections or tabs.
It does not create objects or change content paths. Put `layout` on a page,
collection, global, block definition (its data), or `field.group`, including a
list's group item. Blocks also accept `settingsLayout` for declared settings.

```ts
import { defineCollection } from "@lacecms/config";
import { field } from "@lacecms/content";

const posts = defineCollection({
  key: "posts",
  version: 1,
  route: "/blog/:slug",
  fields: {
    author: field.text(),
    excerpt: field.textarea(),
    links: field.list({
      item: field.group({
        fields: { label: field.text(), url: field.url() },
        layout: {
          mode: "tabs",
          groups: [
            { key: "copy", label: "Copy", fields: ["label"] },
            { key: "target", label: "Target", fields: ["url"] },
          ],
        },
      }),
    }),
  },
  layout: {
    mode: "sections",
    groups: [
      { key: "content", label: "Content", description: "Shown in the article list.", fields: ["excerpt"] },
      { key: "details", label: "Details", fields: ["author", "links"] },
    ],
  },
});
```

Each layout has `mode: "sections" | "tabs"` and a nonempty `groups` array.
Each group has a unique field-style `key`, a nonblank `label`, optional string
`description` and a nonempty ordered `fields` array. Field references name
immediate siblings only; paths and duplicate placement are rejected. Unknown
options and unknown fields fail before startup. System title/slug/SEO and block
anchor/visibility/CSS controls cannot be arranged by layout. A user field named
`title` remains a normal field; references always resolve against the owner's
own field map. Scalar/list descriptors do not accept layout; a list's group
item does. The existing CE7 nesting limits still apply.

Groups and fields follow declared layout order. Unlisted fields follow in
field declaration order outside the tab set/sections. Without layout, forms
retain their previous declaration order. Sections create no JSON objects.
Tabs retain rich text, media, list identity and errors while hidden. Arrow keys,
Home and End select tabs; validation-summary links reveal all containing tabs
and disclosures before focusing the exact field. Viewers can inspect these
controls without editing values. Existing SEO and block Content/Settings tabs
retain their behavior; `settingsLayout` arranges only declared settings inside
Settings.

Adding, editing or removing layout needs no model/block version increase,
content rewrite or database migration. It changes projection identity only.
Configuration synchronization follows the existing public-metadata rule:
published-state version advances once and one build request is created or
coalesced atomically. Draft/published values, revisions and media references
stay unchanged. Repeat synchronization is a no-op.

## Collection slugs

The Create entry dialog suggests a slug as you type a title. Any manual edit,
including clearing Slug, disables suggestions until you enable Suggest from
title again. Suggestions use NFKD decomposition, lowercase ASCII letters and
digits, and collapse whitespace, underscores and hyphens to single hyphens.
They trim boundary hyphens and truncate at the existing 100-character limit,
removing a resulting trailing hyphen. `Café & News` becomes `cafe-news`.
`Новости`, an empty title or emoji-only input yields no suggestion: enter a
slug manually, or keep it empty while drafting. Scripts are not transliterated.

A nonempty slug is saved with creation, and the editor opens clean. Later title
edits and reloads preserve that persisted slug. Existing and duplicated entries
never automatically enter suggestion mode; the editor retains its explicit
Suggest from title control. Server validation and publication route-conflict
feedback remain authoritative: suggestions promise no uniqueness and do not
append suffixes. Failed creation retains title, slug and suggestion mode;
closing the dialog resets them.
