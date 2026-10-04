## 1. Release definition and validation

- [x] 1.1 Set `release/alpha.json` to `0.1.0-alpha.2`, template `0.14.0`, and add `publishedVersions: ["0.1.0-alpha.1"]`; extend `readReleaseModel`/`validateReleaseModel` to reject a published candidate, Dockerfile `LACE_VERSION` defaults and versioned guide coordinates that differ from the candidate (design decisions 2–3). Verify with release-model tests covering a published-version reuse, a stale Dockerfile default and a stale guide coordinate, plus a historical-prose allowance.

## 2. Coherent delivery refresh

- [x] 2.1 Update every public `package.json` version, generated root/site dependencies, `.env.example` image defaults, both Dockerfile defaults, the existing-Astro fixture dependencies and CLI/generator/release tests that pin the release version; confirm `pnpm install --frozen-lockfile` and `pnpm release:check` pass.
- [x] 2.2 Advance `TEMPLATE_VERSION` to `0.14.0`; refresh managed guides, the user-owned README template and `packages/create-lace/README.md` to name `0.1.0-alpha.2` artifacts instead of step-numbered prerequisites; add the `0.14.0` upgrade-instruction entry (design decision 4); update upgrade/generator tests and regenerate reviewed snapshots. Verify `create-lace` and CLI upgrade tests and the snapshot check pass.

## 3. Exact-artifact regression suite

- [x] 3.1 Parameterize the generator and package-manifest source in `scripts/generated-project-acceptance.mjs`, pass the generator to existing-site, Cloudflare consumer and upgrade journeys, derive the SDK tarball name from the tarball map, and extend the `release` phase to run snapshots, Pages preview, publication visibility, existing-Astro, Cloudflare consumer and template upgrade before printing its receipt (design decision 5). Verify focused acceptance helper tests and Oxlint pass.

- [x] 3.2 Document stopping `api`/`dispatcher` around host database commands in the managed operations guide, README template and `0.14.0` upgrade instructions; make the acceptance stop `api` around the refused-bootstrap check and restart it; regenerate snapshots (design decision 6b). Verify generator and CLI tests, snapshot check and Oxlint.

## 4. Quality gates and clean candidate

- [x] 4.1 Run focused tests (release tooling, create-lace, CLI, consumer guides, onboarding map), root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and strict OpenSpec validation; run a package-only `--preview` preparation as a smoke.
- [x] 4.2 Commit the implementation; from that clean commit run `pnpm release:prepare --output .release-artifacts/alpha-2b` (the first `alpha-2` set, prepared before decision 6b, is superseded) for both platforms and `pnpm release:verify`; confirm `complete` and `publicationEligible` and inspected archive/image contents.
- [x] 4.3 Run `pnpm acceptance:release --artifacts .release-artifacts/alpha-2b` and require the full suite receipt.

## 5. Evidence and documentation

- [x] 5.1 Record `docs/archive/step-32/step-32b-verification.md` and `step-32b-artifacts.json` (source revision, fingerprint, versions, package checksums, image IDs per platform, receipt, registry-availability evidence and remaining checks).
- [x] 5.2 Reconcile `docs/alpha-release.md`, `docs/compatibility.md`, architecture §25, the roadmap (32B and step summary), root README, `docs/onboarding-feedback.md` statuses and `docs/onboarding-feedback-acceptance.md` with delivered behavior; keep publication, real deployment and Step 33 explicit. Verify the onboarding map test and `pnpm format:check`.
- [x] 5.3 Validate `pnpm exec openspec validate step-32b-coherent-artifact-refresh --type change --strict`, then sync specs, archive and commit the evidence.
