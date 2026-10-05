## Context

See proposal.md. CLI remote sync/bootstrap use `loadEnvironment` and the D1 REST transport; remote migration invokes installed Wrangler from the config directory, currently inheriting `process.env`, and then reads the D1 ledger. Doctor separately reads root `.env` and intentionally never exposes setting values. Its bounded file/request helpers are suitable for reuse, but its output/target contract should not be broadened incidentally.

The current generated Cloudflare guide and handoff invite storing a D1 token in root `.env`. Inspection of installed Wrangler 4.129.0 confirms CLI startup loads root-working-directory `.env` then `.env.local` with process settings overriding files; `whoami --json` reports authType/accounts/tokenPermissions. OAuth whoami may refresh cached credentials and Wrangler logging creates files. A read-only Lace preflight therefore must not invoke it. The operator runs whoami separately before account mutation.

Sources consulted on 2026-10-06: [system environment variables](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/), [general commands](https://developers.cloudflare.com/workers/wrangler/commands/general/) and [Workers permissions](https://developers.cloudflare.com/workers/authorization/workers/). Current docs can differ from pinned behavior; installed code and help govern command syntax. Wrangler token introspection is not complete proof of Workers/Pages write permission.

## Goals / Non-Goals

**Goals:** one remote credential resolution contract, explicit credential choice before remote work, safe recovery from hidden dotenv overrides and observable evidence limits.

**Non-Goals:** automatically logging in, copying/refreshing OAuth state, adding deploy wrappers, probing write permissions through mutation, changing doctor or platform/domain interfaces, or restructuring scenario guides in 33G.

## Decisions

### 1. Explicit file option rather than global implicit loading

Add `operatorEnv` to operational CLI options and a small CLI-owned resolver used by remote commands/preflight. `--operator-env` requires the explicit remote selector and a single nonempty argument; it is rejected for local/Node/env prepare. The resolver reads a bounded regular non-symlink file, checks POSIX private permissions and unique valid supported assignments, and parses dotenv data without execution. Supported names are `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `LACE_D1_DATABASE_ID` and `LACE_WRANGLER_CONFIG`; no arbitrary NODE_OPTIONS or subprocess settings enter the environment. Process settings take precedence, including empty strings, without assigning to process.env. Preserve externally loaded/process remote commands when the option is absent.

The recommended private file is `.lace/cloudflare-operator.env`. A managed, empty example lives at `docs/cloudflare-operator.env.example`, classified only for Cloudflare generation. `upgrade-input.ts` rejects `.lace` managed paths, so the example must not be placed there. The actual private file is outside inventory and explicitly ignored. Manual protected creation uses a restrictive umask and refusal to replace existing files; generation/upgrade/preflight never create or move a real token. Add root `.env.local` ignore coverage as well as the private file so legacy storage does not accidentally enter source control.

Rejected: automatic private-file loading (hidden account selection), putting a token in root dotenv (Wrangler OAuth collision), or making the private runtime file managed (credential overwrite). No new dependency is needed.

### 2. Migration child uses the resolved D1 identity

Extend migration input with resolved remote account/token and pass them explicitly in the child environment only for remote migration. This overrides Wrangler's dotenv precedence for that operation, matching the REST ledger/sync/bootstrap identity. Do not put token values in argv or spread private-file entries into an unbounded child environment. Parent process settings and subsequent independent Wrangler invocations are unchanged. Local migration remains on existing simulated-state behavior.

Provider mutations retain existing explicit targets, migration order, sync transactions and setup guards; a resolver failure occurs before command execution. No persistence schema or migration changes are required.

### 3. Separate bounded preflight with an explicit Wrangler choice

Implement `lace cloudflare preflight --target cloudflare-remote --wrangler-auth token|oauth [--operator-env <path>] [--json]` as a separate bin dispatch and CLI module. This avoids changing doctor's accepted report secrecy/target semantics. Require account, D1 and config selection; preflight validates a 32-hex account ID, refuses the known placeholder D1 ID and verifies the DB binding with existing logic before contacting D1. Operational commands retain their existing compatible settings validation; the stricter account presentation rule belongs to preflight.

Determine Lace provenance from the resolver. Read root `.env`/`.env.local` as bounded files to inspect the inputs pinned Wrangler would receive for commands run from the generated CMS root, with explicit `--config worker/wrangler.jsonc`. Process values win, `.env.local` wins over `.env`; report only source categories. In OAuth mode reject a nonempty token in any of those locations, even a shadowed assignment, and explain clearing all locations. In token mode require an intended root/process token; a token confined to the private file is not automatically inherited by unrelated Wrangler, so document a single-command explicit Node env-file invocation for Wrangler and preflight on the same explicitly loaded process environment. Report credential equality as a boolean, never as a hash or value.

Reject alternative `CLOUDFLARE_API_KEY`/`CLOUDFLARE_EMAIL` authentication and active environment/profile selectors that would change the inspected default dotenv lookup rather than pretending to cover them. Check process and both dotenv inputs for account selections conflicting with the resolved Lace account, failing before a provider request. Do not scan arbitrary parent directories or named deployment environments. This contract is for the documented root/default-config workflow; the report states that scope.

Run a bounded read-only D1 `SELECT 1` through the explicit provider endpoint with redirects disabled. It is an authorization/read-evidence probe, not a migration or write test. 401/403 has D1 scope/account recovery; transport/malformed/timeout errors have fixed infrastructure guidance. No raw provider body reaches output. Root/credential bytes and OAuth state remain unchanged, including concurrent preflights. A successful report includes the validated account ID, source categories, ordered checks and explicit `unverified` claims for OAuth login/account membership and Workers/Pages writes.

Use stable PREFLIGHT_OK/0, CONFIG/4, OPERATION_FAILED/6 and USAGE/3 with deterministic precedence; skip dependent checks after configuration failure. Reuse 64 KiB limits, five-second per-probe and thirty-second overall deadlines. Never echo private file paths, tokens, emails or raw exceptions. A trusted account ID is the sole deliberately printable setting here; doctor retains its stricter behavior.

Rejected: launching whoami inside preflight (OAuth/cache/log writes), parsing human tool output, or claiming token presence/read access proves deployment permission. The required next step is operator-run project-pinned whoami and reviewed permission checklist before deploy/secrets.

### 4. Deliver two concrete credential journeys and manual alpha.2 migration

Keep root generation cf scripts local-only. Show remote CLI examples with explicit target/file option; remote doctor can use explicit Node env-file loading if needed without changing doctor. In the split journey, login once with a clean shell/default dotenv, place only D1 operator credentials in the private file, run preflight, migrate/sync and use independent OAuth Wrangler commands. Before deploy/secrets rerun preflight and whoami, with the same root working directory and explicit Worker config. Removing a shell token alone is insufficient if root dotenv can reload it.

In the single-token journey document required scopes separately for D1, Workers scripts/secrets, provisioning R2, Pages, optional KV and custom-domain routes. Supply the private token to the intended Wrangler command explicitly, never root dotenv. The pinned Node env-file mechanism does not source shell code. Explain LACE_AUTH_SECRET as Worker runtime/session configuration and OAuth as management authentication, with build/setup/Pages tracking tokens separate. Review current permission names against pinned tool behavior and primary docs; scopes not independently tested remain a checklist, not a success claim.

For alpha.2 migration, retain `.env`/`.env.local` and all user files in upgrade, then give manual move/remove/unset/recheck instructions. Do not print token values while editing or suggest shell-history-visible inline token commands. Managed operations/README-generation/handoff docs describe the current behavior and its required new CLI; old README remains user-owned. Advance template inventory, upgrade JSON and release template metadata to `0.15.0`; package/image prerelease selection and publication stay separate. 33G then selects the following unused template after this change is accepted.

## Risks / Trade-offs

- Source preflight cannot prove OAuth or write authorization → mark it unverified and require separate whoami/permission review before deploy; provider mutations remain manual.
- Stale token in any implicit dotenv location → inspect both inputs and fail OAuth choice until all token assignments are removed.
- Resolver and migration child diverge → tests assert explicit child environment and REST transport use identical selected credentials.
- Default-workflow inspection could misdescribe named environments/profiles → reject unsupported selectors and state root/default lookup scope.
- Example/private file ownership confusion → managed example lives in docs; ignored private runtime file is never in upgrade inventory.

## Migration Plan

No database migration or architecture invariant changes. Deliver new CLI plus template `0.15.0`; upgrade managed references/example/ignore settings with existing conflict detection. Operators create a protected private file and manually remove legacy token assignments from root dotenv and inherited environment, then rerun preflight and whoami. Credentials are never migrated by the tool.

Verify with sentinel credentials and mock D1 responses/subprocesses, then an isolated packed CLI consumer. Tests include simulated login/OAuth selection followed by D1-only migration/sync and deploy credential selection for shell, `.env` and `.env.local` contamination; real-account login/deploy remains unverified release-gate work. Record that distinction in 33F evidence and the roadmap. Archive only after completed apply and strict validation under explicit user authorization; commit completed work in the current branch.
