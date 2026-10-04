# Lace operational CLI

Build the workspace packages, then run `pnpm lace --help` in this repository or `pnpm exec lace --help` in a generated project. Commands are `db migrate`, `content sync [--check]`, and `auth bootstrap`. Each supports `--json` and `--target node|cloudflare-local|cloudflare-remote`.

Deployment order:

1. Select a target and export its environment variables. The default `node` target requires `LACE_DATABASE_PATH` and never selects Cloudflare implicitly. For `cloudflare-local`, set `LACE_D1_DATABASE_ID` and `LACE_CLOUDFLARE_PERSIST_TO`. For `cloudflare-remote`, set `CLOUDFLARE_ACCOUNT_ID`, `LACE_D1_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN`; pass `--target cloudflare-remote` explicitly. D1 migration also needs `LACE_WRANGLER_CONFIG` pointing to a Wrangler file whose `DB` binding matches the selected ID. In this repository the default is `apps/api/wrangler.jsonc`.
2. Run `lace db migrate --target <target>` before starting the API. Startup does not run migrations. Readiness stays unavailable until the checked-in migrations are installed.
3. Run `lace content sync --target <target>` to apply the existing guarded configuration plan. Use `lace content sync --check --json` in CI; exit `0` means current and exit `2` means pending changes. An invalid plan exits `6` without mutation.
4. Run `lace auth bootstrap --target <target>` only during first-admin setup. Capture its one-time token securely and submit it with email and password to `/api/v1/setup/admin` before expiry. Once setup completes, the command refuses another token.

Exit codes: `0` success, `2` sync pending, `3` command usage, `4` missing or invalid configuration, `5` missing migration, and `6` failed operation. `--json` prints one result object to stdout, including one-time token data only for successful bootstrap. Other failures print sanitized diagnostics and no supplied secret value. The CLI never prompts, including in CI.

Failed commands also include `operation`, `reason` and `nextAction` strings. Human output shows the same information as Operation, Reason and Recovery. Existing `ok`, `code`, `message`, reports/data and process exit codes remain available; successful responses are unchanged. Upgrade's existing `recovery` state object is preserved separately from `nextAction`.

For example, a sync against an unmigrated Cloudflare-local installation returns exit `5` and one object like:

```json
{
  "ok": false,
  "code": "SCHEMA_OUTDATED",
  "message": "D1 schema is outdated. Run `lace db migrate --target ...` first.",
  "operation": "content sync",
  "reason": "The selected database is missing or its migration ledger is outdated.",
  "nextAction": "Run lace db migrate --target cloudflare-local with the same settings, then retry the original command."
}
```

Denied access advises checking database/project and parent permissions; unusable paths advise correcting the configured file/directory shape; database locks advise waiting before retrying. Invalid settings name only settings, and invalid `lace.config.ts` directs you to its root export/model definitions. Missing/outdated schemas recommend explicit migration for the selected target. D1 connectivity and authorization failures use operation exit `6`, with service/credential-permission guidance rather than a false migration diagnosis. Wrangler failures never forward subprocess output. Unrecognized failures use fixed safe guidance without raw exceptions, stacks, paths or secret values.

Pending sync retains exit `2`; review the plan before explicitly applying. Blocked sync retains exit `6` and its model diagnostics; restore compatible configuration or plan an explicit content migration. Completed bootstrap retains `OPERATION_FAILED`/exit `6` and directs you to sign in with the existing administrator; it cannot reveal another setup token. Recovery guidance does not execute commands or switch targets. Upgrade conflicts, locks and interrupted operations retain the reports and recovery rules below.

## Read-only environment doctor (Step 27A)

Run doctor from the installation root using a CLI packed from Step 27A or a later compatible release. Previously published alpha packages are not retroactively updated.

```sh
pnpm exec lace doctor --target node --mode compose --stage setup
pnpm exec lace doctor --target node --mode compose --stage ready --json
pnpm exec lace doctor --target node --mode native --stage setup
pnpm exec lace doctor --target cloudflare-local --stage setup --json
pnpm exec lace doctor --target cloudflare-remote --stage ready --json
```

Both target and stage are required. Node defaults to native mode; `--mode` is invalid for Cloudflare. Doctor rejects extra/duplicate arguments and `--check`. It reads a regular root `.env` without executing or interpolating its contents, then overlays process environment (including explicitly empty values). No `.env` is required if settings are exported. Symlinks, nonregular files and files larger than 64 KiB fail safely. Compatibility comes from this project's `engines.node` and `engines.pnpm`, rather than engine-workspace defaults. Doctor does not evaluate `lace.config.ts`.

