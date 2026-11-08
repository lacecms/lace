## Why

The owner wants to release the refactoring work completed since rc1 now as `0.1.0-rc2`, and to release the rest of the refactoring roadmap later as rc3. Since rc1 the source has a breaking database baseline (RF8X: one baseline migration, so rc1 databases are recreated), ownership template `0.47.0` and several public contract adjustments recorded in roadmap owner check 9. `release/alpha.json` still selects rc1/template `0.46.0`, so `pnpm release:check` fails with `Template identity mismatch`. Preparation also refuses every Node except exactly `24.12.0`. The owner decided that preparation should only require Node 24 or later. They will run preparation, acceptance and publication themselves to learn the release process.

## What Changes

- Select `0.1.0-rc2` on npm `next` for the sixteen public packages, the generator and both two-platform images, with ownership template `0.47.0` (already the source template). Record the published `0.1.0-rc1` in `publishedVersions`.
- Update every coordinate that `release:check` guards: public manifests, platform release-version modules, template dependencies and image defaults, Dockerfile `LACE_VERSION`, delivered guides and registry requirements. Also update the version assertions in tests and acceptance journeys, the generated-project snapshots and the public documentation target.
- Relax the preparation toolchain gate: accept a Node whose major version is 24 or later and reject an older or malformed one, before claiming the output directory. pnpm stays exactly `12.3.4`. CI, Docker images and package engine minimums (`>=24.12.0`) are unchanged. This folds in and withdraws the stale `allow-supported-node-release-preparation` change (roadmap owner check 10).
- **BREAKING** Add the rc2 CHANGELOG entry: the database baseline (recreate the rc1 database), removed pre-rc1 compatibility paths and the public contract changes from owner check 9. Link it to the existing permanent "Upgrading from rc1" guide.
- Update release guidance (`docs/alpha-release.md`, `docs/compatibility.md`, documentation maintenance and the roadmap checkpoint) so the owner can prepare, accept and publish rc2 using the documented commands.

This is an owner-requested release checkpoint inserted into the refactoring roadmap after RF8B. It is not an RF session. The remaining RF sessions (RF6, RF7, RF8C, RF9C–F) keep their order, are not part of rc2 and lead to rc3. Architecture §22 (release) and §25 (compatibility) govern the work. The affected capabilities are `alpha-release-artifacts` and `public-documentation`.

Non-goals: running `release:prepare`/`acceptance:release` or any npm/GHCR/GitHub publication (the owner does those); changing CI/Docker Node pins, pnpm pin, engine declarations or runtime behavior; new migrations; replacing the rc1 upgrade fixtures (rc1 remains the oldest supported release and upgrade origin); moving `latest`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alpha-release-artifacts`: preparation accepts Node major 24 or later with the exact pnpm pin.
- `public-documentation`: English/latest targets `0.1.0-rc2`.

## Impact

`release/alpha.json`, sixteen public manifests, platform version modules, generator templates and snapshots, Dockerfiles, registry items, delivered guides, `scripts/release.mjs` and release tests, acceptance journeys that assert the installed engine version, docs app target, CHANGELOG, `docs/alpha-release.md`, `docs/compatibility.md`, `docs/documentation-maintenance.md`, roadmap. There is no change to runtime code, schema or API.
