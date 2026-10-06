## Context

See `proposal.md` for the motivation and session boundary. Source selection already distinguishes generated, standalone and workspace installations. `apps/builder/src/source.ts` excludes sensitive/generated entries before copying, but throws generic errors for nonregular entries; `runner.ts` catches every copy error and returns `source_invalid`. `server.ts` returns `{ status, reason, log }`. The Node adapter validates that shape but the portable dispatcher and shared SQL sanitizer subsequently erase its recognized reasons.

`site_builds.error` and outbox `last_error` are nullable text in both SQLite and D1. Contracts expose `error` as an optional identifier. Builds displays it by replacing underscores and does not show the build ID or a correction. The independent existing-site journey currently resolves Compose configuration and builds against a controlled export on the host; it does not run that existing-site layout through the production builder. The starter Compose production journey and reference VPS integration provide reusable container/bootstrap/dispatch helpers, but are not sufficient evidence for 33C.

## Goals / Non-Goals

**Goals:** Keep source policy explicit and make an identifiable copy failure survive the complete builder-to-Builds chain, including pending automatic retries, terminal failure, process restart and later recovery. Use the installation root as the sole path basis, even when the selected project is a nested workspace package.

**Non-Goals:** No lifecycle transitions, provider tracking, new settings, configurable exclusions, general filesystem browser, symlink flattening or inference of a link's target. Stage-level install/build failures keep their existing reason codes; console-only tool subcategories are not promoted to a new DTO vocabulary in this session.

## Decisions

### 1. Narrow service-document exclusion; otherwise reject links

Add an exact root-relative exclusion for `AGENTS.md` and `CLAUDE.md`, applied before entry stat/copy and without `readlink`/`realpath`. This supports the reported incidental link while making the absence of these build inputs predictable for regular files too. Do not extend the exclusion to the same basename inside the selected site. Existing excluded subtrees remain pruned before access; an inaccessible excluded `.env` or `node_modules` entry does not fail a build.

All included links, dangling or not, fail as `source_symlink`. Required source components are checked with `lstat` before reads; classify a linked required file as a link failure instead of following it. Include the relative component that failed, not a resolved target. Missing required entries (root `package.json`, `pnpm-lock.yaml`, selected project directory/package, and workspace manifest when required) produce `source_missing`. `EACCES`/`EPERM` during included enumeration, read or copy produce `source_unreadable`; FIFO/socket/device entries produce `source_special_file`. Malformed package JSON, missing Astro declaration, nested lockfile conflicts and invalid selection remain `source_invalid` with a path only for a safely identified source entry, not a submitted configuration string.

Preserve non-dereferencing copy behavior and validate the disposable snapshot for links/special entries before installing, so a source change during copy cannot hand a copied link to the tools. Existing output link validation, version checks, serial execution, cleanup, retention and atomic `current` replacement remain intact. Never read or copy a link target. An unrepresentable filename loses its path only, not its specific reason.

Rejected alternatives: following in-root links would require target containment and still permit ambiguous build inputs; silently dropping every link could produce successful but incomplete sites; rejecting root service documents keeps the reported workflow unnecessarily broken; configurable exclusions would broaden deployment configuration and make required input failures harder to reason about.

### 2. One portable diagnostic contract, independent builder mirror

Define portable failure reasons, source-reason membership and safe-path normalization in `@lacecms/domain`, which already lies below application, DB, contracts and platform adapters. This is pure string/data validation with no Node, REST, Valibot or SQL dependency. Keep `BuildTriggerResult.reason` accepting strings at the adapter seam so unknown/malformed adapters can be safely normalized; add optional `path` to failed results and `recordSiteBuildFailure`, and optional `errorPath` to application build records.

The builder has no runtime workspace dependencies and its Dockerfile copies only its compiled files. Keep its protocol types/validators local and verify exact vocabulary/path-boundary parity with domain in repository tests; do not import a new runtime package without packaging it. Contracts compose the portable constraints with Valibot and export the reason/path schema and inferred types as needed by the admin. Application imports domain, never contracts. Admin imports contracts, never DB/platform/domain implementation modules.

