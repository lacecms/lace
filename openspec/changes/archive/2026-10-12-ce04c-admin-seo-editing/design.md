## Context

CE4A added the per-entry SEO group (`content_snapshots.seo_json`), the `seo`
model mapping and `seoDefaults` on one global, and DTOs that carry `seo` with
`null` for unset values on SEO-enabled models. CE4B resolves the fallback
chain in the SDK (`packages/sdk/src/seo.ts`, `resolveSeo`) and renders head
tags, sitemap and robots on the site. The admin currently sends
`currentEntry.draft.seo` back unchanged
(`apps/admin/src/pages/entry/EntryPage/EntryPage.tsx`) and shows nothing.

Relevant admin facts observed:

- The editor form is React Hook Form over `DraftEditorValues`
  (`entities/content/editor-form.ts`) with a custom resolver
  (`createDraftResolver`), `draftValues()` for resets, `withoutClearedValues`
  before save, `issueLocation()` for server JSON Pointers and
  `validationProblems()` for the summary.
- The right-hand column holds `EntryPublicationDetails` and a *Fields* card;
  the alt-text work in CE3B established the inherited-placeholder pattern
  (`InheritedAltField`, `FieldRenderer` `placeholder` and `notice`).
- `MediaPicker` derives its label from `fieldKey` only.
- The build site URL is available through `client.loadBuildSite`
  (`adminQueryKeys.buildSite`); a model's singleton entry ID through
  `useEntryOverview(modelKey)`, and its full entry through `loadEntry`.
- `@lacecms/contracts` imports `isCanonicalUrl` and `normalizeSeoText` from
  `@lacecms/domain` but does not re-export them; the admin depends on
  `@lacecms/contracts` and `@lacecms/content`, not on `@lacecms/domain` or
  `@lacecms/sdk`.

## Goals / Non-Goals

**Goals:** editable SEO group with counters, soft warnings and hard local
validation; inherited values visible as placeholders; a search-result preview
that matches the site resolver; the defaults global explains its mapped
fields; keyboard and axe coverage.

**Non-Goals:** API, storage, template or SDK behavior changes; an Open Graph
card preview; awareness of `LACE_SITE_INDEXING` (the admin cannot read it);
real-stack admin acceptance for SEO.

## Decisions

### 1. SEO values live in the draft form as `seo`

`DraftEditorValues` gains an optional
`seo?: { title: string; description: string; image: string | null; canonical: string; noindex: boolean }`.
`draftValues(model, entry)` sets it only when `model.seo` is defined, mapping
DTO `null` text to `""` (inputs need strings for dirty tracking) and `image`
to `null`. A pure `seoInput(values.seo)` builds the request object: trimmed
text, blank text → `null`, `image ?? null`, `noindex` boolean. The save sends
`seo: seoInput(…)` only when `model.seo` is defined; otherwise no key, as
today. `localDraftJson` includes the same object so "Copy my JSON" keeps it.

Because every reset path (`form.reset(draftValues(...))` on load, publish,
revert, adopt and discard) already goes through `draftValues`, SEO values
follow them without new code paths. Stored values survive unrelated saves
because the form sends back what it loaded.

*Alternative rejected:* keep SEO in separate component state. It would need
its own dirty tracking, discard, conflict and copy handling, duplicating what
the form already does.

### 2. Validation shares the domain predicates through contracts

`@lacecms/contracts` re-exports `isCanonicalUrl` and `normalizeSeoText` (it
already re-exports the `MAX_SEO_*` limits). The resolver adds `seoProblems`:

- text: `normalizeSeoText(value, kind) === undefined` → control characters
  give "Use a single line of plain text without line breaks."; otherwise
  "Enter no more than 200 characters." / "… 500 characters.";
- canonical: non-blank trimmed value failing `isCanonicalUrl` → "Enter an
  absolute URL that starts with https:// or http://, without credentials or a
  # fragment."; a value longer than 2,048 characters gets "Enter no more
  than 2,048 characters." instead.

