# CMS 1.1.0 release handoff

The release uses npm `latest`, GitHub tag `v1.1.0`, versioned API and builder
images for Linux amd64 and arm64, and ownership template `0.53.0`. The
[verification record](verification.md) describes local evidence. Stage the
exact candidate on a real VPS with SQLite/SILO and a Cloudflare test deployment
with remote D1/R2 and the real Images binding. Use coordinated backups and run
the upgrade, rebuild and restore procedures before approval. See the
[operator procedure](../../../../apps/docs/src/content/docs/en/latest/operations/index.md#upgrade-and-roll-back)
and the [real infrastructure checks](../../../../docs/verification.md#owner-checks-on-real-infrastructure).

## Build and verify

The locally verified set is `.release-artifacts/1.1.0-a67c95ff-local`.
Its source commit is a temporary local revision. Use the following commands
for the release set based on the final source revision.

Run from the clean reviewed source commit that will be tagged. Make that commit
available in the source repository and choose a new artifact directory.

```sh
candidate=.release-artifacts/1.1.0
pnpm install --frozen-lockfile
pnpm release:check
pnpm release:plan
pnpm release:prepare --output "$candidate"
pnpm release:verify --output "$candidate"
pnpm acceptance:release --artifacts "$candidate"
```

For targeted checks with workspace-built candidate artifacts, run
`node scripts/generated-project-acceptance.mjs upgrade-node` and
`node scripts/generated-project-acceptance.mjs upgrade-cloudflare`.

## Publish the verified artifacts

Authenticate locally to npm, GHCR and GitHub. Review the publication plans.

```sh
pnpm release:publish:npm --artifacts "$candidate" --dry-run
pnpm release:publish:images --artifacts "$candidate" --dry-run
```

After approving the saved artifacts and staging evidence, publish the packages
and images, then preview and finalize the GitHub release.

```sh
pnpm release:publish:npm --artifacts "$candidate"
pnpm release:publish:images --artifacts "$candidate"
pnpm release:github --artifacts "$candidate"
pnpm release:github --artifacts "$candidate" --apply
```

```sh
npm view create-lace@latest version
docker buildx imagetools inspect ghcr.io/lacecms/api:1.1.0
docker buildx imagetools inspect ghcr.io/lacecms/builder:1.1.0
gh release view v1.1.0 --repo lacecms/lace --json tagName,isDraft,isPrerelease,assets
```

After verifying publication, record `1.1.0` in the publication ledger when
selecting the next release. Retain the inventory and receipts. The
[release runbook](../../../../docs/alpha-release.md) covers resuming partial
publication and optional cleanup.
