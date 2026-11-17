## Why

Editors need to see a saved draft through their site's real Astro layouts,
fonts, blocks and responsive behavior before publishing. Protected single-page
preview is the owner's first product priority before Lace 1.0.

## What Changes

- Add explicit preview creation for saved pages and routed collection entries.
  Validate publication-required fields and visible blocks before building;
  keep draft and public state unchanged. Admin/editor create; viewer opens.
- Freeze one target revision, published context and configured source commit.
  Render one route, including CSS, scripts, fonts, image variants and necessary
  originals, through site-owned Astro components.
- Build on GitHub Actions into private R2 for Cloudflare, and through a fixed
  local builder on VPS. Do not use Pages deployments for preview.
- Keep one preview per entity, one active build per installation, no preview
  queue, manual retries, 10-minute execution/upload and 15-minute total limits,
  and a 24-hour ready lifetime. Save/revert/unpublish retain existing preview;
  publication and relevant deletion invalidate it.
- Protect every packaged resource with a restricted session linked to the
  original Lace session. Display preview in an isolated iframe for same-site
  origins, with new-tab access always available and used for incompatible
  domains. Show the captured revision, age and expiry.
- Provide opt-in configuration, readiness reporting, generated workflow and
  deployment guidance; hide creation when setup is incomplete.
- Amend the architecture's visual-preview exclusion and record ADR 0033.

Non-goals: live editing, automatic save/build/retry, guest links, route-less
entity/global preview, full-site draft preview, content history, arbitrary
remote build commands, automatic suppression of site scripts, and free-tier
capacity guarantees.

## Capabilities

### New Capabilities

- `draft-preview`: saved-revision admission, frozen inputs, lifecycle,
  invalidation, concurrency, timeout and editor/viewer behavior.
- `draft-preview-delivery`: isolated host, session handoff, resource protection,
  private packages, expiry and cleanup.
- `astro-draft-preview`: single-route rendering, asset/link integration, source
  pinning and parity between GitHub/Cloudflare and local VPS builders.

### Modified Capabilities

- `astro-adapter`: permit the opt-in server-only preview integration.
- `workspace-governance`: allow `parse5` only in the server-side preview HTML
  transformation module; preserve other adapter import restrictions.

Existing public loader/export, publication trigger and `/build` contracts
remain intact; preview has separate routes, credentials and state. The new
capabilities add invalidation to successful lifecycle operations without
changing their existing permission, idempotency or public-state semantics.

## Impact

This implements roadmap **PV1**, one end-to-end product unit outside EX1–EX7.
The plan has six separately verified implementation checkpoints (PV1A–PV1F),
with an initial estimate of 6–10 working sessions. This is an explicit staged
exception to one roadmap session per change: the common protocol and complete
acceptance contract stay in one proposal; each checkpoint can be applied and
reviewed independently, while the feature remains disabled until complete.
These checkpoints do not combine any previously selected EX session units.
No implementation or release of the existing RC5 preparation change is implied.

Governing sections: architecture §§3–7, 9–10, 12–17, 20–22 and
[ADR 0033](../../../docs/adr/0033-protected-static-draft-preview.md). Related
accepted capabilities: `content-validation`, `content-use-cases`,
`media-use-cases`, `authentication-and-actor-boundary`,
`admin-draft-editor-publication`, `published-site-loader`, `astro-adapter`,
`build-site-selection`, `fixed-command-vps-builder`, `site-build-dispatch`,
`publication-visibility` and `cloudflare-consumer-worker`.

Affected areas: application preview ports/use cases; shared DB schema/write
plans and migrations; Node/D1 repositories; auth/server route policies and
contracts; private object storage and runtime maintenance; SDK/Astro opt-in
loading; the builder; admin; generator/CLI/deployment templates and docs.
The preview HTML transform adds a catalog-pinned `parse5` build dependency.
Dependencies are the existing Astro site integration, selected build source,
private storage and Lace sessions. Cloudflare additionally needs a configured
GitHub repository/workflow and a preview hostname. Existing deployments
remain functional with preview disabled until explicitly configured.
