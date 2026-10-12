## ADDED Requirements

### Requirement: The editor edits the SEO group of SEO-enabled entries
The editor of a page or collection entry whose model enables SEO SHALL show an
*SEO* card in the right-hand column after the *Fields* card. The card SHALL
hold, in this order, an "SEO title" input, an "SEO description" text area, an
"SEO image" media control using the existing media picker, a "Canonical URL"
input, a "Hide from search engines" switch and a search-result preview. The
editor of a model without SEO, including every global, SHALL show no SEO card.

The SEO values SHALL be part of the draft form: changing one SHALL mark the
draft unsaved, and loading, saving, publishing, discarding unsaved changes,
reverting to published and adopting a reloaded server draft SHALL reset them
to the loaded values. "Copy my JSON" SHALL include them. For an SEO-enabled
model, every draft save SHALL carry a complete `seo` object with `title`,
`description`, `image`, `canonical` and `noindex`, where blank or
whitespace-only text and a removed image are sent as `null` and `noindex` is a
boolean. A save of an entry whose model has no SEO SHALL carry no `seo` key.
Viewers SHALL see the SEO values and the preview read-only, with the SEO image
shown without picker actions.

#### Scenario: Edit and save SEO values
- **WHEN** an editor opens the post "Hello" of an SEO-enabled collection, types
  "Hello from Lace" as the SEO title, checks "Hide from search engines" and
  saves
- **THEN** the draft is marked unsaved before the save, and the save request
  carries `seo` `{title: "Hello from Lace", description: null, image: null,
  canonical: null, noindex: true}`

#### Scenario: Clearing a stored value
- **WHEN** an editor clears the stored SEO description "Old text" and saves
- **THEN** the save request carries `seo.description` `null` and the reloaded
  draft has no SEO description

#### Scenario: Choose an SEO image
- **WHEN** an editor chooses an image through the SEO image control and saves
- **THEN** the card shows the selected image with its filename and alt text,
  and the save request carries its media ID as `seo.image`

#### Scenario: Revert restores SEO values
- **WHEN** an editor changes the SEO title of a published entry and reverts to
  the published version
- **THEN** the SEO title input shows the published SEO title again and the
  draft is not marked unsaved

#### Scenario: Model without SEO
- **WHEN** an editor opens and saves an entry of a model without SEO
- **THEN** no SEO card is shown and the save request has no `seo` key

#### Scenario: A viewer opens an SEO-enabled entry
- **WHEN** a `viewer` opens an entry with a stored SEO title and image
- **THEN** the SEO card shows the title, the image without Choose media,
  Replace or Remove, and the preview, and none of its controls accept edits

### Requirement: SEO text shows its length against recommendations
The SEO title and SEO description SHALL each show a visible character count of
the trimmed text in code points against a recommended length of 60 for the
title and 160 for the description, as part of the control's accessible
description. When the count exceeds the recommended length, a warning
associated with the control SHALL say that search results may shorten the
text. The warning SHALL NOT block saving or publishing and SHALL disappear
when the count is back within the recommendation. Neither the count nor the
warning SHALL be announced on every keystroke.

#### Scenario: Title within the recommendation
- **WHEN** an editor types a 45-character SEO title
- **THEN** the title shows "45 / 60" and no length warning

#### Scenario: Long description warns without blocking
- **WHEN** an editor types a 180-character SEO description and saves
- **THEN** the description shows "180 / 160" with a warning that search results
  may shorten it, and the save request is sent

#### Scenario: Shortening removes the warning
- **WHEN** an editor shortens a 70-character SEO title to 58 characters
- **THEN** the length warning disappears

### Requirement: SEO validation problems are shown on the SEO controls
The editor SHALL validate SEO values locally before saving, with the same
rules as the API: SEO title at most 200 and SEO description at most 500 code
points after trimming, both single-line plain text, and a non-blank canonical
URL that is an absolute `http` or `https` URL without credentials or fragment
of at most 2,048 characters. A violation SHALL block the save and SHALL be
shown on its control as a sentence that does not repeat the value. Server
issues whose paths are `/seo/title`, `/seo/description`, `/seo/image`,
`/seo/canonical` or `/seo/noindex` SHALL be shown on the matching control.
SEO problems SHALL appear in the validation summary after the model fields,
in card order, and activating one SHALL move focus to its control. A server
issue at `/seo` itself SHALL be listed in the summary as text.

#### Scenario: Relative canonical URL
- **WHEN** an editor enters `/posts/hello` as the canonical URL and saves
- **THEN** no save request is sent, the canonical URL control says to enter an
  absolute URL starting with `https://` or `http://`, and the summary links
  "Canonical URL" to it

#### Scenario: Line break in the description
- **WHEN** an editor enters a description containing a line break and saves
- **THEN** no save request is sent and the description control says to use a
  single line

#### Scenario: Server rejects the SEO image
- **WHEN** a save is rejected with an issue at `/seo/image`
- **THEN** the SEO image control shows the problem and the summary links
  "SEO image" to it

