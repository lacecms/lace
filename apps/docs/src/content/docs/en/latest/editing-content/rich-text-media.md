---
title: Rich text and media
description: Write rich text, upload, describe and tag media, build galleries and embed videos.
kind: guide
verifiedAgainst: 0.1.0-rc2
---

Rich-text fields store a validated document, not arbitrary HTML, and media
lives in a shared library that every entry reuses. This guide covers writing
and linking text, uploading and describing images, organizing the library with
tags, building galleries of images and videos, and embedding provider videos.

## Before you start

- An account with the editor or administrator role. Viewers can inspect
  content and media but receive no authoring controls.
- The site renders rich text, images, galleries and videos with installed
  components and your stylesheet ([Astro integration](../../astro-integration/)).
  Editors control content; the site controls presentation.

## Write rich text

Every rich-text field, including those inside groups, lists and blocks, has the
same toolbar:

- **Text style** switches between Paragraph and Heading 1–4.
- **Bold**, **Italic**, **Strike** and inline **Code**.
- Bulleted and numbered lists, **Quote**, **Code block** and **Insert
  horizontal rule**.
- **Link**.

Selecting text also shows a small bubble menu with Bold, Italic, Strike, Code
and Link; Escape dismisses it. A code block holds plain text: spaces, tabs and
line breaks are kept, and there is no language selection, highlighting or
formatting inside it. Toggle Code block again to return to a paragraph. To
remove a horizontal rule, select it and delete it. Undo and redo cover every
change.

Keyboard shortcuts:

| Action            | Shortcut                                      |
| ----------------- | --------------------------------------------- |
| Focus the toolbar | Alt+F10, then arrows/Home/End; Escape returns |
| Paragraph         | Cmd/Ctrl+Alt+0                                |
| Heading 1–4       | Cmd/Ctrl+Alt+1 to 4                           |
| Code block        | Cmd/Ctrl+Alt+C                                |
| Link              | Cmd/Ctrl+K                                    |

Hover over or focus a toolbar action to read its shortcut.

**Link** asks for a URL and has two independent switches, **Open in a new
tab** and **nofollow**, both off for a new link. Applying links the selection,
updates the whole link under the cursor, or inserts the URL as linked text when
nothing is selected. **Remove link** removes only the link. An unsafe URL shows
an error and changes nothing. Rich-text links are typed URLs; to link to
another entry so the link follows its slug, use a URL field with
[CMS entry](../../content-modeling/links/).

Pasted content is converted to the supported structure. Formatting, tables and
HTML the editor does not support are dropped, so expect to tidy text pasted
from Word or Google Docs.

## Upload and describe media

Open **Media** to browse the library in a grid or list, search by filename,
filter by type and tag, and sort. These choices are part of the page URL.

