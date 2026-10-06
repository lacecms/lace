## Why

Roadmap Session 33C — Builder source policy and failure diagnostics — addresses existing-site builds failing on an incidental repository-root `CLAUDE.md -> AGENTS.md` link, with no actionable explanation in Builds. The builder currently collapses copy failures to `source_invalid`, and both the dispatcher and persistence sanitizer collapse known builder reasons to `provider_failed`.

## What Changes

- Exclude the exact installation-root entries `AGENTS.md` and `CLAUDE.md` from the disposable build copy, whether regular files or links, without inspecting or following their targets. Retain all existing source exclusions. Reject every other included symbolic link, including links within the selected site and links escaping the installation; identify its safe source-relative path. Selection components and release output remain link-free.
- Introduce source-specific reasons `source_symlink`, `source_unreadable`, `source_missing`, and `source_special_file`. Preserve existing `source_invalid`, `install_failed`, `build_failed`, `version_changed`, `trigger_unavailable`, `build_timeout`, `invalid_build_event`, and `provider_failed`. This is the complete failure vocabulary for this session; unknown failures alone become `provider_failed` at application/persistence boundaries.
- Carry an optional validated path through the authenticated builder response, Node trigger, portable dispatcher, and existing `site_builds.error` text column. Store structured diagnostics in that column while continuing to read legacy reason strings. Keep outbox `last_error` a closed reason code.
- Add optional `errorPath` to the admin build list/detail DTO while retaining `error` as the reason code. Show the build ID, reason-specific explanation, safe path when available, and a concrete correction in Builds, including failures awaiting automatic retry. Preserve role permissions and retry/lease behavior.
- Update ADR 0004 and operations documentation to explain the exclusions, rejection policy, safe-path boundary, and correction/retry procedure. Verify with an independent packed Compose production consumer using an existing Astro parent and generated `cms/` child.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `fixed-command-vps-builder`: source exclusion/rejection policy and bounded structured authenticated failures.
- `build-site-selection`: source-relative failure metadata as an explicit, limited exception to path suppression.
- `site-build-dispatch`: preserve known reasons and safe paths through persistence and recovery on both runtimes.
- `rest-contracts`: additive admin build `errorPath` and closed diagnostic validation.
- `admin-application-shell`: actionable Builds diagnostics with build correlation and unchanged authorization.

## Impact

Governing architecture: §§4.5, 5 (VPS deployment), 6, 9.8, 12, 15, 17, and 21. No architectural invariant changes: a validated entry path relative to the mounted installation identifies a failure; it never reveals the host/container root, configured deployment location, link target, secrets, or subprocess output. Accepted builder/selection specs currently prohibit source paths generally; their deltas explicitly introduce this narrow exception rather than silently weakening them.

Implementation touches `apps/builder`, portable application diagnostics/ports, shared SQL helpers, Node and D1 repositories, Node builder transport, contracts/OpenAPI, Builds UI, ADR 0004, and generated-consumer acceptance tooling. Builder remains a standalone image with no new runtime package dependency; its protocol vocabulary is checked against the portable vocabulary by tests. No SQL schema migration or new dependency is required. Existing raw reason rows remain readable; mixed-version API/admin/dispatcher deployments are not supported and must be upgraded together.

Depends on completed source selection, fixed-command builder and packed consumer acceptance, plus Sessions 33A/33B. Scope is only 33C. Non-goals: 33D status changes, provider tracking, Cloudflare account deployment, new deployment configuration UI, following/flattening links, configurable copy exclusions, complete build logs, subprocess failure classification beyond existing stage codes, changing retry schedules, or publishing alpha artifacts.