The complete vocabulary has twelve reasons as declared in the proposal. Five are source reasons: `source_invalid`, `source_symlink`, `source_unreadable`, `source_missing`, `source_special_file`. `provider_failed` is the application/storage fallback, not a blanket replacement for recognized failures. Transport failure/malformed builder response remains `trigger_unavailable`.

Path validation uses a 512-character ASCII bound and the segment grammar in the builder delta. Reject excluded sensitive path segments/subtrees using the source credential/environment/Git/CMS-data exclusion rules. Reject a leading slash, drive colon, backslash, control characters, `.`/`..` segments, empty segments and option-like segments. Do not truncate because that can identify the wrong entry. Do not derive paths from thrown error messages or strip arbitrary absolute paths supplied by an adapter. Builder creates the candidate only with `relative(sourceRoot, entry)` plus a containment check. Omit a path for the source root itself, invalid candidates or non-source reasons.

### 3. Additive transport; bound before buffering

Keep existing success `{ status: "succeeded", log: "Static build succeeded." }` unchanged. A failure is `{ status: "failed", reason, log: "Static build failed: <reason>.", path? }` with HTTP 503. `server.ts` constructs this from validated result fields and never serializes an Error. It retains authenticated, closed requests and serial work. The Node adapter accepts both old reason-only and new path-bearing responses; validates status, exact allowed fields, reason and derived fixed log; discards an unsafe string path while keeping the recognized reason. Wrong path types or unknown/extra fields make the response malformed. Limit the response stream to 1024 UTF-8 bytes before JSON parsing; cancel oversize/unreadable responses instead of using unbounded `response.text()`. No provider `log` is persisted or shown.

The triggering build ID supplies correlation; no protocol field or HTTP command/path override is added to requests. Structured operational logs use the known build ID and reason only. Builds explicitly renders that persisted ID.

### 4. Structured storage in existing TEXT with legacy reads

Use a bounded canonical JSON encoding `{ "reason": "source_symlink", "path": "src/components/linked.astro" }` for new path-bearing build errors. Keep reason-only writes as the existing plain string when no path exists. Shared SQL helpers own encoding/decoding. Enforce the same safe reason/path rules on writes and reads, and do not return arbitrary JSON or text. A recognized JSON reason with an invalid optional string path keeps its reason and omits the path; malformed structure/unknown reason falls back to `provider_failed`. This is compatible with legacy rows without a SQL migration; it is not an older-reader compatibility guarantee.

Both Node and D1 repository failure writes update the structured build error and the code-only outbox error inside the existing lease-guarded atomic operation. Do not add a separate path write that can survive a stale lease or diverge from the associated reason. Normal success/acceptance clears the error as before. A new manual retry preserves the original failed row. Accepted-provider completion uses the same safe storage helpers and remains reason-only in this session. Never emit a stored JSON object directly as the DTO `error`.

Rejected alternative: a new `error_path` column is technically possible but adds a schema rollout for optional metadata already representable in the governing architecture's error text. Concatenating reason and path into a human string loses machine validation and risks being rejected by the existing identifier DTO.

### 5. DTO and presentation

The REST change is `error?: ClosedBuildFailureReason` plus `errorPath?: SafeSourceRelativePath`. Require path/error coherence; keep all other fields/statuses unchanged. Regenerate OpenAPI from the route contracts. Node and Worker use the same mapper. List/detail reads remain protected by `content:read`; request/retry permissions remain admin-only.

Builds uses an exhaustive fixed presentation map from reason to explanation and correction. Show a source path as escaped plain text, never a link or rendered markup. Show the build ID in details for correlation. Pending failures include the explanation and a note that an automatic retry is scheduled, using the existing status semantics; they do not get a manual failed-build retry button. Failed builds retain that button for administrators. Avoid deriving paths from current identity and avoid treating a queued/accepted request as a published release. Unit/component tests exercise each reason, path omission, pending failure, role restrictions and clearing on success.

The presentation map covers the following corrections, without echoing arbitrary provider text:

