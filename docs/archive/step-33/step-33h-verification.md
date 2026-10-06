# Step 33H verification

Verified on 2026-10-06 with Node `24.12.0`, pnpm `12.3.4`, OrbStack (Docker 29.4.0) on macOS arm64. Candidate: package/generator/image version `0.1.0-alpha.3`, ownership template `0.17.0`, channel `next`. No npm publication, GHCR push, remote release, visibility change or real Cloudflare/VPS operation was performed.

## Version selection

`0.1.0-alpha.1` (template `0.4.0`) and `0.1.0-alpha.2` (template `0.14.0`) are published and immutable; `release/alpha.json` records both in `publishedVersions`, and `release:check` refuses to prepare either (`tests/release-model.test.mjs` covers the alpha.2 refusal). Registry metadata checked on 2026-10-06: all fifteen packages list `0.1.0-alpha.2` on `next` (`latest` stays `0.1.0-alpha.1`, except `@lacecms/astro` and `@lacecms/render` at `0.1.0-alpha.2`); `0.1.0-alpha.3` returns 404 for every package; both `0.1.0-alpha.2` GHCR manifests exist and neither `0.1.0-alpha.3` manifest does. This is availability evidence on that date, not a reservation. Recheck before publishing.

Template `0.17.0` names the alpha.3 coordinates. Its upgrade instructions carry the first database step since alpha.2: migration `0003_site_build_outcomes` (33D) for Node SQLite and Cloudflare D1, with backup before and restore for downgrade. The `0.15.0` and `0.16.0` entries stay listed for upgrades from the published `0.14.0`.

## Exact artifact set

Prepared from clean source revision `5343121d20089bcffcf462a1d5e7bb343c2117de`, fingerprint `6dd76f3a1b15c9318e0d7e8bc58bdddf3d63f182306f437e32f6fef0e4ccfe85`, with `pnpm release:prepare --output .release-artifacts/alpha-3`; `pnpm release:verify` recomputed every checksum (`complete: true`, `publicationEligible: true`). Preparation built, loaded and smoke-tested API and builder separately on both platforms. [step-33h-artifacts.json](./step-33h-artifacts.json) records every package checksum, image ID and archive checksum and the consumer receipt. Image IDs are local config identities, not registry digests.

| Runtime | Platform | Local image ID |
| --- | --- | --- |
| API | linux/amd64 | `sha256:71326e977bc33836341d713fb17814da479ab72ad35b15a0e4d72e87db6a1749` |
| Builder | linux/amd64 | `sha256:14d10ed7f49edc0f6837aba4af4b3752e96ba7696dcdac4383adcf1bdeeda2bd` |
| API | linux/arm64 | `sha256:0aeffd68b9293ba38e6b90970e9ca6f996e9813b2c04da54dd5e17d39c79f69e` |
| Builder | linux/arm64 | `sha256:42427754577dbffb61bc07b8dde408385c761018adb94592476a7ca351b54eec` |

## Consumer regressions against the exact set

`pnpm acceptance:release --artifacts .release-artifacts/alpha-3` passed on `linux/arm64` on its first run, using only the inventory's generator, archives and image IDs. The receipt lists 14 journeys: `snapshots`, `node-development-guide-browser`, `compose-release`, `cloudflare-pages-preview`, `publication-visibility`, `existing-astro`, `cloudflare-consumer`, `cloudflare-pages-tracking`, `template-0.4.0-and-0.14.0-upgrade`, `scenario-guides`, `block-order`, `weak-etag`, `builder-source-diagnostics` and `cloudflare-credentials`.

The 25C and onboarding journeys passed as in 32B: build `198ce742…` at version 3, failed `01M48EBJTTAA…`, retried `01M48ECZ642G…` at version 4. The alpha.2 field-trial regressions ([map](./alpha-2-feedback-acceptance.md)) passed as follows.

