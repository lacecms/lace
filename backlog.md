# Lace backlog

- **Refactoring roadmap (selected 2026-11-01):** planned in
  [`docs/refactoring-roadmap.md`](docs/refactoring-roadmap.md) from the
  workspace architecture audit. Order: RF1 workspace hygiene → RF2 tests
  against source → RF3 shared vocabulary (types, constants, rules) → RF4
  module splits → RF5 runtime deduplication → RF6 admin editor structure →
  RF7 CLI and scripts → RF8 documentation. Behavior-preserving sessions carry
  no delta specs. Each session gets its own just-in-time OpenSpec change;
  RF1–RF3 and RF4A–RF4E are archived, and RF4X (workspace guards) was inserted
  before RF4F after an audit of the completed sessions. Progress is tracked in
  the roadmap's progress log.

- **Site migration roadmap (implemented, archived 2026-11-01):** SM1–SM5
  (twelve sessions) delivered and merged in lacecms/lace#63; every change is
  archived and synchronized. The roadmap moved to
  [`docs/archive/site-migration-roadmap.md`](docs/archive/site-migration-roadmap.md).

- **Configurable default collection sort (from the tatianae.com rc2 mapping,
  2026-11-10; selected 2026-11-10 as the third owner-inserted change after
  RF6):** today a collection list
  always opens sorted by `-updatedAt`, and `listOptions` cannot change that.
  A portfolio orders its projects by a numeric `order` field, so editors must
  pick the Order column on every visit. The URL keeps a chosen sort only while
  the editor stays on that list.

  Candidate: an optional `listOptions.defaultSort`, for example
  `{ field: "order", direction: "asc" }`, limited to one entry of
  `sortableFields` or to a system sort. It would be projection-only, like the
  rest of `listOptions`: it needs no model version bump and requests no build.
  - The API applies it when a request has no `sort`.
  - The admin leaves it out of the URL, the same way the current default is
    not written there.
  - Node and D1 use the existing typed sort and bounded cursor code.

  Not in scope: drag-and-drop ordering and a public order contract. The site
  still sorts published entries itself.

