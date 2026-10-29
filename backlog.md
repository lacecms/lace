# Lace backlog

- **Alpha.8 release preparation (selected 2026-10-29):**
  `prepare-alpha-eight-release` selects alpha.8/next with template 0.39.0,
  sixteen packages including MCP and API/builder images for both Linux
  platforms. It packages accepted work already on main, refreshes compatibility
  and documentation, and requires fresh source/audit and exact-artifact
  acceptance. Publication and real deployments remain separate owner actions;
  deferred capabilities below retain their order.

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
exclusion), bulk list actions, media folders and tags,
token-protected draft preview, trash for deleted entries, and an early
decision on whether localized content will ever be supported, because locales
would affect snapshot and route keys.
