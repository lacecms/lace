---
title: Edit and publish content
description: Work with drafts, blocks, lists, publication and conflicts in Admin.
---

Open Content to find configured pages, collections and site globals. Pages/globals already have one draft after sync; collections let permitted users create entries. The optional Introduction tour can be skipped and replayed from the account menu.

## Draft and published states

Save draft updates the editable snapshot. Publish replaces the published snapshot and requests a site build; unpublish removes public availability. Publication requires an administrator. A later draft edit does not change what readers see. Published content has no unlimited revision history. Use the explicit discard/revert actions carefully; do not assume that every past publication is recoverable.

Collection slugs can be suggested from title. Manual slug editing, including clearing it, disables suggestions until explicitly re-enabled. Suggestions remove accents and use lowercase ASCII/hyphens; non-Latin titles can need a manual slug. Suggestions do not guarantee uniqueness. Renaming a slug also requires the site's route/build to update.

## Blocks and nested fields

Add permitted blocks, duplicate, remove or reorder them. Block visibility, anchors and CSS hooks are intentional content controls; hidden blocks remain stored. Required values are publication requirements, while invalid present values can prevent saving. Validation summaries lead to the exact field and reveal containing tabs/disclosures.

Groups/lists can be created, collapsed and reordered. Duplicate makes an independent value copy. Keyboard drag uses Space to pick up/drop, arrows to move and Escape to cancel; Move up/down is also available. Removing items remains possible when a size limit blocks growth.

## Conflicts and deployment

A revision conflict preserves your unsaved work. Use Copy my JSON before explicitly adopting the server draft; Reload server draft replaces local state. Do not repeatedly overwrite another editor's changes blindly.

Check Builds for the configured site's build result. In dev, reload existing routes after publication and restart for new/renamed slugs. A manual build needs a new build and deployment. Automatic Compose serves a new release only after its successful build; failed builds retain the previous release. A Cloudflare hook reported as Accepted does not prove a deployment completed.

Continue with [rich text and media](rich-text-media/) and [users and accounts](accounts/).
