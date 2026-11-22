# EX7A verification

## Workspace dependency resolution

pnpm `12.21.0` regenerated the two-document workspace lockfile. The package manager now distributes fifteen optional platform binaries, up from eight. In the workspace document the resolver reused the existing package versions and integrity values and pruned five redundant records. Better Auth and its adapters now share React/React DOM `19.3.1` and Drizzle's `better-sqlite3@13.2.0` context. OpenSpec, Inquirer and the Vite/Vitest consumers now share `@types/node@24.10.1`. This drops SQLite `13.0.3`, React and React DOM `19.3.0`, Node types `22.20.2` and their `undici-types@6.21.0`.

Both the workspace catalog and the `vite@^8` override select `8.3.8`. The new resolver writes the override's exact specifier for the admin and site importers and omits the redundant lockfile catalog entry. Both importers resolve Vite `8.3.8` with the same Node types, esbuild, jiti, tsx and YAML peers. The source catalog, manifests and override retain their original declarations.

## Clean frozen install

On 2026-11-22 a fresh macOS arm64 checkout copy with no installed modules completed a frozen install on Node 24.12.0 and pnpm 12.21.0. The lockfile matched the reviewed file byte for byte. The platform-node package loaded better-sqlite3, opened an in-memory database and returned 42 from a SQL query. pnpm reported engine warnings for the existing jsdom, dom-selector and css-color development dependencies, whose Node 24 ranges start at 24.15.0.

## Generated projects

All six site-mode/Cloudflare combinations generated twice with stable bytes. Each generated manifest declared pnpm `>=12` with neither package-manager selector. Only starter and existing-site Cloudflare variants emitted the Pages workflow with the exact new pin. Comparing the active snapshots to their predecessors found changes only to guidance and the Pages workflow. Published-template fixtures retained their original bytes.

Corepack and the standalone launcher each resolved pnpm 12.21.0 in the disposable environment. A generated-style consumer script invoking pnpm again reported 12.21.0. Supplying a 12.3.4 executable produced the expected version-mismatch error. The packed starter passed frozen installation, typecheck, Astro builds with and without globals, image delivery and sample import validation.

The packed local Worker also passed offline and ready doctor checks, D1 migration and sync, R2 media, browser setup/edit/publish, Astro build, restart persistence and Pages tracking against the local stub. Root typecheck, lint (including boundary checks), format check and strict EX7A validation passed on Node 24.12.0.

## Release preparation

The first preparation caught an omitted generator template during archive inspection. pnpm 12.21.0 packs `templates/.gitignore` when it appears explicitly in the package file allowlist. A focused pack of create-lace with that entry produced a byte-identical copy of the template.

From clean revision `0f8f8be087c65f58b7f2adc7976af49c9e3a5e40`, release preparation produced all 16 tarballs and both API/builder images for linux/amd64 and linux/arm64. All four image smoke checks passed. Both builder IDs reported pnpm 12.21.0 with networking disabled. Independent saved-artifact verification passed. The inventory is `.release-artifacts/ex7a-0f8f8be0/inventory.json` (SHA-256 `4ee0c77c371acf540b10d7b30618e085bfa31b6ee1cb025d6ab14cc7057745f8`), source fingerprint `c77de229352c28117f509d90a92e20d0503257f334c1111fd3b5d937be9adb4d`.

On 2026-11-22 the full `acceptance:release` run passed on linux/arm64 and recorded 23 journeys. The saved `.release-artifacts/ex7a-0f8f8be0/acceptance.json` has SHA-256 `3fb87d89ca448802aa109e505968502c1c91a7890dea51f484697dbf6caa0c01`. Independent receipt validation matched the inventory digest, source revision and fingerprint, all 16 package records and both arm64 image identities. The compatibility record now lists pnpm 12.21.0 as tested.
