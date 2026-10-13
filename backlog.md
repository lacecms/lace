# Lace backlog

Future capabilities deferred from the completed
[content and editor roadmap](docs/archive/content-editor-roadmap.md).
Selecting an item requires a just-in-time OpenSpec proposal and explicit apply.

These items are outside the final planned wave. CE10–CE12 retain their relative
order; the two deferred editor topics require separate scope/session planning
when selected and do not yet have an implementation order or new CE numbers.

- **CE10 Entry references and internal links (A7):** reference fields and
  `entry:<id>` links in URL fields and rich text, resolved to paths at build
  time so slug changes do not break links.
- **CE11 Responsive images (C3):** width variants and `srcset` through
  Astro image optimization or Cloudflare Images, using CE3 dimensions and
  focal point.
- **CE12 Bounded revision history (C1):** a small number of retained
  published versions with restore. Requires changing the MVP exclusion of
  revision history.

- **Word/Google Docs paste cleanup (deferred from CE8/B1):** normalize source
  markup into supported rich text, preserve meaningful text/lists/links and
  remove unsupported styling and unsafe attributes. Define loss handling and
  test representative clipboard samples. Document-file import, tables and
  image import are separate scope decisions, not implied by this item.
- **Conditional forms (deferred from CE9/B2):** design declarative visibility
  together with conditional validation, dependencies/cycles, hidden-value
  retention and public delivery. Cover groups, per-item list scope, defaults,
  server enforcement and reachable validation errors; do not ship a partial
  visibility-only mechanism as CE9.

Further candidates, not yet ordered: scheduled publication (C2, an MVP
exclusion), bulk list actions and field-value filters, media folders and tags,
token-protected draft preview, trash for deleted entries, and an early
decision on whether localized content will ever be supported, because locales
would affect snapshot and route keys.
