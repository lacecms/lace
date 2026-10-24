# Lace backlog

- **DOC1 Public documentation (selected):** private Astro/Starlight application,
  English latest (alpha.7), locale/version foundation, changed-input Pages
  publication from main, product README and contributor guide. Delivered through
  `add-starlight-documentation`; independent of the deferred CE sequence.

Future capabilities deferred from the completed
[content and editor roadmap](docs/archive/content-editor-roadmap.md).
Selecting an item requires a just-in-time OpenSpec proposal and explicit apply.

These items are outside the final planned wave. CE10–CE12 retain their relative
order; the two deferred editor topics require separate scope/session planning
when selected and do not yet have an implementation order or new CE numbers.

- **CE10 Internal URL links (implemented 2026-10-23):**
  `ce10-internal-url-links` implements stable entry-ID destinations in ordinary URL
  fields, including nested model/global/block data. Block settings retain their
  existing select/boolean/number/text allowlist.
  Resolve published paths at build time, track indexed incoming usages, require
  additional reviewed confirmation for deletion/unpublication affecting published
  links, and render unavailable targets without navigation. Add one Link block
  with button/text appearances; put Hero then CTA last in the block picker.
  D1 reads/writes are bounded, with no per-link build requests. Migration 0010
  and format-2 export are implemented; populated model removal stays forbidden.
  See `docs/internal-url-links.md` and its verification record. Specs synchronized
  and change archived on 2026-10-24 at
  `openspec/changes/archive/2026-10-24-ce10-internal-url-links`. Reference fields
  and rich-text internal links remain excluded.
- **Entry reference fields and rich-text internal links (deferred from CE10):**
  related-content fields and stable destinations inside rich text require their
  own future scope/planning; no implementation order selected.
- **CE11 Responsive images (C3):** width variants and `srcset` through
  Astro image optimization or Cloudflare Images, using CE3 dimensions and
  focal point.
- **CE12 Bounded revision history (C1):** a small number of retained
  published versions with restore. Requires changing the MVP exclusion of
  revision history.

- **Image delivery (selected 2026-10-18, three changes in order; replaces
  CE11):** build-time variants through the Astro image pipeline, WebP only.
  - **A `images-a-media-format-caching`:** done (archived 2026-10-18).
  - **B `images-b-build-variants-lightbox`:** done (archived 2026-10-18;
    GIFs became animated WebP variants instead of unchanged copies).
  - **C `images-c-deploy-caching`:** done (archived 2026-10-18).
  - **D `images-d-image-links`:** done (archived 2026-10-18; optional `link`
    on `image` blocks and gallery items, taking precedence over the lightbox).
- **Video embeds (selected 2026-10-22):** implement `video-embed-block`
  first: built-in `videoEmbed`, YouTube/Vimeo URL validation, optional preview
  image from the existing media library, render-core description and a site-owned
  Astro renderer. Without a preview render a lazy iframe; with a preview load the
  player on explicit activation. No video-file upload dependency.
- **Uploaded video (deferred, no implementation order selected):** MP4/WebM
  storage, streamed upload, byte-range delivery and field-level media kinds;
  then uploaded-video blocks and admin library/picker/player support. Revisit
  autoplay/loop/muted/controls and motion accessibility when selecting that work.
  The existing unapplied `video-a-media-upload-delivery` draft (0 completed tasks)
  is retained as historical planning input, not the selected next change. Its old
  A → B → C order is superseded by this embed-first selection; rebase and replan
  it against accepted specs before any future apply. Do not include another
  `videoEmbed` implementation in that future uploaded-video scope.

- **Word/Google Docs paste cleanup (deferred from CE8/B1):** normalize source
  markup into supported rich text, preserve meaningful text/lists/links and
  remove unsupported styling and unsafe attributes. Define loss handling and
  test representative clipboard samples. Document-file import, tables and
  image import are separate scope decisions, not implied by this item.
- **Conditional forms (deferred from CE9/B2):** design declarative visibility
  together with conditional validation, dependencies/cycles, hidden-value
  retention and public delivery. Cover groups, per-item list scope, defaults,
  server enforcement and reachable validation errors; do not ship a partial
  visibility-only mechanism as CE9. Completed LIST2 implements the bounded scalar
  block-settings exception recorded in the archived roadmap; it does not select general conditional forms.

Further candidates, not yet ordered: scheduled publication (C2, an MVP
exclusion), bulk list actions and field-value filters, media folders and tags,
token-protected draft preview, trash for deleted entries, and an early
decision on whether localized content will ever be supported, because locales
would affect snapshot and route keys.