#### Scenario: SEO no longer enabled on the server
- **WHEN** a save is rejected with `seo_not_allowed` at `/seo`
- **THEN** the summary lists the problem as text without a link

### Requirement: Inherited SEO values are shown as placeholders
While an SEO value is empty, its control SHALL show what the site will use
instead, following the fallback chain of ADR 0011, and SHALL expose the same
text as part of its accessible description:
- SEO title: "Uses entry title: " followed by the current entry title formatted
  with the site title template, or "Uses entry title" while the entry title is
  empty.
- SEO description: "Uses {field label}: " followed by the text of the model's
  mapped description field when it has text, otherwise "Uses site
  description: " followed by the site default description when it has text;
  otherwise no placeholder.
- SEO image: a line "Uses the image from {field label}" when the model's
  mapped image field holds media, otherwise "Uses the site image" when the
  site default image is set, otherwise "No image is shared".
- Canonical URL: "Uses this page's URL: " followed by the page's absolute URL
  when the build site URL is configured and the entry has a path, otherwise
  "Uses this page's URL".

Inherited values SHALL reflect unsaved form values of the entry, and SHALL
read site defaults from the published entry of the global that declares
`seoDefaults`. When no global declares `seoDefaults`, it is not published, or
it cannot be read, the editor SHALL behave as if there were no site defaults
and SHALL NOT block editing. A stored SEO value SHALL replace its placeholder.

#### Scenario: Title from the entry title and template
- **WHEN** the published defaults global has site name "Lace" and no title
  template, and an editor opens the post "Hello" with no SEO title
- **THEN** the SEO title placeholder reads "Uses entry title: Hello | Lace"

#### Scenario: Description from the mapped field
- **WHEN** the model maps its description to the field "Excerpt" holding
  "A short intro" and the SEO description is empty
- **THEN** the SEO description placeholder reads "Uses Excerpt: A short intro"

#### Scenario: Description from the site default
- **WHEN** the mapped description field is empty and the published site
  default description is "Notes on Lace"
- **THEN** the SEO description placeholder reads "Uses site description:
  Notes on Lace"

#### Scenario: Unsaved edits update the placeholder
- **WHEN** an editor types "New intro" into the mapped Excerpt field without
  saving
- **THEN** the SEO description placeholder reads "Uses Excerpt: New intro"

#### Scenario: Defaults global not published
- **WHEN** the global declaring `seoDefaults` has only a draft and the post
  "Hello" has no SEO title
- **THEN** the SEO title placeholder reads "Uses entry title: Hello"

### Requirement: The SEO card previews the search result
The SEO card SHALL show a search-result preview labelled as such, computed from
the current form values and the published site defaults with the same rules
as the site's SEO resolver: the title is the SEO title, otherwise the entry
title formatted with the title template (a template applies only when it
contains `%s`; otherwise `{title} | {site name}`, or the bare title without a
site name); the URL is the canonical URL, otherwise the build site URL plus
the entry's path, otherwise the path alone, and is omitted for a collection
entry without a slug; the description is the first text of the SEO
description, the mapped field and the site default, otherwise a note that
search engines choose their own snippet. When "Hide from search engines" is
checked, the preview SHALL say that the page is hidden from search results.
The preview SHALL NOT be a live region.

#### Scenario: Preview with a custom template
- **WHEN** the site title template is "%s — Lace Notes", the site URL is
  `https://example.com/` and the post "Hello" at `/posts/hello` has no SEO
  title or canonical URL
- **THEN** the preview shows the title "Hello — Lace Notes" and the URL
  `https://example.com/posts/hello`

#### Scenario: Preview follows typing
- **WHEN** an editor types "Custom title" into the SEO title
- **THEN** the preview title reads "Custom title"

#### Scenario: Hidden entry
- **WHEN** an editor checks "Hide from search engines"
- **THEN** the preview says the page is hidden from search results

### Requirement: The site defaults global names the defaults it provides
In the editor of the global that declares `seoDefaults`, each mapped field
SHALL show, to writers and viewers and as part of its accessible description,
which site default it provides: the site name used in search and social
titles, the title template (with `%s` standing for the entry title), the
default description, or the default sharing image. Other fields and other
globals SHALL show no such text.

#### Scenario: Settings global with site defaults
- **WHEN** an admin opens the `settings` global whose `seoDefaults` map
  `siteName` and `tagline` as site name and description
- **THEN** the "Site name" field says it is the site name used in search and
  social titles, and the "Tagline" field says it is the default description
  for search and social previews

#### Scenario: Viewer sees the defaults text
- **WHEN** a `viewer` opens the same global
- **THEN** both fields show the same site-default text while read-only

## REMOVED Requirements

### Requirement: Saving preserves stored SEO values until the editor edits them
**Reason**: The editor now offers SEO inputs; the SEO card requirement defines
how stored values are loaded, edited and saved.
**Migration**: Stored SEO values still survive saves that do not edit them,
because the form is reset from the loaded draft and sends every value back.
