---
title: Rich text and media
description: Author supported rich text and reuse media with meaningful metadata.
---

The rich-text editor stores a validated document, not arbitrary HTML. Use its supported headings, paragraphs, lists, links, code, quotations and formatting controls. Pasted content is normalized into supported structure; do not expect full Word/Google Docs fidelity, arbitrary tables or raw embedded HTML.

Rich text renders through the shared Lace grammar. Site code should use the first-party renderer rather than inject untrusted HTML. A custom renderer can override supported elements while retaining validation. Invalid/unsupported document shapes fail explicitly.

## Media library

Upload and choose reusable media through Media. Binary files live in object storage; the database holds metadata and keys. Supply meaningful alt text for informative images and use captions when useful. Usage-level overrides can differ from shared metadata. A site image helper can resolve nested media references, metadata and focal point.

A referenced object cannot simply be deleted while it is still in use. Inspect usage, remove its references from drafts and published content as required, and publish the changes before retrying deletion. A confirmed draft-only detach does not detach published uses. A failed upload/delete should be retried from the actionable UI state rather than manually deleting storage objects behind the CMS.

Gallery uses a list of images, captions and alt overrides; Navigation uses ordered links with bounded children. Editors control content; the installed Astro components and your stylesheet control presentation. Viewers can inspect content and expand disclosures but cannot upload/select media or mutate lists.
