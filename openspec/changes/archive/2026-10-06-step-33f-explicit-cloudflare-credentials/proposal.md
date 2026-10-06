## Why

Roadmap Step 33, Session 33F fixes an authentication switch during Cloudflare onboarding: the existing guide places a D1-scoped operator token in `.env`, which pinned Wrangler loads before deploy and secret commands, overriding the intended OAuth session. Operators need explicit credential separation and a read-only report before remote work.

## What Changes

- Deliver a managed, credential-free `docs/cloudflare-operator.env.example` in Cloudflare projects. Its runtime copy `.lace/cloudflare-operator.env` is private, ignored and user-owned; operators create it manually with owner-only permissions. It contains remote account/database selection and `CLOUDFLARE_API_TOKEN`, outside Wrangler's implicit dotenv paths.
- Add explicit `--operator-env <path>` loading for remote migrate/sync/bootstrap and the new `lace cloudflare preflight --target cloudflare-remote --wrangler-auth token|oauth [--operator-env <path>] [--json]`. Load only that file when selected; process environment overrides it. Keep legacy process-environment remote commands supported and never auto-select remote work.
- Preflight reports the sanitized credential source for Lace and the source Wrangler would select from the current shell/root `.env`/`.env.local`, plus the validated selected account ID. It performs a bounded read-only D1 authorization probe and identifies shadowing/conflicts with a next action. OAuth availability and Workers/Pages write permissions remain explicitly unverified; the guide requires separate pinned `wrangler whoami` and operation-specific permission review before deploy/secrets.
- Ensure remote migration's Wrangler child receives the resolved operator token/account explicitly, without mutating the parent shell or propagating them to unrelated Wrangler commands.
- Document two supported choices: one sufficiently scoped token supplied explicitly to both tools, or the private D1 token for Lace plus OAuth for Wrangler. Explain auth-secret/token/OAuth roles, clear shell and implicit dotenv contamination before OAuth, and upgrade alpha.2 projects without moving credentials automatically.
- Advance the ownership template from `0.14.0` to `0.15.0`, update managed metadata/snapshots and preserve user README, `.env`, Worker config and site source. The existing 33G proposal follows this prerequisite and chooses its subsequent unused template version.

Dependencies: delivered 33A–33E, pinned Wrangler 4.129.0 and existing CLI/doctor bounded-probe conventions. Architecture §§4.8, 5–7, 18, 21–22 and the accepted operational/generator/Worker contracts remain authoritative. No automatic deployment, migration, secret upload, OAuth login/refresh or remote target inference is introduced.

Non-goals: executing real-account mutations, certifying every provider permission without evidence, changing Worker runtime secrets or Pages tracking, new credential storage services, 33G guide restructuring/minimum policy, 33H release selection and registry publication.

## Capabilities

### New Capabilities

- `cloudflare-operator-credentials`: explicit private-file resolution and secret-safe read-only credential/source preflight.

### Modified Capabilities

- `operational-cli`: explicit remote credential-file option and consistent migration subprocess credentials.
- `project-generator`: classified remote credential example, ignore rules and ownership-safe template upgrade.
- `generated-project-onboarding`: credential choices and legacy alpha.2 migration guidance.
- `alpha-release-artifacts`: coherent current template metadata independent of the next package/image release selection.

## Impact

`packages/cli` owns parsing, bounded file resolution, preflight output and migration child environment; no application/domain/adapter dependency changes are needed. `packages/create-lace` owns the example, inventory, docs and snapshots. Repository handoff/compatibility docs and focused CLI/generator/packed-consumer tests verify the contract. No database migration or new dependency is required. Preflight is a separate command, preserving doctor's existing target/stage/output semantics and its prohibition on exposing setting values.