The `site` check reads `.lace/manifest.json` and is skipped without one. Site mode `none` passes without probing `site/`. For `starter` and `existing`, a missing site directory or one without `astro.config.*` and an `astro` dependency fails as configuration (exit `4`); missing `@lacecms/astro`/`@lacecms/render` (nearest `node_modules`, walking up from the site), `lace.site.json` or its block map is expected during `setup` and fails during `ready`, with `pnpm exec lace add block --all --site <path>` as the next action.

Native mode checks Node runtime variable names, plus `LACE_API_BASE_URL` for anonymous readiness. Compose mode checks generated host inputs: `LACE_DATABASE_PATH`, `LACE_PUBLIC_BASE_URL`, `LACE_API_BASE_URL`, `LACE_AUTH_SECRET`, root MinIO access/secret keys, `LACE_BUILDER_SECRET` and API/builder image declarations. Bucket, region, timeout and API/HTTP ports follow generated Compose defaults. It checks the generated `.lace/data/lace.sqlite` host bind mount; custom mounts need a separately reviewed deployment configuration. It does not require host settings for container-internal MinIO endpoints or paths. Only Compose mode probes Docker Compose and daemon availability; it never starts containers, renders secret-bearing Compose configuration or pulls images.

Cloudflare checks the installed project-local Wrangler package/executable metadata without launching Wrangler, and requires `LACE_WRANGLER_CONFIG` to contain a matching `DB` binding. Local needs `LACE_D1_DATABASE_ID`, `LACE_CLOUDFLARE_PERSIST_TO` and a loopback `LACE_API_BASE_URL`; remote needs the explicit account, D1 ID and API token. Local diagnosis never starts Miniflare or inspects/creates offline D1 files. Local migration readiness is derived from the selected Worker's existing `/health/ready` contract; configure that URL to identify the intended Worker. When it is offline, migration inspection is skipped. Remote diagnosis sends only a migration-ledger SELECT to the fixed D1 provider endpoint. The generated Pages-only Wrangler file does not provide CMS bindings; complete generated Worker onboarding remains Step 31 work.

Checks have stable IDs, symbolic codes, `reason` and `nextAction`, with status `pass`, `expected`, `fail` or `skipped`. During `setup`, absent databases/ledgers, pending migrations, unavailable APIs and empty build tokens are expected next steps. During `ready`, they fail. Denied access, locks, corrupt files, invalid settings, missing tools, rejected authorization, malformed responses and reachable-but-not-ready APIs fail in both stages. Dependency skips name their prerequisite; irrelevant checks remain skipped. A present build token is **unverified**; doctor never sends it or claims successful authentication, sync, storage, publication or deployment.

SQLite inspection is read-only and never creates parents, databases or journal sidecars. WAL databases are refused with `DATABASE_UNAVAILABLE`: even read-only SQLite can change existing SHM reader marks. The separate API readiness result still explains service readiness. If an independent offline ledger check is needed, stop **all** API/dispatcher/CLI database users, back up the database with trusted SQLite tooling, then explicitly run `PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;` using that tooling. Verify checkpoint success before running doctor. These are deliberate operator writes, never doctor actions; normal Lace startup restores WAL mode. Do not switch an active database to immutable mode or discard WAL/SHM files.

Each probe has a five-second limit, the whole report a thirty-second limit, and process/file/HTTP output a 64 KiB cap. Timed-out subprocess groups are terminated; HTTP redirects are rejected and readiness sends no credentials. Doctor never migrates, syncs, bootstraps, creates secrets, installs tools or writes configuration/cache/log files.

JSON prints one object with `ok`, `code` (`DOCTOR_OK`/`DOCTOR_FAILED`), `message`, `operation`, `reason`, `nextAction` and `data` containing target/stage/mode and ordered checks. Human output shows the same statuses and guidance. There are no raw subprocess/provider outputs, paths, secret values, timestamps or durations. Exit precedence for reports is `4` for failed project compatibility/settings, then `5` for failed migration state, then `6` for infrastructure/probe failure, otherwise `0` for passing or expected setup checks. Invalid arguments use `USAGE`/`3`. Expected setup does not mean the installation is ready.

## Upgrade review and apply (Steps 24A–24B)

