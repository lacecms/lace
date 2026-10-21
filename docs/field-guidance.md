# Field metadata and author guidance

Configure empty prompts with `placeholder` on text, textarea, URL, number,
select and rich-text fields. The same syntax works inside groups/lists, on scalar
list items, in block fields, and on supported block settings.

```ts
import { field } from "@lacecms/content";

const fields = {
  title: field.text({
    label: "Title",
    required: true,
    placeholder: "A short, descriptive title",
    description: "Shown on the article card.",
    maxLength: 80,
  }),
  notes: field.textarea({ placeholder: "Notes for readers", minLength: 10 }),
  links: field.list({
    item: field.group({
      fields: {
        label: field.text({ placeholder: "Link label" }),
        url: field.url({ placeholder: "https://example.com" }),
      },
    }),
  }),
  tags: field.list({ item: field.text({ placeholder: "Tag" }) }),
  body: field.richText({ placeholder: "Tell the story…" }),
  category: field.select({ options: ["news", "guide"], placeholder: "Choose a category" }),
  amount: field.number({ min: 1, max: 5, placeholder: "1 to 5" }),
};
```

Omit `placeholder` to keep the control's existing prompt. Set it to `""` to
suppress a generic prompt. Strings are plain text, never HTML or callbacks.
Boolean, date, datetime, media, group and list descriptors reject the option;
use `description` to explain their switch, calendar, picker or container.
An inherited SEO/media prompt takes precedence over a generic configured prompt.
Existing inheritance explanations, site-default annotations and descriptions
remain accessible. Rich-text viewers receive no placeholder.

Required fields display a Required marker and explain “Required for publication
only.” The explanation is the Required marker's tooltip and part of the field's
accessible description; it is shown as text when the field has a problem and
always for viewers. Nothing appears on focus, so the layout never shifts under
the pointer. Otherwise valid incomplete drafts remain savable. Publication still checks
required fields; hidden blocks retain their existing draft-mode exception.
Numeric bounds and supplied text length limits apply during save. A list's
minimum applies during publication and its maximum applies to drafts as well.
An optional absent text value stays valid even if it declares a minimum length.
Guidance does not create absent containers, apply defaults or change content.

Text and textarea show their current count, right-aligned in the label row,
even without configured bounds. Their
validators count raw JavaScript UTF-16 units without trimming: `" 😀 "` counts
four, and `"e\u0301"` counts two. Input remains editable past a maximum; Save
explains violations rather than silently truncating text. SEO title/description
instead count Unicode code points after trimming (`" 😀 "` counts one). Their
60/160 recommendations are advisory; their separate hard limits remain 200/500.
Counters and advisory warnings are associated descriptions, with no live
announcement on every keystroke. Viewers can read the same counts and constraints.

Placeholders are display metadata: adding, changing or removing one does not
change structural model/config hashes, require a model-version bump, rewrite
snapshots or migrate content. The projection hash changes, so run normal content
sync to deliver the new metadata. Content/default keys literally named
`placeholder` remain part of structural identity. Save, publish and public JSON
contain authored values, never guidance metadata injected into content.

Upgrade engine, contracts and admin together before adopting this option; older
engines reject it as unknown configuration. No database migration is needed.
For rollback, remove placeholder options before running an older engine. Saved
content is unaffected. See [composite fields](composite-fields.md) and
[rich-text authoring](rich-text-authoring.md).
