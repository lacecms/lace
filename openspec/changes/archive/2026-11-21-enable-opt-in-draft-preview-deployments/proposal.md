## Why

PV1 implemented and verified protected saved-draft preview, while the standard Node and Cloudflare entry points still require a test-only composition switch to admit a preview. Operators and contributors need a supported way to opt in through deployment configuration.

## What Changes

- Carry out the PV1 deployment follow-up as one roadmap session unit. Add an explicit, default-off `LACE_PREVIEW_ENABLED=true` opt-in for standard Node VPS and deployed Cloudflare entry points, with validated configuration and safe unavailable states.
- Make preview usable in the repository Node development stack and generated Node development projects. Provide an opt-in loopback HTTPS ingress and a private local runner for the selected, committed Astro source. Keep the ordinary development startup and frontend reload behavior.
- Use the existing PV1 single-page build, authenticated viewer, private artifacts, and lifecycle. VPS uses the existing fixed builder and private SILO storage. Deployed Cloudflare uses the dedicated GitHub workflow, D1, and a separate private R2 bucket.
- Update configuration examples, generated setup and upgrade guidance, the contributor guide, the public deployment and editor guides, and the optional doctor check. Verify the supported entry points with the flag off, incomplete, and fully configured.

The scope is local Node, Node VPS, and deployed Cloudflare. The local Worker workflows `dev:cloudflare` and `cf:dev`, feature additions to PV1, database schema changes, and release publication are outside this change. It depends on the archived [PV1 implementation and provider acceptance](../2026-11-21-add-protected-draft-preview/verification.md).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- [astro-draft-preview](../../../specs/astro-draft-preview/spec.md) governs opt-in, configuration readiness, and supported deployment entry points.
- [draft-preview-delivery](../../../specs/draft-preview-delivery/spec.md) governs isolated HTTPS ingress in local development and immediate denial when preview is disabled.
- [local-node-development](../../../specs/local-node-development/spec.md) gains the opt-in repository Node development workflow.
- [project-generator](../../../specs/project-generator/spec.md) gains supported opt-in files and instructions for generated Node development, VPS, and deployed Cloudflare projects.
- [generated-project-acceptance](../../../specs/generated-project-acceptance/spec.md) covers activation and withdrawal through standard packed-consumer entry points.

## Impact

Relevant invariants are in [architecture §5 and §18](../../../../docs/architecture/deployment.md), [§10](../../../../docs/architecture/publication.md), [§13](../../../../docs/architecture/rendering.md), [§14](../../../../docs/architecture/security.md), and [ADR 0033](../../../../docs/adr/0033-protected-static-draft-preview.md). The work touches Node and Worker composition, the development gateway and Compose profiles, builder startup, the reference Astro site, generated deployment files, doctor, and acceptance tests. Existing preview API shapes, session permissions, persistence and publication behavior continue to apply.
