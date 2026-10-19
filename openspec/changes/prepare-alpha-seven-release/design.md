## Context

See proposal.md for motivation. Release metadata still selects alpha.6/template 0.30.0, while `packages/create-lace/src/inventory.ts` and accepted image-link specs already select template 0.34.0. `release:check` validates manifests, runtime version modules, registry requirements, generated dependencies, image defaults, Dockerfiles and delivered guide coordinates. English/latest's catalog and normative target are alpha.6. The sole preexisting active change is video A, with no implementation tasks complete; it is not a release dependency. A planning-time `gh release list` failed to connect, so remote publication status remains unverified.

## Goals / Non-Goals

**Goals:** produce a coherent alpha.7 source, usable upgrade guidance and fresh reproducible local acceptance with traceable evidence.

**Non-Goals:** modify accepted image semantics, implement video, publish or deploy, replace release tooling, delete historical receipts or relax source/consumer safety gates.

The owner approved one security dependency update during apply: override the
documentation build's transitive `postcss-selector-parser` to `7.1.6` for
GHSA-rj75-hqrm-r3gf, then refresh the lockfile and repeat docs/audit gates.
This is a targeted remediation, not a new audit exception or general dependency
upgrade. Preserve the two existing tooling advisory dispositions unchanged.

## Decisions

1. **Advance the entire release graph and template to alpha.7/0.35.0.** Update `release/alpha.json`, public manifests, platform versions, generated dependencies and image references, Docker defaults, registry requirements and delivered guides together; preserve private workspaces. Refresh lockfile, inventory and affected snapshots selectively. Reusing alpha.6 artifacts or reverting the template to 0.31.0 would misidentify the shipped graph and lose accepted template history.
2. **Use existing boundaries.** Domain/application media checks, server delivery, platform adapters, SDK/render descriptors and Astro transforms retain their responsibilities. Generator/CLI own managed template updates; installed site source remains user-owned. Acceptance-harness additions may exercise these boundaries but must not patch saved runtimes or introduce new runtime features. A discovered product defect or design conflict requires revising this plan before expanding implementation.
3. **Maintain documentation across all audiences.** Update public `editing-content/rich-text-media`, Astro integration, Node/Cloudflare deployment and operations pages plus catalog and target assertions. Review internal compatibility, release, site styling, runtime/deployment and documentation-maintenance material and generated guides. Cover `laceImageConfig`, site `sharp` dependency, loader optimization/fallback, variants, animation, placeholder exceptions, lightbox/link behavior and cache headers. Explain image/gallery versions 4/3, current model versions and conflict-aware registry updates before synchronization/build. Root changelog supplies 3–6 concise bullets and a permanent upgrade link; detailed evidence stays separate.
4. **Keep evidence bound to saved bytes.** Reuse `release:prepare`, `release:verify` and `acceptance:release`. Extend the consumer harness only for gaps in GIF/original/conditional delivery, image transformation/rendering, proxied upload and static caching. Exercise media in Node and local Worker/D1/R2; inspect Pages configuration without pretending to deploy it. Use repeated builds and existing failure/retry checks for cache persistence and atomic release integrity. Source-only fault/concurrency cases remain labeled separately.
5. **Freeze shipping source before full preparation.** Run gates and audit, then record an authorized reviewed clean commit. Use `.release-artifacts/alpha-7` or a new explicitly named retry directory. Never merge or overwrite sets. Store durable acceptance and readiness evidence with inventory SHA-256, source fingerprint, image IDs and package hashes. Local image IDs are not registry digests. If a clean commit cannot be obtained, report the prerequisite and do not claim release eligibility from a preview.

## Risks / Trade-offs

- Customized site components may conflict with registry updates → explain reviewed conflict resolution and preserve user changes; verify upgrades from historical fixtures including alpha.6.
- Content sync advances image/gallery schemas → back up configuration/database/media and matching site source first; do not promise package-only rollback or automatic schema reversal.
- Optimized images need reachable originals and the site image service → verify generated and existing-site setup, animated output, transparent/GIF placeholder exceptions and explicit transform failures.
- Cache reuse can hide build defects → cover warm/cold runs, unusable-cache fallback, failed-build clearing and prior-release preservation using accepted cache contracts.
- Registry, Docker or network access can be unavailable → retain diagnostics, continue independent source/docs checks and record unavailable gates honestly. Do not infer permission or publication from old metadata.

## Migration Plan

Compare actual migration files with the alpha.6 source and state the result. Upgrade all Lace dependencies and both images together, review generated deployment changes and installed components, run explicit forward migrations if required, synchronize configuration with the matching block schemas and rebuild. Verify image delivery and site output on Node/local Cloudflare. Restore matching backups and source for rollback after schema synchronization; caches are disposable and never application backups. Actual registry publication and real deployments remain separate owner actions.
