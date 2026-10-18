---
title: Groups, lists and form layout
description: Model nested JSON and organize long editor forms without changing their values.
---

Groups store JSON objects and homogeneous lists store JSON arrays. They work in model and block fields:

```ts
import { field } from "@lacecms/content";
const links = field.list({
  label: "Links",
  itemLabel: "label",
  maxItems: 20,
  item: field.group({
    fields: {
      label: field.text({ required: true }),
      url: field.url({ required: true }),
    },
  }),
});
```

`itemLabel` selects an immediate text-like child of a group item for summaries; it does not create a stored identifier. A list cannot directly contain another list: place nested lists inside group items. Schema limits are six containers, at most two consecutive groups, 100 items per list and 500 total list elements per snapshot, including nested values, defaults and block data. A configured lower maximum wins. Media-reference and JSON-size limits still apply.

Absent containers differ from `{}` and `[]`. Create group applies child defaults; Create list produces an empty array. Clear omits a named value; configured defaults can be reapplied by server normalization. Invalid present values block Save; required descendants and list minima are checked for publication.

## Arrange forms

Models, block data and groups can declare presentation layout:

```ts
const layout = {
  mode: "tabs",
  groups: [
    { key: "copy", label: "Copy", fields: ["excerpt"] },
    { key: "details", label: "Details", fields: ["author"] },
  ],
};
```

Attach this alongside the owner's `fields`. `sections` is the other mode. Groups and field lists must be nonempty, keys unique, and references immediate sibling fields without duplicates or paths. Unlisted fields follow in declaration order. Layout creates no new data objects or paths. System title/slug/SEO and standard block controls keep their established positions. Blocks can organize declared settings with `settingsLayout`.

Placeholders, item summaries and layout are presentation metadata: they need synchronization but do not require a structural model/block version bump or rewrite content. Older engines may reject these options, so upgrade matching packages before adoption and remove unsupported metadata before rolling back.
