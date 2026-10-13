# Rich-text authoring

Every rich-text field uses the same controls, including fields inside groups,
lists and blocks. Paragraph and Heading 1–4 are in Text style. The fixed
formatting toolbar offers Bold, Italic, Strike, inline Code, lists, Quote,
Code block, Insert horizontal rule and Link. Code blocks contain plain text:
spaces, tabs and line breaks are preserved; language selection, highlighting,
marks and links inside code are unavailable. Toggle Code block again to return
to a paragraph. Select a rule and delete it to remove it. Undo/redo covers these
changes.

Select ordinary text for the compact Bold/Italic/Strike/Code/Link bubble menu.
It supplements the fixed toolbar and does not move focus when it appears.
Escape dismisses it and returns focus to the text. Viewers can inspect content
but receive no authoring controls. Disclosures and block tabs remain usable.

For keyboard authoring, use Alt+F10 to focus the fixed toolbar, arrows/Home/End
to move between actions, and Escape to return to the document. The style
shortcuts are Cmd/Ctrl+Alt+0 for Paragraph and Cmd/Ctrl+Alt+1–4 for headings.
Cmd/Ctrl+Alt+C toggles Code block. Cmd/Ctrl+K opens Link. Hover or focus an
action to read its shortcut. Existing formatting and undo/redo shortcuts remain.

Link offers a URL and independent **Open in a new tab** and **nofollow**
switches. Both start unchecked for a new link and reflect an existing link when
reopened. Applying links the selection, updates the whole link under the cursor,
or inserts the URL as linked text if nothing is selected. Remove link removes
only the link mark. Moving focus into the input or switches keeps the selected
text. An unsafe URL shows an error without changing the document; Escape closes
without applying changes. Ordinary URL fields remain strings.

Save draft retains the full document, including empty code blocks. Publication
is separate and requires permission. Subsequent draft edits leave published
output unchanged until another publication. Reordering list items, collapsing
fields or switching block tabs retains the editor's state. A failed save or
revision conflict keeps local content available for explicit recovery.

Ordinary paste uses the safe editor subset. Unsupported HTML/styles and unsafe
links are not stored. Dedicated Word/Google Docs cleanup is not part of CE8B.

## Reference and generated starter examples

The reference fixture in `apps/site/src/fixtures/published-export.json` includes
H4, a rule, whitespace-sensitive code and all four link choices. To try this in
a generated starter, add a Rich text block in Admin, write an H4, insert a rule,
create a plain Code block and use Link to set the two switches independently.
Save, reload and publish, then inspect the built page. Both sites' installed
RichTextBlock sources already delegate to the common component:

```astro
---
import RichText from "@lacecms/astro/RichText.astro";
---
<RichText document={data.content} />
```

Do not replace it with raw HTML or copy a separate node allowlist. The common
renderer emits `h4`, `hr` and escaped `pre`/`code` text. Links without options
have only href; a new-tab link adds target `_blank` and derived
`noopener noreferrer`; nofollow is independent and merges into rel when checked.
Style those elements through their rich-text wrapper; see
[site styling](site-styling.md).

Upgrade engine/admin and site content/render/Astro packages together before
using the expanded format. Existing documents need no migration or rewrite,
and common-renderer block sources need no replacement. For a custom renderer,
implement the same grammar and forward validated target/rel attributes. An older
engine may reject new documents; rollback requires compatible backup or an
explicit validated conversion. See [compatibility](compatibility.md#ce8a-shared-rich-text-format).
