## Why

Manually entered internal paths break when an editor changes a destination's
slug. Editors also need a standalone link/button, and an explicit way to remove
linked content without accidentally creating broken navigation or blocking all
subsequent site builds.

## Roadmap unit

Selected **CE10 — internal URL links**, narrowed by the owner on 2026-10-23.
This proposal covers one end-to-end delivery unit: URL authoring and reference
tracking, guarded lifecycle confirmation, build-time resolution, and the Link
block that exercises the same contract. They share one stored encoding and
failure policy and must be verified together before any internal link can ship.
Reference fields and internal rich-text links from the original CE10 backlog
description are explicitly deferred; no separate reference field kind is added.

## What Changes

- Ordinary `field.url()` values may hold a manual URL or `entry:<encoded-id>`.
  The same picker works in model/global fields and block data, including nested
  groups/lists. URL fields are content; the existing block-settings allowlist
  (select/boolean/number/text) stays unchanged. Provider-restricted video URLs and rich text keep
  their existing grammar. No automatic conversion of manually entered paths.
- Project reference locations into an indexed SQL table, with bounded set-based
  operations on Node and D1. Save incomplete references in drafts with warnings;
  block new publication when a delivered reference has no published route.
- Show paginated incoming usages before delete/unpublish. Published usages
  require additional explicit confirmation bound to the observed incoming set
  and target state; stale confirmation fails atomically. Preserve existing
  permissions, singleton restrictions and publication/build separation.
- Resolve links from one published export in memory. Missing targets produce
  bounded diagnostics and non-navigating content; they do not fail a build.
  Transport, malformed content and consistency failures remain fatal.
- Add one version 1 `link` block with required label/URL and scalar settings
  `appearance` (`button` or `text`) and `newTab`. Both variants are anchors
  when resolvable. Missing targets render plain text.
- Move Hero then CTA to the end of the Add block menu, preserving the order of
  every other definition and the order of existing content blocks.
- **BREAKING for build consumers:** advance build-export `formatVersion` to 2
  for the link-aware representation and coordinate SDK, render/adapter and
  installed source adoption. Existing manual URLs and stored blocks are not
  rewritten. Public JSON fields remain stored content values; the new URL
  encoding is a content-grammar extension, not a new REST scalar type. External
  consumers opting into that grammar must adopt resolution explicitly.

## Dependencies and Non-goals

Uses current page/collection routes, globals, bounded composites, scalar block
settings, published snapshots, outbox builds and source registry. Targets are
routable entries of this installation; globals may contain links but cannot be
destinations. No rich-text change, reference-field/related-content API, redirects,
stable block anchors, fragments/query suffixes on entry references, URL health
crawler, external HTTP checks, cross-installation links, media deletion changes,
new infrastructure, deployment, publication of packages or automatic editing of
other entries. Configuration synchronization retains its existing refusal to
remove a model while entries exist. No model-deletion operation, model-removal
impact flow or CLI confirmation override is added. Existing field/block pruning
continues to remove outgoing reference locations atomically.

## Capabilities

### New Capabilities

- `internal-url-links`: canonical values, authoring, usages, confirmation,
  unresolved-target policy and bounded execution requirements.

### Modified Capabilities

- `content-validation`: separate URL-field reference grammar from rich-text
  safety and add aggregate reference bounds.
- `content-use-cases`: outgoing publication checks, incoming lifecycle guards
  and complete lifecycle reference maintenance.
- `rest-contracts`: strict link picker/usage/status/confirmation contracts and
  link-aware format 2 export.
- `public-sdk`: consume format 2 and preserve source-scoped reference manifests.
- `published-site-loader`: immutable link lookup and diagnostics from the
  complete published export.
- `render-core`: structural link resolver props and safe unresolved behavior.
- `block-registry`: standalone Link block and URL-link semantics.
- `admin-draft-editor`: generic URL picker, statuses, impact confirmation and
  block palette order.
- `d1-content-repositories`: indexed, budgeted reference reads and guarded writes.
- `block-source-registry`: link-aware installed renderers and Link source item.
- `schema-evolution`: coherent reference projections through existing schema
  rewrites, with the populated-model removal prohibition preserved.
- `astro-reference-site`: reference/starter adoption and complete build fixtures.

## Impact

Governing architecture: §§4.2–4.7, 6, 8, 9.3/9.6/9.8/9.9, 10–13, 16–17 and
22. Update their selected CE10 contract and `backlog.md` before implementation;
no reference-field exclusion is removed. Accepted specs above are the baseline;
the unsynchronized completed `video-embed-block` change must be preserved as a
dependency when editing overlapping registry/validation/reference-site specs.
The deferred uploaded-video draft is not a dependency.

Touches content/domain/application/contracts, DB schema and a forward migration,
Node/D1 repositories, server/OpenAPI, SDK/render/Astro, admin, registry, CLI
configuration sync, reference and generated starter source, compatibility and
public authoring docs. No package dependency-direction change, KV dependency or
provider request is introduced. Implementation remains a separate explicit apply.