Errors are stored at `seo.title`, `seo.description`, `seo.canonical`.
`IssueLocation` gains `` `seo.${"title" | "description" | "image" | "canonical" | "noindex"}` ``;
`issueLocation()` maps `/seo/<key>` to it and leaves `/seo` (for example
`seo_not_allowed`) unmapped, so it is listed as text. `serverIssueMessage`
maps `seo_text_too_long`, `invalid_seo_text`, `invalid_canonical_url`,
`canonical_too_long` and `invalid_seo_image` to the local sentences ("Choose
a media item." for the image). `validationProblems()` appends SEO problems
after model fields in card order with labels "SEO title", "SEO description",
"SEO image", "Canonical URL", "Hide from search engines" and control IDs
`seo-title`, `seo-description`, `seo-image`, `seo-canonical`, `seo-noindex`.

Description is a `<textarea>` (it is long) whose line breaks are reported, not
silently replaced: rewriting the value while typing moves the caret and hides
what the API would reject.

### 3. Counters and soft warnings

A small `SeoTextControl` renders label, input/textarea, a visible count
`{n} / {recommended}` (code points of the trimmed value, the unit the API
limits use) and, above the recommendation, the warning "Search results may
shorten titles longer than 60 characters." (or "descriptions longer than 160
characters."). Count, warning, placeholder text and error are linked through
`aria-describedby`; none is `role="status"` or `aria-live`, so screen readers
hear them on focus rather than on every keystroke. Recommended lengths are
admin constants (`SEO_TITLE_RECOMMENDED = 60`,
`SEO_DESCRIPTION_RECOMMENDED = 160`) beside the helpers; hard limits stay in
the domain.

### 4. Inheritance and preview are one pure helper

`entities/content/seo-preview.ts` (separate from `seo.ts` so `draft.ts` can import the form helpers without an import cycle) exports `seoInheritance(input)` returning the
placeholders and the preview from:
`{ model, values (title, fields, slug, seo), defaults?: SeoDefaultValues, siteUrl?: string }`.
It mirrors `resolveSeo` for text: stored SEO title, else
`formatSeoTitle(entryTitle, defaults)`; description from stored → mapped
field → site default via `seoText`; image source label from mapped media
field → site default; canonical → `siteUrlFor(siteUrl, path)` → path. The
path uses `model.path` for pages and `model.route` with the form slug for
collections (omitted without a slug), so the preview follows unsaved slug
edits.

To keep the admin preview and the site identical, `seoText` and the title
template rule (`formatSeoTitle(title, defaults)`) move from
`packages/sdk/src/seo.ts` into `@lacecms/contracts`; the SDK imports them and
keeps exporting `seoText` from `./seo.js`, so its public surface and tests are
unchanged. `SeoDefaultValues` stays an SDK type; contracts declares the
minimal `{ siteName?, titleTemplate? }` parameter shape.

*Alternative rejected:* import `@lacecms/sdk` into the admin. The SDK is a
Node-targeted site loader (`engines.node`) and would pull in loader code for
two string functions. *Alternative rejected:* duplicate the rule in the
admin; the CE4B title rules (`%s` inserted literally, template applied only
when it contains `%s`) are easy to drift from.

### 5. Site defaults are read from the published defaults global

`useSeoDefaults(models)` in `entities/content/seo-defaults.ts` finds the model with
`seoDefaults`, reads its singleton ID through `useEntryOverview(key)` and the
entry through `client.loadEntry` (shared `adminQueryKeys.entry` cache), then
maps the **published** snapshot's fields through the mapping to
`{ siteName, titleTemplate, description, image }` with `seoText` for text.
Published values are what the next site build uses; showing draft defaults
would preview a title the site would not render. Missing global, missing
entry, no publication or a read error yield `undefined` defaults; the editor
never blocks on them (errors go through `useSessionRecovery` only for session
loss). The editor of the defaults global itself does not need this hook.

### 6. Component placement

- `pages/entry/EntrySeoCard/EntrySeoCard.tsx`: the card (controls, image,
  noindex switch, preview), receiving `control`, `errors`, `model`,
  `inheritance` and `readOnly` from `EntryPage`; rendered after *Fields* when
  `model.seo !== undefined`. It sits inside the existing disabled fieldset,
  so viewers get read-only controls; the image uses `MediaPicker` with the
  context `readOnly`.
- `MediaPicker` gains an optional `label` prop ("SEO image") used for the
  button name and dialog title instead of the key-derived label.
- `FieldRenderer` gains an optional `annotation` (string) shown under the
  description for all users and included in `aria-describedby`.
  `EntryPage` passes it for fields named by `model.seoDefaults`, using
  `seoDefaultsAnnotation(model, key)` from `entities/content/seo.ts`:
  - siteName: "Site name used in search and social titles."
  - titleTemplate: "Title template for search results; %s stands for the entry title."
  - description: "Default description for search and social previews."
  - image: "Default image for social previews."
  A field mapped twice (allowed by CE4A when types fit) shows both sentences.

The noindex control is the shared `Switch` with label "Hide from search
engines" and the description "Adds noindex and leaves the page out of the
sitemap." The preview is a `<section aria-labelledby>` headed "Search result
preview" with title, URL and description as text, plus "Hidden from search
results." when `noindex` is checked.

### 7. The validation summary takes focus once it renders

The browser test showed that after a locally blocked save the summary did not
take focus: local resolver errors can reach the form state one render after
`showSummary()`, so the effect keyed on the focus request found no summary.
The editor now focuses the summary on the first render that shows it, once
per request. Behavior is the one the existing validation-summary requirement
already specifies.

## Risks / Trade-offs

- [Preview differs from the site when indexing is off] → The admin cannot see
  `LACE_SITE_INDEXING`; the preview describes the entry, which is what the
  editor controls. Documented in architecture section 17.
- [Defaults global unpublished while drafting] → Placeholders fall back to the
  next step; once published and rebuilt they match. Covered by a scenario.
- [Moving `seoText`/`formatSeoTitle` into contracts] → Contracts gains two
  pure functions; the SDK unit tests for every fallback step keep guarding the
  behavior, plus a contracts unit test.
- [More requests on the editor] → One overview and one entry read for the
  defaults global, cached and shared with the sidebar; none when no global
  declares defaults.

## Migration Plan

Admin-only release with the next alpha; no data or template migration.
Entries saved by the previous admin keep their values. Rollback is a plain
redeploy of the previous admin.

## Open Questions

None.