`lace upgrade` defaults to a read-only plan. Prepare a pristine project with the target generator release in a separate, non-overlapping parent directory, using the same project basename, site mode (`--starter`, `--existing-site <path>` with the same path, or `--no-site`) and optional `--cloudflare` setting as the installed project. Planning refuses a template whose `.lace/manifest.json` site record differs and names the matching flags; a manifest without a site record is read as starter mode with path `site`, and an applied upgrade records the target's site. An existing-site target must be generated next to an Astro project at that path, for example inside a copy of the site. Its `.lace/manifest.json` and managed bytes are the target template; the installed manifest hashes represent the old template. For example, with `/work/my-site` as the installed project and a reviewed target generator release:

```sh
mkdir -p /work/upgrade-target
cd /work/upgrade-target
pnpm dlx create-lace@<target-release> create my-site --starter
cd /work/my-site
pnpm exec lace upgrade --template /work/upgrade-target/my-site
pnpm exec lace upgrade --template /work/upgrade-target/my-site --json
```

Replace `<target-release>` with an explicit compatible generator release. The planner does not download releases or choose a version. A different project basename will produce name changes in the diff. Different generator options can propose additions/removals of deployment files; review those decisions explicitly. Use physical directory paths: symbolic links in inspected paths are rejected.

`--project <dir>` selects the installed project explicitly; otherwise the current directory is used. No database, runtime credentials, config evaluation, or remote access is needed, including for Cloudflare. `--help` describes the command. JSON contains one object with `ok`, `code`, `message` and `data`; the plan includes sorted decisions, source/target template versions, hashes, unified diffs and change/conflict counts. Text diffs use whole-file hunks; binary differences get a notice. Plans contain the working deployment bytes in their diffs, so review their contents before sharing them.

Actions are `add`, `replace`, `remove`, `current`, `preserve` and `conflict`. Dependency and container-image updates are ordinary replacements when the working managed file still matches its baseline hash. Local edits are preserved when the template has not changed, and conflict when an upgrade would replace or remove them. A working file already equal to the target is current. Existing user-owned paths, `site/**` and `lace.config.ts` are preserved, and untracked files remain untouched. A newly managed path that already exists conflicts. Ownership changes from managed to user also need explicit resolution.

Upgrade exit codes are `0` for a conflict-free plan (including pending changes) or successful operation, `2` for conflicts, `3` for invalid arguments, `4` for invalid/missing manifests or unsafe inputs, and `6` for inspection, mutation, recovery or concurrency failures. All dry runs leave both directories unchanged, including manifests, locks and artifacts. Dry runs identify unfinished operations with `UPGRADE_RECOVERY_PENDING` and exit `6`; that partial tree is not a completed installation.

After reviewing the plan, stop deployments and edits to managed files for the operation, keep a project/database backup, and explicitly apply:

```sh
pnpm exec lace upgrade --template /work/upgrade-target/my-site --apply
pnpm exec lace upgrade --template /work/upgrade-target/my-site --apply --json
```

Apply rechecks inspected bytes, stages recovery data before the first working-file mutation, atomically publishes each replacement, preserves existing file permissions and writes the new manifest last. The whole tree is not one atomic filesystem transaction; do not deploy a tree with pending recovery. Node and Cloudflare projects use identical ownership rules. Upgrade does not install packages, load configuration code, contact runtime services or migrate databases.

If **any** plan decision conflicts, apply leaves every working managed file and the installed manifest unchanged. Review `.lace/conflicts/<version>/index.json`, exact proposed managed bytes at `proposed/<path>`, and diffs at `diffs/<path>.diff`. Deletion and ownership-transfer conflicts are explicit records without invented proposed bytes. Identical repeat requests reuse artifacts; edited or different artifacts are preserved and cause a refusal. Move/preserve an older review bundle before publishing a revised one.

Resolve conflicts explicitly in working files: restore the old pristine managed bytes to allow the replacement, or copy accepted exact target bytes after review. Ownership transfers need an explicit, schema-valid inventory decision in `.lace/manifest.json`; keep `site/**` and `lace.config.ts` user-owned. A custom merged file can still conflict: the CLI never silently accepts a merge or blesses local bytes as a pristine baseline. Rerun the dry run, then apply. Never resolve a conflict just by changing a managed baseline hash to an unreviewed local file's hash.

## Interrupted upgrades and filesystem rollback

Recovery metadata lives in `.lace/upgrade/transactions/<operation-id>/`: exact old/new manifests, before-images, proposed managed bytes and guarded operation metadata. `.lace/upgrade/latest.json` records `applying`, `applied`, `rolling-back` or `rolled-back`. Records are private because managed deployment files may contain local secrets; do not share them. Successful repeat apply reports `already-current` and preserves the original rollback checkpoint.

