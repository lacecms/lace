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

Groups/lists can be created, collapsed and reordered. List items appear as compact rows that start collapsed; each row's actions menu offers Move up, Move down, Duplicate and Remove, and Duplicate makes an independent value copy. Keyboard drag uses Space to pick up/drop, arrows to move and Escape to cancel. Removing items remains possible when a size limit blocks growth.

## Conflicts and deployment

A revision conflict preserves your unsaved work. Use Copy my JSON before explicitly adopting the server draft; Reload server draft replaces local state. Do not repeatedly overwrite another editor's changes blindly.

Check Builds for the configured site's build result. In dev, reload existing routes after publication and restart for new/renamed slugs. A manual build needs a new build and deployment. Automatic Compose serves a new release only after its successful build; failed builds retain the previous release. A Cloudflare hook reported as Accepted does not prove a deployment completed.

Continue with [rich text and media](rich-text-media/) and [users and accounts](accounts/).

## Search, sort and filter collections

Search, status, one active sort and configured field conditions are kept in the
URL. Reload or Back/Forward restores the query; pagination cursors stay out of
the URL. Sort includes enabled hidden fields. Enabled column headers also sort,
and their filter buttons open the same Filters editor as the general control.
The editor uses field labels and type-appropriate controls, with inclusive UTC
range bounds. False and zero remain meaningful values. Multiple selected
options match with OR; conditions on different fields combine with AND.

Active conditions can be removed individually. Clear filters removes search,
status and field conditions while retaining the sort. Status totals reflect
search and field filters across all statuses, independently of loaded pages.
Stale URLs discard unsupported conditions after metadata loads, keeping valid
peers. Search hints describe extra fields, ASCII-only case behavior and the
runtime character/escaped-byte budget. An invalid search or filter draft stays
editable and keeps the last valid results until corrected.

Long string values use bounded opaque continuations (at most 4096 characters),
without copying those values into a cursor. Any successful save of the boundary
draft, even an unrelated field, or deletion/replacement of that draft expires
its string cursor. A rejected stale save does not expire it. If Load more reports
an expired continuation (`422` at `/after`), the loaded rows remain visible.
Activate **Restart list** to discard old pages/cursors and load the first page
with your search, status, sort and filters retained. Restart replaces the results
and announces recovery; it does not append duplicates or retry the old cursor.

## List presentation and media rows

Where a block declares list layout settings, choose the supported layout and
its visible controls; settings remain part of the saved draft until publication.
The installed site components need the matching layout source and CSS. Compact
media rows keep the same selection, detail and permission behavior; they do not
change stored media or publication. See [Astro integration](../astro-integration/)
for adopting list layout hooks in customized components.
