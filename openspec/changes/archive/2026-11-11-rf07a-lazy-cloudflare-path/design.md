## Context

`commands.ts` eagerly loads the Cloudflare platform and `d1-transport.ts`; the latter eagerly loads Miniflare, including for remote D1. The platform package also ships `admin/`, used by Worker consumers. See the proposal and `operational-cli` delta.

## Goals / Non-Goals

**Goals:** Isolate Node execution, make installation requirements explicit and preserve operator safety, output, migration behavior and existing cleanup.

**Non-Goals:** Splitting the platform package or altering Worker assets, command parsing, or the RF7C source layout.

## Decisions

1. Dynamically import platform runtime and D1 transport only in Cloudflare branches; keep D1 types type-only. Retain the current local/remote behavior and close semantics. Static imports would continue to couple Node startup to Cloudflare dependencies.
2. Declare Miniflare as an optional peer with a compatible catalog range and a development dependency for workspace tests. Check availability on both Cloudflare targets, as RF7A specifies, and translate only an attributable missing top-level Miniflare module into a `CliError`; preserve other failures. Do not catch arbitrary transitive loading errors as missing peer. Use existing sanitized error handling.
3. Add an explicit compatible dependency to the generated Cloudflare project, update templates, release snapshots and consumer documentation as needed. A transitive Wrangler dependency is not a reliable peer contract under pnpm's isolated resolution. Check Node-only generated projects do not acquire it.
4. Keep `admin/` in the Cloudflare platform package. The CLI's dependency still downloads the bundle; lazy loading avoids execution, not download size. Removing it would break Worker asset delivery unless packaging is redesigned, beyond this session.
5. Test an isolated packed consumer, not only workspace symlinks: block Miniflare resolution/loading in a subprocess for real Node migration; verify local and remote missing-peer failures before network/database access, JSON/error sanitization, successful Cloudflare paths with peer installed, doctor output, and unrelated import failure classification. Retain the existing D1 and migration tests.

## Risks / Trade-offs

- [Peer resolution varies with pnpm layout] → exercise a packed isolated installation and generated consumer; use declared compatible versions rather than relying on hoisting.
- [Failure masked or secret leaked] → narrowly identify the missing package and assert sanitized text/JSON plus unrelated failures.
- [Existing generated installations lack a direct peer] → document the compatible install command and upgrade guidance; restoring the former CLI package and lockfile rolls back the dependency change.
