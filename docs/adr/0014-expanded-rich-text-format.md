# ADR 0014: Expanded shared rich-text format

Date: 2026-10-13
Status: Accepted for CE8A implementation

## Context

Wave 4 needs one format for every rich-text leaf, from shared validation and
defaults through Astro delivery. CE8A establishes rendering before CE8B authoring.
The existing format admits H1–H3 and href-only links.

## Decision

The portable content package owns additive H4, horizontalRule and plain codeBlock
support and restricted optional link target `_blank` and rel `nofollow`.
False link choices are omitted. Arbitrary targets, rel tokens, language, styles,
HTML and marked code children are rejected. Empty code blocks are valid.
Rules/code are allowed at root and in listItem/blockquote; other nesting stays.
The render core validates first and derives safe link rel (`noopener noreferrer`
for a new tab, then `nofollow` when requested). Astro renders escaped text,
void rules and pre/code without whitespace changes; both code elements use the
codeBlock source in the existing override contract.

## Consequences

Existing documents need no rewrite, database migration or block-version bump.
Node and Cloudflare use identical pure validation. Nested budgets and
save/publication semantics stay unchanged. Upgrade the CMS and site rendering
packages together before using expanded content. Older engines may reject it;
rollback requires explicit removal of new features or restoring an earlier
backup. CE8A alone must not enable authoring of new documents in the admin,
whose existing Tiptap schema cannot preserve them until CE8B.

Per-field allowlists, arbitrary link attributes and syntax highlighting were
rejected to keep one closed format and a small portable rendering boundary.
