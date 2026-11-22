## Context

RC5 is listed in `release/alpha.json` under `publishedVersions`. The active RC5 stabilization proposal describes the earlier build and its evidence. EX7A uses a fresh build of the selected candidate. CI runs Node `24.12.0`, and the API and builder stages use Node `24.22.3`.

## Goals / Non-Goals

Keep pnpm selection reproducible across build environments and retain the operator minimum in every generated site mode. Use the existing release model, generator and acceptance entry points. Changes to the public preparation gate (Node major ≥24 and pnpm ≥12), registry publication and real-account Cloudflare deployment fall outside this session.

## Decisions

1. **Use the root pin as the reference.** Align `ci.yml`, `docs-pages.yml`, `generated-project-acceptance.yml`, the generated Pages workflow and the three Docker install sites. Keep the CI store key scoped by OS, Node, pnpm and lockfile hash. Reuse the Docker checks in `scripts/release-model.mjs`. The negative builder fixture currently substitutes the target version, so change it to a genuinely different version. Verify all three install sites individually. Retain the exact-version check in `scripts/acceptance-pnpm.mjs`, which makes the selected executable available to nested processes without pinning an operator's project.
2. **Regenerate from the existing lockfile.** Check `pnpm --version` before regeneration. Inspect the package-manager section, workspace importers, dependency versions, integrity and peer snapshots. The current catalog selects Vite `8.3.8` and the `vite@^8` override selects the same version. Trace the regenerated resolutions back to their consuming packages. If the resolver requires a different expression, preserve that effective selection and document the reason. A blanket dependency update or a relaxed install would make the effect of the pnpm change harder to verify.
3. **Qualify one exact set.** After focused host and packed-consumer checks, build from a clean reviewed revision into a new output directory. Use the existing `release:prepare`, `release:verify` and `acceptance:release` commands on that directory. Retain all four platform smoke results and the full host-platform receipt. Record the source fingerprint, tarball checksums and image identities through the inventory and receipt.
4. **Keep the evidence valid when guidance changes.** During qualification, identify `12.21.0` as the selected build version and date or link the previously verified baseline. Put the final result in the compatibility record. Candidate templates can point to that record so promotion does not require rewriting accepted tarballs. Review current generated output snapshots for intentional changes and preserve released fixtures. Any later change to shipped bytes requires a fresh preparation and matching acceptance before those bytes can be called verified.

## Risks / Trade-offs

- A cached native module can mask an install failure. Use a clean frozen workspace install and open a database with the installed `better-sqlite3` binding.
- pnpm may change peer groups or override handling. Compare both lockfile documents and check which Vite versions the workspace actually resolves before running expensive image builds.
- A preview, partial matrix or receipt from RC5 can look plausible. Use the publication-eligible inventory and verify the receipt identities. Record local Worker coverage and the architecture of the full consumer run explicitly.

## Migration Plan

Land the coordinated pins and reviewed lockfile together. A failed check leaves the last verified baseline in place. Retry against the same saved inventory for a transient consumer failure. If a build input changes, prepare a fresh set in a new directory. To roll back the toolchain, revert pins, lockfile and associated current guidance together.