- **Block order (§1).** The admin packaged in the loaded API image was exercised in this order: three added Hero blocks, pointer drag, keyboard move, insert at position 2, duplicate, remove, remove then undo. After each step, Save sent positions `1000·n` in the displayed order, and the order survived reload. Publication followed, and the build export, the Compose builder's succeeded release and the served `/blog/block-order/` HTML all held the same key order. One save was intercepted and given equal positions. The packaged server rejected it: Admin showed "Block at index 1", the edits stayed, Copy my JSON was offered and a retry succeeded. A direct request with descending positions returned `422 CONTENT_INVALID_STATE` with a request ID and changed neither the revision nor the export.
- **Builder source diagnostics (§2).** The existing-site consumer ran Compose production with the loaded arm64 images. The root `CLAUDE.md -> AGENTS.md` link was excluded and the build succeeded. Four injected faults each reached a terminal failure after eight attempts as non-root UID 1000, and the previous release stayed served throughout:
  - an in-site link: `source_symlink` at `src/linked.astro`;
  - an escaping link: `source_symlink` at `src/escaping`;
  - an unreadable entry: `source_unreadable` at `src/unreadable`;
  - a missing lockfile: `source_missing` at `pnpm-lock.yaml`.
  
  After each fault was corrected, Admin Retry succeeded.
- **Credential separation (§3).** A packed `--cloudflare` consumer ran the 33F harness with stubbed providers. The packed CLI used the private operator file, and preflight reported tokens shadowing OAuth from `.env`, `.env.local` and the shell. The generated Worker also bundled without an account.
- **Weak ETags (§4).** A local proxy compressed the Compose API's build export and rewrote its strong ETag as weak. The consumer's installed `@lacecms/astro` loader read through that proxy with default fetch: a weak `200`, then the weak validator sent back with a `304`, then new content after a publication. The static `pnpm build` also succeeded, and every request negotiated gzip.
- **Pages tracking (§5).**
  - The untracked hook ended `accepted`.
  - After restart with Pages tracking pointed at a loopback stub, the packed Worker:
    - recorded the hook's deployment as `running` at stage `build`;
    - completed it as `succeeded` at stage `deploy` once the stub reported success;
    - recorded a second deployment as `failed` with `provider_build_failed`.
  - The stub received only the configured Pages token. The token and the stub's environment settings appear nowhere in build history or captured output.
- **Scenario guides (§6).** The packed consumers' development, production and Cloudflare guides document exactly the reviewed command sequences; the journeys run those commands, including `pnpm prod:start` and `docker compose ps` for the production stack. The template `0.14.0` default and Cloudflare fixtures upgrade with the packed CLI; the plan includes the database step.

Both platforms passed preparation smokes. The full consumer run covered arm64 only and claims no amd64 end-to-end coverage.

## Defects found and fixed

- **Production guide (template `0.17.0`).** "Start the full stack" ran `lace doctor --stage ready` against the running stack. The API keeps SQLite in WAL mode, which doctor deliberately reports as `DATABASE_UNAVAILABLE`, so that documented step always failed. The guide now checks `docker compose ps` and `/health/ready`. It explains that the ready stage needs stopped database users and a rollback journal. The static guide test forbids the old step.
- **Acceptance tooling (not shipped).**
  - The Cloudflare project secret scan now skips only Wrangler dev bundles under `.wrangler/tmp` that vanish after a stop; any other read error still fails the scan.
  - The block-order journey waits for the build that covers the exported version, because the build row appears only at dispatch.
  - Keyboard reordering waits for the drag-and-drop announcements, as the e2e test does.
  - A workspace `field-trial` phase speeds up iteration on these journeys.

During workspace rehearsal, the local Worker once lost its connection right after the deploy-hook dispatch ("Network connection lost"). 32B recorded the same transient local-runtime behavior. It passed on every other run, including the exact-artifact run.

## Quality checks

Focused checks passed:

- release model, artifact and image tests;
- acceptance helper tests (root `tests`: 104);
- `create-lace` (64) and CLI (256);
- both feedback maps;
- snapshots.

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm release:check` and strict OpenSpec validation also passed.

## Remaining owner acts (input to 34C)

- **Publication** is a separate owner act per [alpha-release.md](../../alpha-release.md):
  1. Recheck registry state.
  2. Publish the exact tarballs with `--tag next`.
  3. Push the saved platform images and assemble manifests.
  4. Make the GHCR packages public and verify anonymous installs and pulls.
  5. Append `0.1.0-alpha.3` to `publishedVersions`.
- **Real-account and real-server re-verification**, which local stubs do not prove:
  - §3: login → D1-only operator token → remote migrate/sync → `wrangler deploy` without an authentication switch.
  - §4: a real Pages build with default compression.
  - §5: a Git-connected Pages project with tracking reaching Succeeded and Failed.
  - The production guide on a real server with TLS.
  - Upgrading the owner's alpha.2 installation, including migration `0003` on D1.
- Stable MVP status remains Step 34.