- **Route-less collections (from the tatianae.com rc2 mapping, 2026-11-10;
  selected 2026-11-10 as the fourth owner-inserted change after RF6):** a collection always needs a `route`
  with one `:slug` segment, and every entry needs a slug before publication.
  Data that is only listed on another page, such as About CV rows,
  testimonials or press mentions, gets URLs nobody renders. Today the site
  works around this in three ways:
  - a dummy route (`/cv/:slug`);
  - a hand-made slug for every row;
  - a sitemap filter (`sitemapResponse(site, { include })`) that leaves the
    model out so the 404 URLs are not listed.

  Candidate: a collection without `route`. Its entries have no slug, never
  enter `published_routes` and are left out of path lookup and the sitemap.
  Like globals, they are read through the site view by model key, but there
  can be many of them. Settle in the spec:
  - the kind boundary: whether adding or removing a route is breaking,
    following the existing route and kind rules;
  - internal links to such entries (`entry:` targets need a published route
    today);
  - SEO opt-in, which is rejected without a route;
  - the admin slug UI;
  - export format and SDK typing;
  - Node/D1 parity.

  Related, but separate: bulk publication for many small entries (see "bulk
  list actions" below).

- **Shared video primitive (deferred from SM5D, 2026-11-01):** `videoEmbed`
  and gallery video items each carry their own registry markup and ambient
  mounting script. Extract a `LaceVideo` adapter component (with its
  structural CSS and script) only when a third consumer, such as a hero video,
  needs the same playback contract.

- **Alpha.8 release preparation (implemented, archived 2026-10-30):**
  `prepare-alpha-eight-release` prepared alpha.8/next with template 0.39.0,
  sixteen packages including MCP and API/builder images for both Linux
  platforms. Source/audit gates, independent saved-artifact verification and all
  22 exact-artifact journeys passed for `.release-artifacts/alpha-8-retry-1`.
  Archived at `openspec/changes/archive/2026-10-30-prepare-alpha-eight-release`;
  both capability deltas are synchronized. Publication and real deployments
  remain separate owner actions; deferred capabilities below retain their order.

- **MCP3 Claude Code and Gemini CLI setup (implemented, archived 2026-10-29):**
  `add-claude-and-gemini-mcp-guides` extends the implemented MCP2 Settings card
  with client-specific OAuth setup and sign-in examples, preserving selected
  permissions. Depends on MCP2; no provider or backend changes.
  Archived at `openspec/changes/archive/2026-10-29-add-claude-and-gemini-mcp-guides`;
  the capability delta is synchronized.

- **MCP2 MCP Settings and local activation (implemented, archived 2026-10-29):**
  `add-mcp-settings-and-local-enablement` verifies local Compose flag forwarding
  and adds an always-visible, read-only MCP configuration section to Admin
  Settings with canonical endpoint and permission-aware client setup examples.
  Follows MCP1; preserves OAuth, tool authority, and unrelated roadmap ordering.
  Archived at `openspec/changes/archive/2026-10-29-add-mcp-settings-and-local-enablement`;
  all three capability deltas are synchronized.

- **MCP1 Optional OAuth content assistant (implemented, archived 2026-10-29):**
  `add-oauth-mcp-server` adds opt-in stateless MCP in the existing Node/Worker
  deployment, Better Auth account delegation, explicit consent and revocable
  connections. REST and MCP share portable content operations and contract
  projections. Only model/list/get/create/save-draft are allowed; publication,
  unpublication and all content deletion remain forbidden. Media and broader
  administration are deferred. Provider/SDK compatibility and SQLite/D1 atomicity
  gates pass; all 26 tasks are complete and seven capabilities are synchronized.
  Archived at `openspec/changes/archive/2026-10-29-add-oauth-mcp-server`; verification
  records the pre-existing release template identity blocker separately. Other
  selections below retain their scope and ordering.

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
  own future scope/planning; no implementation order selected. Reviewed
  2026-10-31 and kept deferred outside the site migration roadmap; a numeric
  order field covers project ordering and "next" links for now.
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
  player on explicit activation. No video-file upload dependency. Implemented;
  specs synchronized and change archived 2026-10-31 at
  `openspec/changes/archive/2026-10-31-video-embed-block`.
- **Uploaded video (deferred, no implementation order selected):** MP4/WebM
  storage, streamed upload, byte-range delivery and field-level media kinds;
  then uploaded-video blocks and admin library/picker/player support. Revisit
  autoplay/loop/muted/controls and motion accessibility when selecting that work.
  The unapplied `video-a-media-upload-delivery` draft (0 completed tasks)
  is preserved as historical planning input at
  [`2026-11-01-video-a-media-upload-delivery-superseded`](openspec/changes/archive/2026-11-01-video-a-media-upload-delivery-superseded/),
  without synchronizing its deltas. It is not the selected next change. Its old
  A → B → C order is superseded by this embed-first selection; rebase and replan
  it against accepted specs before any future apply. Do not include another
  `videoEmbed` implementation in that future uploaded-video scope.

- **Word/Google Docs paste cleanup (deferred from CE8/B1):** normalize source
  markup into supported rich text, preserve meaningful text/lists/links and
  remove unsupported styling and unsafe attributes. Define loss handling and
  test representative clipboard samples. Document-file import, tables and
  image import are separate scope decisions, not implied by this item.
- **Conditional forms (deferred from CE9/B2; selected 2026-10-31 as SM5 of the
  site migration roadmap):** design declarative visibility
  together with conditional validation, dependencies/cycles, hidden-value
  retention and public delivery. Cover groups, per-item list scope, defaults,
  server enforcement and reachable validation errors; do not ship a partial
  visibility-only mechanism as CE9. Completed LIST2 implements the bounded scalar
  block-settings exception recorded in the archived roadmap; it does not select general conditional forms.

- **CQ1 Configurable collection queries (implemented 2026-10-25):**
  `add-configurable-collection-queries` adds opt-in admin draft field sorting,
  typed filters and extra literal LIKE search on Node and D1. ASCII case is
  ignored, Cyrillic case is retained. Node/VPS keeps the 200-code-unit search
  limit; Cloudflare uses 48 code units and at most 50 UTF-8 bytes in the escaped
  LIKE pattern, advertised to the admin and enforced before reads. Includes an additive public-projection identity migration and
  guarded sync classification so query-only changes avoid builds while SEO
  changes retain them; legacy unknown identities rebuild conservatively once.
  Custom string sorts use bounded entry/revision cursor anchors with indexed
  continuation lookup and explicit restart after anchor edits/deletion; long
  field values do not expand transport cursors. Public order/content and bulk
  actions stay outside this scope. Specs synchronized and change archived at
  `openspec/changes/archive/2026-10-25-add-configurable-collection-queries`.

Further candidates, not yet ordered: scheduled publication (C2, an MVP
exclusion), bulk list actions, media folders (tags are selected as SM3),
token-protected draft preview, trash for deleted entries, and an early
decision on whether localized content will ever be supported, because locales
would affect snapshot and route keys.
