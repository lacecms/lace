# ADR 0034: Acyclic entry reference fields

- Status: Accepted
- Date: 2026-11-21
- Governing architecture: [§8](../architecture/content-configuration.md#field-types), [§10](../architecture/publication.md), [§13](../architecture/rendering.md#132-published-site-loader) and [§25](../architecture/distribution.md#25-planning-defaults-and-remaining-release-decisions)

## Context

A service page needs an editorially ordered selection of testimonials. An
article can use the same author profile as other articles. Both targets can
belong to [route-less collections](0031-route-less-collections.md). An
ordinary URL field identifies a navigation destination, and a collection
listing gives a site all its published records. The editor needs to choose
which records supply a particular page's data.

## Decision

A code-defined reference holds one stable entry ID and restricts the choice
to named page or collection models. A list of references holds the IDs in
editorial order. Pages, collection entries and globals can own references,
including in groups, list items and block data. A global remains addressable
by model key. Rich-text links are separate work.

Each content state has its own directed acyclic graph. Draft validation uses
the candidate in place of its saved draft and includes retained hidden values.
Publication validates the candidate's delivered references against the current
publications of the other entries. A selected visible target must have a
published snapshot. Every writer preserves these invariants atomically on
SQLite and D1. Editors can stage reversal of A → B by saving removal in A
before saving B → A. They publish A first to release the original edge.
Ordinary URL fields follow their existing route and impact rules.

A direct delivered use in a publication blocks target withdrawal or
deletion. The editor can open the referring entry at its field or block and
publish the correction. A draft edit alone leaves the blocker in place.
Deletion with direct uses confined to drafts requires review of those uses
and acknowledgment. Existing draft selections retain a deleted target's ID
so editors can locate and repair each field. Usages in hidden content that
the site never receives cannot block target withdrawal.

The public SDK resolves each selection in one explicit step against the
complete published export. Publishing an updated author makes the new data
available to all referring pages on their next build. The protected preview
uses the same lookup against its frozen input under
[ADR 0033](0033-protected-static-draft-preview.md). Editors publish a new
testimonial before previewing it on a service page.

## Consequences

Direct usages are discoverable from the stored field locations. The CMS
cannot infer where arbitrary Astro template code displays a record. Requiring
editors to maintain a second, inverse selection would create conflicting
orders and ownership. Automatic recursive expansion would duplicate shared
records in the export and would provide no additional editorial capability.

Implementation is proposed in
[REL1](../../openspec/changes/add-entry-reference-fields/proposal.md).
