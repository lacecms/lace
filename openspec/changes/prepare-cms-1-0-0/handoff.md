# CMS 1.0.0 owner handoff

The candidate contains 16 npm packages at `1.0.0`, ownership template
`0.52.0` and two image families for linux/amd64 and linux/arm64. Its only
supported prerelease origin is a fully migrated and synchronized
`0.1.0-rc5` installation with template `0.50.0`. The gallery already has
schema version 6. The database has two recorded migrations and receives five.

Use the saved set in `.release-artifacts/1.0.0-357ebbbc`. The shipping commit
is `357ebbbc8d2eb73acf164ae62db40647dce2a046` and the inventory SHA-256 is
`8be5e95234a622cac36e65a6050665505c686b7fa16fe01930b3b30762510341`.
The [inventory](inventory.json) lists each package checksum, image archive digest,
platform, image ID and source fingerprint. The [verification record](verification.md)
summarizes local checks and explains subsequent test-harness changes.

The [acceptance receipt](acceptance.json) has SHA-256
`28fe346680efa37494154edc3506c3bae4ddd897439c372cf70ea5c2361fda53`.
Harness commit `b57f2970ba7d7d68b8ccd2a32798b111ddfb3acc` completed
25 journeys on linux/arm64, including fresh installs and the two populated
RC5 upgrades and restores. Both architectures passed image smoke tests.
Read-only GitHub finalization reported the expected missing published package.
Owner staging, restore of the independent site, approval and external
publication are pending.

## Rehearse the independent site

1. Record the deployed RC5 revision, package lock, managed manifest, site mode,
   source path, database and bucket identity, ingress settings, last static
   deployment, representative draft/publication and media checksums. Quiesce
   writers and dispatch before capturing the coordinated backup. Restore it to
   a private, independent environment. Run the first checks with RC5, including
   original sign-in and reading media. Preserve all original files and images.
2. On the machine holding the archives, set
   `candidate="$(pwd)/.release-artifacts/1.0.0-357ebbbc"` in the repository root.
   Verify the saved inventory with `pnpm release:verify --output "$candidate"`.
   Stage these exact tarballs in a private package registry or the disposable
   consumer's pinned file dependencies. Load the matching platform's saved API
   and builder archives with `docker load -i <inventory-file>` and check their
   local IDs. Select those exact images in the staging site's environment.
3. From the saved generator, run
   `node "$candidate/extracted/create-lace/package/dist/bin.js" create <target> <site-options>`.
   Use the original project basename, site path and mode and the original
   Cloudflare choice. From the restored site's root, run the staged **1.0.0**
   CLI's `lace upgrade --template <target> --json`, resolve managed conflicts,
   then repeat with `--apply`. Adopt the matching site dependencies and review
   updated block components. Repeating the plan should report zero changes.
4. For the **VPS staging copy**, stop writes, the API, dispatcher and builder.
   Preserve the original MinIO volume, metadata, credentials and image. Use the
   generated storage-switch procedure to move the private copy to SILO. Run
   `pnpm db:migrate` and `pnpm content:sync`. Verify readiness, original login
   and roles, draft/public separation, gallery, entry URL and media readback.
   Upload another object, restart, recheck both checksums, rebuild and request the
   page through the staged TLS ingress. [Node operator procedure](../../../packages/create-lace/templates/docs/lace-operations.md#upgrading-from-rc5)
5. For **Cloudflare staging**, restore D1 and R2 to isolated bindings and record
   the previous Worker and Pages deployments. Verify the selected account and
   D1 ID. Use the site's staged CLI to run the following commands from its root.
   Deploy the matching Pages site, check build tracking, public ETags and media
   after restart, then repeat migration to confirm it is current. [Cloudflare handoff](../../../docs/cloudflare-deployment-handoff.md)

   ```sh
   pnpm exec lace db migrate --target cloudflare-remote --operator-env .lace/cloudflare-operator.env
   pnpm exec lace content sync --target cloudflare-remote --operator-env .lace/cloudflare-operator.env
   pnpm exec wrangler deploy --config worker/wrangler.jsonc
   ```

6. On a separate recovery copy, restore the original engine, user site source,
   manifest, configuration, SQLite/objects or D1/R2, and the previous static
   release to the same point in time. Sign in, request the original route and
   compare its publication and media checksums. Record recovery duration,
   data-loss window, results, residual risks and private evidence references.
   Keep the production site on RC5 until its owner accepts the rehearsal.
   [Real infrastructure and independent-site checklist](../../../docs/verification.md#owner-checks-on-real-infrastructure)

## Publication decision

Local publication previews planned 16 package publications and both image
indexes. The owner still needs to record the VPS, Cloudflare and independent-site recovery results, the inventory
and acceptance digests, and explicit owner approval. Then, from the repository
root, use the following commands in order. The first two commands publish live.
The GitHub preview verifies public registries before finalization.

```sh
candidate=.release-artifacts/1.0.0-357ebbbc
pnpm release:publish:npm --artifacts "$candidate"
pnpm release:publish:images --artifacts "$candidate"
pnpm release:github --artifacts "$candidate"
pnpm release:github --artifacts "$candidate" --apply
npm view create-lace@latest version dist.integrity
npm view create-lace@1.0.0 dist.integrity
docker buildx imagetools inspect ghcr.io/lacecms/api:1.0.0
docker buildx imagetools inspect ghcr.io/lacecms/builder:1.0.0
gh release view v1.0.0 --repo lacecms/lace --json tagName,isDraft,isPrerelease,assets
```

Verify the exact versions and digests of all 16 tarballs, both two-platform
image indexes, the Git tag's source revision and the regular release's uploaded
evidence. Install a new consumer using `create-lace@latest`. Only then append
`1.0.0` to the publication ledger in `release/alpha.json`, selecting the next candidate
when reopening release preparation. The release model rejects reuse of a
published version. Keep the previous
production release and its restore point for the agreed retention period.
Optional release-directory cleanup has a read-only preview, then an explicit
`--apply`. [Publication and cleanup runbook](../../../docs/alpha-release.md)
