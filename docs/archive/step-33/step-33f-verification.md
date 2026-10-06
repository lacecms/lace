# Step 33F verification — explicit Cloudflare credentials

Verified 2026-10-06 on the current branch. Source template is 0.15.0;
package/image coordinates remain 0.1.0-alpha.2. No publication occurred.

## Delivered contract and handoff to 33G

Remote migrate/sync/bootstrap accept `--operator-env <path>` only together with
explicit `--target cloudflare-remote`. The recommended private file is
`.lace/cloudflare-operator.env`; the Cloudflare-only managed example is
`docs/cloudflare-operator.env.example`. Process values override file values,
including empty assignments. Four supported keys: CLOUDFLARE_ACCOUNT_ID,
CLOUDFLARE_API_TOKEN, LACE_D1_DATABASE_ID, LACE_WRANGLER_CONFIG. Files must be
regular, non-symlink, at most 64 KiB and private on POSIX. Loading never executes
file contents or changes the parent environment. Both REST and migration's
Wrangler child receive the same resolved account/token.

`lace cloudflare preflight --target cloudflare-remote --wrangler-auth token|oauth
--operator-env .lace/cloudflare-operator.env --json` reports source categories
and a validated account ID. It checks the Worker DB binding and sends only
SELECT 1. OAuth mode refuses nonempty tokens in the process, .env or .env.local,
including shadowed tokens; recovery removes every assignment and clears the
inherited token. Token mode requires intentional Wrangler process/default-root
loading. No Wrangler process or OAuth cache is inspected or modified.

Preflight does not establish OAuth login/account membership or Workers/Pages
write permissions. Guides require project-pinned `wrangler whoami --account
<account-id> --config worker/wrangler.jsonc` and operation-specific permission
review. Pinned Wrangler 4.129.0 source confirms whoami account/json options and
root dotenv precedence. Split and single-token instructions, permission and
secret-purpose tables live in the generated operations guide. Existing README,
private env files, configuration, Worker settings and site remain user-owned.

33G must reuse these commands, sources and evidence limits, link the operations
reference, retain the managed example, and choose the next unused template
version after 0.15.0. This document supplies the prerequisite contract; 33G is
still a pending proposal and has not been applied.

## Checks

- CLI package suite: 28 files, 255 tests passed, including local workerd tests,
  private-file validation, source precedence, sanitized deadlines/failures,
  remote transport identity, bootstrap/sync authorization, and upgrade tests.
- Generator: 2 files, 50 tests passed. Six generated variants match two
  byte-identical regenerations and managed hashes.
- Release model/artifact and consumer-guide tests: 3 files, 27 tests passed.
- Immutable 0.14.0 baseline: 2 tests passed; fixtures were extracted from
  committed revision 5f7c19b5cc72f7f78640870f04e9c897615cc010, retain their own
  manifest hashes, and were not synthesized by lowering the current version.
- `node scripts/generated-project-acceptance.mjs credentials` passed with packed
  packages installed outside the repository and an offline frozen reinstall.
  The harness imports only installed CLI output, stubs SELECT 1 responses,
  captures migration credentials, and simulates clean split/single-token deploy
  selection plus shell/.env/.env.local contamination. Account-free `cf:build`
  passed. Both default/Cloudflare 0.14.0 and published 0.4.0 projects upgraded,
  refused managed-reference/example collisions, preserved user/private bytes,
  and produced a following no-op plan.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and strict OpenSpec
  change validation passed.

The initial sandboxed consumer install could not finish registry access; the
successful run used permitted network access. Local workerd tests used permitted
local processes/ports. No real Cloudflare login, resource provisioning, D1
mutation, secret upload or deploy was performed. These simulated checks do not
replace the real-account handoff gate.