| Reason | Correction / next action |
| --- | --- |
| `source_symlink` | Replace the included link with a regular source entry; excluded root service documents require no correction. |
| `source_unreadable` | Restore read access to the entry and traverse access to its parents for the builder user. |
| `source_missing` | Restore the required entry in the selected installation and retry. |
| `source_special_file` | Remove the special entry or replace it with a regular file/directory. |
| `source_invalid` | Check the operator source/project/output selection, root manifests and selected Astro dependency against the documented layout. |
| `install_failed` | Check that the root frozen lockfile matches package manifests and that dependencies are available to the builder. |
| `build_failed` | Run the selected Astro build locally, correct the site/build output and retry. |
| `version_changed` | Request a build of the latest published version after publication settles. |
| `trigger_unavailable` | Check private builder/provider connectivity and deployment credentials, then retry. |
| `build_timeout` | Check builder/provider availability and build duration before retrying. |
| `invalid_build_event` | Check matched engine versions and ask the operator to inspect the correlated queue event. |
| `provider_failed` | Ask the operator to inspect private builder/provider logs using the build ID and retry after correction. |

### 6. Verification in a packed existing-site production consumer

Extend the generated acceptance harness with a dedicated `builder-diagnostics` phase, exposed as root `acceptance:builder-diagnostics`, that packs the changed packages, generates `cms/` with `--existing-site ..`, installs an independent parent Astro site, and runs its production Compose topology with locally built API/builder images from the current revision. No workspace imports or use of `apps/site` as the selected build source. Reuse existing harness secret scanning, bootstrap, publication, bounded polling and teardown.

Verify a first successful release with root `CLAUDE.md -> AGENTS.md`. Repeat an exclusion success on a workspace fixture at source-unit level. Then, one fault at a time, inject an in-site symlink, an outside-root symlink with a secret sentinel target, an unreadable included file, and a missing required lockfile. Confirm exact reason/path in the authenticated builder result, persisted error, admin list/detail and browser Builds view, while checking unchanged served HTML and `current` pointer. For each failure reach a terminal failed row through eight real dispatcher attempts, correct the input, and exercise the admin Retry action through a successful new release. To accelerate this isolated fixture only, the acceptance harness may set the failing event's `available_at` to the current time between attempts, guarded by unprocessed/unlocked state and the known event ID; it never changes attempts, lease ownership, build status or the production policy. Keep this SQL fixture control outside generated production files and record its use in acceptance evidence.

Unreadable-entry evidence must run as the image's non-root `node` user: chmod-only host tests can pass spuriously as root. Use deterministic injected I/O failures for portable unit coverage and actual unreadability in Linux Docker acceptance. The outside-root sentinel must remain unread and absent from scratch/output/log/HTTP/UI artifacts. Preserve root documentation and operator-owned parent source except for reversible fault fixtures. The evidence document records commands, revision, package/image origin and observed reason/path/release transitions without secrets.

## Risks / Trade-offs

- Root service documents become unsupported build inputs → document the exact exclusion and keep it restricted to the installation root.
- Non-ASCII or unusually named source entries cannot be identified literally → show the specific reason and correction without the unsafe path; test this deliberate omission.
- Path/vocabulary mirrors can drift in the standalone builder → cross-boundary parity tests are required before completion.
- Older readers cannot interpret structured error strings → upgrade API/dispatcher/admin/builder coherently; preserve legacy row support and document downgrade behavior.
- Concurrent host edits can invalidate a copy → never dereference links, revalidate the disposable snapshot and fail safely; do not claim a fully immutable source snapshot.
- Docker permission semantics vary on host mounts → verify with the actual builder identity and record effective permissions; absence of a reproduced unreadable failure is not passing evidence.

## Migration Plan

No SQL migration. Deploy the matched API, dispatcher, admin and builder artifacts together; existing reason-only rows continue to work. New errors with paths use the existing text column. To downgrade, stop dispatch and back up state first; convert only validated structured build errors to their recognized reason strings (discard path metadata) before running older code. Unknown reasons/records remain generic and safe. Do not delete history, change statuses or modify outbox attempts. During implementation update ADR 0004, builder/consumer operations guides, and the 33C roadmap completion entry only after verification passes. Archive only after all tasks and strict validation pass, synchronizing the five verified deltas first.
