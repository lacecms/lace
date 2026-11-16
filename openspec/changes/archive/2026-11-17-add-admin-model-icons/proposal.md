## Why

Models of the same kind share a sidebar icon today, so editors have to read each label to distinguish items such as Navigation and Site settings. This standalone product change delivers the [per-model navigation icons backlog item](../../../../backlog.md) independently of EX5 and EX7.

## What Changes

- Allow an optional `icon` string on pages, collections, and globals in `lace.config.ts`. Accept a name from a small set of Lucide icons or one Unicode emoji.
- Show the icon next to the model label in the desktop sidebar and its narrow-screen navigation sheet. Use the existing icon for the model kind when the option is absent or the admin does not recognize a name supplied by the API.
- Treat icons as presentation metadata. An icon edit needs no model version bump, and a trusted public identity lets synchronization apply the change without scheduling a site build.
- Add starter examples for Navigation and Site settings. The scope is model navigation in the sidebar.

## Capabilities

### New Capabilities

### Modified Capabilities

- [content-model-configuration](../../../specs/content-model-configuration/spec.md) defines accepted config values and their effect on normalized identity.
- [configuration-synchronization](../../../specs/configuration-synchronization/spec.md) specifies the outcome of synchronizing an icon edit.
- [rest-contracts](../../../specs/rest-contracts/spec.md) carries the optional icon through shared REST and MCP model discovery.
- [admin-application-shell](../../../specs/admin-application-shell/spec.md) specifies icon selection, fallback, and accessible sidebar rendering.

## Impact

The change extends the code-first configuration and presentation boundaries in [architecture §8](../../../../docs/architecture/content-configuration.md), [§12](../../../../docs/architecture/api.md), and [§17](../../../../docs/architecture/admin.md). It uses the existing guarded synchronization path on Node/SQLite and Cloudflare/D1 and static Lucide imports in the admin. The apply work includes the starter config and modeling reference.
