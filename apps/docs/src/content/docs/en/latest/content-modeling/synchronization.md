---
title: Synchronize configuration
description: Review model evolution and apply it explicitly to stored content.
---

Editing `lace.config.ts` does not update stored models on startup. Migration changes the database schema; synchronization changes configured content models. Neither operation publishes your editorial drafts.

For a generated Node project, stop the services using the SQLite file:

```sh
docker compose stop api dispatcher
pnpm content:sync --check
pnpm content:sync
pnpm dev:api
```

Check mode is read-only and exits nonzero for pending or incompatible work. Read diagnostics before applying. Repeating unchanged configuration is a no-op. A stale-plan conflict means state changed after planning: rerun to review current state. A rename needs explicit `renamedFrom` evidence; the planner never guesses it from removal/addition.

## Evolve safely

Increase the model version for structural changes. Populated snapshots have guarded compatibility rules: do not remove or change data types assuming the engine will invent a conversion. Supported defaults/rename hints have explicit rules, including nested group/list evolution. Block data evolves through declared block versions and migrations during sync, not lazily during reads. Back up data and test the intended evolution against a restored copy first.

Sync may update stored published representation when a schema/default/projection change requires it; it advances public state and requests/coalesces a build according to the accepted synchronization rules. That is distinct from an editor publishing a draft. Never run an older engine against incompatible content without a matching restoration or explicit validated conversion.

For Cloudflare, use the generated local `cf:content:sync` while local dev is stopped, or select the remote target and private operator file explicitly. The local command never updates your account. See [Cloudflare deployment](../../deployment/cloudflare/).

## Collection query metadata and public identity

`listOptions` changes are projection-only and do not require a model version
increase or content rewrites. Deploy migration `0011_public_projection_identity`
before the new API/admin, then run normal sync. It adds nullable public identity
and source-hash columns only; it performs no content backfill or query indexing.

Full projection identity includes query settings. Public identity omits only
root collection `listOptions`, keeping labels, visible columns, SEO and block
metadata. With a trusted stored public baseline, query-only enable/edit/remove/
reorder updates metadata without advancing published state or requesting builds.
Mixed SEO/public changes still request a build. Legacy records initially have
unknown public identity: an unchanged full hash, or equality with the configured
public hash on first enablement, proves safe baseline seeding without a build.
If neither proof holds, sync conservatively rebuilds once and records the pair
atomically. Repeating unchanged sync then writes nothing.

Roll back code/config together while retaining the additive columns and migration
history. Older code can leave public identity stale when it updates the full
hash. Re-upgrade trusts a baseline only when its source equals that full hash;
otherwise it uses the same legacy proof/fallback. Do not drop columns, rewrite
snapshots or claim every legacy query update can skip a build.
