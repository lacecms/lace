# ADR 0033: Protected static preview of one saved draft

- Status: Accepted (implementation pending PV1)
- Date: 2026-11-17
- Governing architecture: §§3–5, 10, 13 and 14

Site-owned Astro components make editing forms insufficient to judge a page
before publication. The owner selected saved-draft preview as the first
pre-1.0 product priority, replacing the broad visual-preview exclusion with
a bounded static capability. Live editing remains excluded.

An explicit request freezes one routed draft revision, its published context
and source commit. A dedicated build renders one page and creates an expiring
private package. It does not publish content, change the public export, use a
public build token to read drafts, or replace public releases. Temporary build
inputs are not a third editorial state or revision history.

Cloudflare uses GitHub Actions and private R2, avoiding the Pages deployment
budget. VPS uses the fixed local builder and private storage. One preview
build is admitted per installation without a preview queue. The complete
artifact is visible only after guarded finalization; a late runner cannot
resurrect an invalidated generation.

HTML, generated assets and copied originals share the same access guard. A
separate preview origin receives only a restricted session bound to a live
Lace session. The admin embeds it when the origins are same-site and otherwise
opens a new tab. An iframe provides revision metadata and responsive viewing
without giving site scripts administrative origin privileges.

Rejected alternatives: live rendering/editor overlays (larger scope), public
preview URLs or HTML-only protection (resource disclosure), widening ordinary
build tokens (draft leakage), Pages preview deployments (publication budget),
full-site output by default (unnecessary route rendering), and same-origin
admin/preview execution (site scripts share administrative privileges).

The November 17 local experiments demonstrated single-route rendering with
Astro 7.4.12, prefixed assets and real Lace session handoff in Chromium. They
did not verify a deployed GitHub/Workers pipeline; that is an implementation
acceptance gate, not an already established production claim.

Detailed behavior and delivery tasks live in
[PV1](../../openspec/changes/add-protected-draft-preview/proposal.md).