After an interrupted apply, inspect the dry run and repeat the same `--apply` command with the pristine target. The target's manifest and instructions must match the saved operation; its filesystem location may differ. Recovery needs no old pristine template, because saved before-images retain its relevant bytes. Unexpected working-file edits, changed permissions, corrupt saved bytes or a different target cause a refusal. Preserve those edits externally, review the affected path, then restore a recorded pre/post state before retrying; there is no force-overwrite flag.

To undo the latest recorded completed or partial filesystem upgrade, without either template directory:

```sh
pnpm exec lace upgrade --rollback
pnpm exec lace upgrade --rollback --project /work/my-site --json
```

Rollback validates all affected paths before restoration, restores original bytes/permissions and missing-file states, and writes the original manifest last. It preserves user source and refuses subsequent unexpected managed-file edits. Repeat an interrupted rollback using `--rollback`; an apply cannot reverse that recovery direction. Repeating a completed rollback is safe. `--rollback` cannot be combined with `--template` or `--apply`. Only the latest operation is selected; older records are retained for inspection, not a historical rollback stack.

Only one mutation can run per project. A dead local owner of `.lace/upgrade/lock.json` can be reclaimed after checking process liveness. A foreign/uncertain owner or leftover short acquisition gate `.lace/upgrade/lock-access.json` causes `UPGRADE_BUSY`. For manual lock recovery, first verify there is no active apply/rollback process on this filesystem (including another host), preserve owner records, then remove only the stale lock/gate. Keep `latest.json` and transaction data. Removing a lock is not conflict resolution.

After a completed, reviewed operation and a separate backup, an operator may remove old transaction directories that are not selected by `latest.json`. Keep the latest transaction for rollback. Unpublished `.stage-*` directories or `.tmp` metadata from a crash before journal publication may be cleaned only after verifying no upgrade runs; published recovery records must remain intact. The CLI cleans its recorded per-file temporary names when resuming. Process-interruption recovery is supported; it does not promise protection against damaged disks/filesystems.

## Target-version migration instructions

A release/template may optionally provide `.lace/upgrade-instructions.json`:

```json
{
  "schemaVersion": 1,
  "templateVersion": "0.3.0",
  "database": ["Back up the selected database before running its explicit migration command."],
  "configuration": ["Review required lace.config.ts changes, then explicitly synchronize configuration."]
}
```

The exact shape above is required: matching target version, no extra keys, at most 100 nonempty plain-text strings per list and 8,000 characters per string. Tab/newline are allowed; terminal control characters are rejected. Review/apply output includes this guidance (JSON review fields `instructions` and `guidance`; mutation fields `data.instructions` and `guidance`). Older templates without this file remain supported and report that version-specific instructions were not supplied. Applied records retain the guidance for recovery output. Text is displayed and never executed.

After a reviewed upgrade, install reviewed dependencies as needed and follow target release guidance and explicit deployment steps, choosing the correct runtime:

```sh
pnpm exec lace db migrate --target node
pnpm exec lace content sync --target node
```

Use `--target cloudflare-local` or explicitly `--target cloudflare-remote` with its required settings for Cloudflare. Migration/config synchronization order follows the reviewed release and deployment plan; upgrade does not run either command. Filesystem rollback **does not undo database migrations**, uploaded objects or content. Restore database/object backups separately if the release requires data rollback.

## Local environment preparation

From a generated project root, run `pnpm env:prepare` (or `lace env prepare [--json]`) after installing packages and before loading `.env`. This command needs no database settings, target selection or running services. It creates `.env` from a regular `.env.example`, generates auth/MinIO/builder credentials, preserves other settings and leaves `LACE_BUILD_TOKEN` empty for later issuance in Settings. Secrets are never printed. POSIX permissions are `0600`; verify owner-only ACLs on Windows.

An existing `.env` is never overwritten, even by concurrent preparation. Retain it and review settings privately; preparation does not rotate credentials. Templates require exactly one single-line assignment for each of the four generated credential names and `LACE_BUILD_TOKEN`. Errors provide sanitized operation/reason/nextAction guidance. JSON is one object: success `ENV_PREPARED` (exit 0), usage `USAGE` (3), template `CONFIG` (4), filesystem/existing destination `OPERATION_FAILED` (6).

Publication requires same-filesystem hard links. Normal failures remove private staging; forcible termination may leave ignored `.lace-env-*` directories, which may be removed after confirming no preparation process is running. `.env` remains absent or complete. This flow requires source/packed packages containing Step 26C; it does not alter previously published alpha artifacts.