Upload JPEG, PNG, GIF, WebP or AVIF images of up to **10 MiB** each. Lace
checks the actual file content; renaming a file does not change its format.
SVG and video files are not supported: use a [video embed](#embed-a-video) or
a gallery video item for videos. GIF originals, including animated ones, stay
unchanged; the site can build optimized variants from them.

Select an item to open its details. The panel shows the file, its usage by
entry and field, and a copyable public URL that works once published content
uses the item. Writers edit:

- **Alt text** (up to 1,000 characters). Write it for every informative image;
  blocks and gallery items can override it for one use.
- **Caption** (up to 2,000 characters), used where a block's own caption is
  empty.
- **Focal point**: click or drag on the preview, or focus the marker and use
  the arrow keys (Shift for larger steps). Sites use it to crop around the
  subject. Reset returns to the centre.
- **Tags** (see below).

Save and Discard apply to all four together. Metadata changes of an image used
in published content reach the site with the next build. If someone else saved
the item meanwhile, you can reload their version or save yours anyway.

An image block with an empty Alt text field shows "Uses media alt:" followed by
the library text, and warns when neither has alt text; such an image is
presented as decorative.

## Tag media

Tags group images by project, page or topic. A tag uses ASCII letters, digits
and hyphens, 1 to 40 characters; an item has at most 20 tags. Typed tags are
trimmed and lowercased, so `Cover-Shot` becomes `cover-shot`. Spaces inside
a tag, other punctuation and non-Latin letters are not allowed, and nothing is
transliterated.

Every tag field shows the chosen tags as removable chips and suggests existing
tags, with their item counts, as you type:

- Arrow keys move through the suggestions; Enter adds the highlighted
  suggestion or the typed text; a comma adds the typed text.
- Backspace in an empty input removes the last chip; Escape closes the
  suggestions.
- Text that is not a valid tag stays in the input with an explanation.

To tag an item, open its details, add or remove tags and choose **Save**. A
tags-only change never requests a site build; tags are not published.

To filter, add up to five tags to the **Filter by tag** field of the library
toolbar. Items must have all of them. The filter is part of the URL, so a
shared link shows the same selection, and **Clear filters** removes it with the
search and type filter. While a tag filter is active, files you upload receive
those tags, and the upload area says so.

## Pick media

**Choose media** on an image field opens the media picker: the library with the
same search, type, tag filter and upload area, local to the dialog. Its filters
reset each time it opens.

### Add several images to a list

**Add** on a gallery or another list of images opens the picker in multiple
mode:

1. Filter the library, for example by a project's tag.
2. Activate images in the order they should appear; each shows its position.
   The selection is kept while you change filters or load more.
3. Upload new files if needed; confirmed uploads are selected automatically.
4. Choose **Add N images**.

Each image becomes one item at the end of the list. Images already in the list
are marked, for example "Already in Images", and can be added again. The picker
stops at the list's remaining capacity and says which limit it reached.

## Remove media

An item that content still uses cannot be deleted. Inspect its usage, remove
it from drafts and published content, publish those changes, then delete it.
Detaching it from a draft alone does not detach published uses. Retry a failed
upload or deletion from its message in Admin; do not delete files in storage
behind the CMS.

## Build a gallery

A Gallery holds an optional title and a list of up to 50 **images and
videos**. Each item has a **Type**: Image or Video. **Add** opens the media
picker so you can add several images at once; **Add Video** adds one video
item.

- An **image** item uses its image, optional **Alt text** (empty uses the
  media alt text), optional **Link** and **Size**: **Fill** (the site's usual
  crop, the default) or **Natural** (the image's own width and proportions,
  never wider than its cell).
- A **video** item takes a YouTube or Vimeo **Video URL**, a **Video title**
  read by assistive technology, **Playback** (Ambient, the default, a muted
  loop without controls, or Player) and an **Aspect ratio**.
- Both kinds take a **Caption**. Only an empty image caption falls back to the
  media item's caption.
- Every item has a **Placement** for grid galleries: **Auto**, **Full row**,
  **First column** or **Last column**. Flex arrangements ignore it.

Switching an item's Type keeps what you typed for the other kind, but only the
fields of the selected Type are published. Collapsed video rows show the title
and provider.

The gallery's Settings tab has a **Layout** section, **Arrangement**
(Horizontal, Vertical or Grid) with **Wrap items** for the flex arrangements or
**Grid preset** for grid, and a **Behavior** section with **Open full screen**.
The installed gallery component and your site's CSS decide the final look.

## Open images full screen or link them

Image and Gallery blocks have an **Open full screen** setting, off by default,
which opens the full-size original when a visitor selects the image. An image
block or a gallery image can also have a **Link**: a linked image opens its link
in the same tab instead, and unlinked gallery images can still open full
screen. Video items have neither.

## Embed a video

Choose **Video embed** when your model offers it. Paste a YouTube or Vimeo video
URL and enter a **Title** that names the video for assistive technology. A
**Caption** and a **Preview image** from the library are optional, and you can
clear the preview without removing the video. Its settings choose the aspect
ratio and playback (**Player**, the default, or **Ambient**). An incomplete
block can be saved as a draft; required fields must be filled before
publication. An unsupported URL blocks saving.

Examples: `https://youtu.be/dQw4w9WgXcQ`, `https://vimeo.com/76979871`, or an
unlisted Vimeo link such as `https://vimeo.com/76979871/abc123def`. Keep the
real privacy hash supplied by the owner. Lace does not check that a video
exists or allows embedding; the owner must allow your site in the provider's
privacy settings.

With a preview image, the site loads the player only when the visitor
activates **Load video**. The player does not autoplay, so pressing its Play
control can take a second action. Without a preview the site shows a lazily
loaded player. A link to the video remains available when JavaScript or
embedded playback is unavailable. The editor never loads third-party players
or downloads provider thumbnails.

## Reference

- [Configuration reference](../../reference/configuration/): rich-text and
  media fields and the built-in Image, Gallery and Video embed blocks.
- [API reference](../../reference/api/): media upload, metadata, tag and tag
  catalog endpoints.
