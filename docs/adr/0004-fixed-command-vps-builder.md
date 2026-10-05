# ADR 0004: Use a private fixed-command VPS builder

- Status: Accepted
- Date: 2026-09-07
- Governing architecture: [section 5](../mvp-architecture.md#5-system-context) and [section 9.8](../mvp-architecture.md#98-outbox-and-site-builds)

## Context

VPS deployment must rebuild the Astro site after publication without converting
an HTTP request into arbitrary command execution. Publication must remain durable
when the builder is offline or fails.

## Decision

The first-party `apps/builder` service is private and accepts an authenticated
trigger containing only build ID and target published-state version. It rejects
caller-supplied command, path, and environment overrides. Its image defines the
single build command and fixed read-only source/output mount paths. It installs
with an image-pinned toolchain and frozen lockfile, builds a temporary release,
and atomically switches the served release only on success.

The API dispatches through the outbox and `SiteBuildTrigger`; builder failure
leaves a recoverable pending or failed build state without undoing publication.

### Source policy and diagnostics (2026-10-05, Session 33C)

The exact installation-root `AGENTS.md` and `CLAUDE.md` entries are excluded
before target inspection, whether regular files or links. Existing sensitive
and generated exclusions remain. Every other included link is rejected without
following its target, including in-root links; source selection and output also
remain link-free. A disposable copy is validated before tools run.

Known failures retain their closed reason through the authenticated result,
Node trigger, dispatcher, SQLite/D1 persistence and admin DTO. Source failures
may identify one validated installation-relative ASCII entry, bounded to 512
characters; absolute roots, link targets, credentials, excluded private paths
and raw subprocess/provider output remain forbidden. Unrepresentable entry
names lose the path only. Responses are bounded to 1024 bytes. Builds shows the
reason, correction and build ID; `provider_failed` is reserved for unknown
failures. The entry path is diagnostic data, never an input to a command or a
filesystem endpoint.

Path-bearing errors use validated JSON in `site_builds.error`; legacy reason
strings remain readable. Writes use the existing lease-guarded atomic operation;
outbox errors and operational logs remain code-only. No SQL migration or build
status change is introduced. Coherent upgrade and downgrade instructions are in
the [builder guide](../../apps/builder/README.md#source-failures-33c).

Following in-root links and silently excluding all links were rejected: the
former changes the executable input boundary and the latter can build an
incomplete site. Service-document exclusions are fixed and limited to the root.

## Consequences

- Authenticated callers cannot use the builder as a shell or filesystem oracle.
- Publication and build success are distinct observable states.
- Deployment needs an API-to-builder secret and topology with no public builder
  port.

## Alternatives considered

- Arbitrary commands, paths, or environment values were rejected as a remote
  command-execution and data-exfiltration boundary.
- Synchronous builds in the API were rejected because build latency and failure
  would make publication unavailable.
- CI-only webhooks were rejected because the MVP needs a self-hosted first-party
  VPS path; later adapters may use CI through the same trigger port.
