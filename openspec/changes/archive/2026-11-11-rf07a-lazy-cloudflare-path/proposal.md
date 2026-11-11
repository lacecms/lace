## Why

RF7A separates ordinary Node CLI execution from Cloudflare-only runtime loading. Today the operator command module eagerly imports both the Cloudflare platform and the D1 transport, which eagerly imports Miniflare, even for Node migration.

## What Changes

- Load Cloudflare platform and D1 transport only after a Cloudflare operator target is selected. Make Miniflare an optional CLI peer, retaining it for development and explicitly provisioning compatible versions for generated Cloudflare consumers.
- Provide a sanitized, actionable error for a missing Miniflare dependency on Cloudflare targets; preserve existing CLI outputs, target safety and doctor behavior otherwise.
- Verify actual packaged installation and both Cloudflare targets; leave the platform's admin asset bundle unchanged because it is required by Worker consumers and changing package boundaries is outside RF7A.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `operational-cli`: Node operation does not require Miniflare; Cloudflare targets report the missing optional peer clearly.

## Impact

CLI command loading, D1 transport, package metadata and lockfile, generated Cloudflare dependencies, and packaged tests. Architecture §§6, 7, 12 and 18 and `operational-cli` continue to govern operator behavior. RF1A is complete. RF7B–D, reorganizing the Cloudflare package or removing its admin bundle are out of scope.
