## 1. Release definition and coherent refresh

- [x] 1.1 Set `release/alpha.json` to `0.1.0-alpha.3`, template `0.17.0`, `publishedVersions: ["0.1.0-alpha.1", "0.1.0-alpha.2"]`; update all fifteen public manifests, generated root/site dependencies, `.env.example` image defaults, Dockerfile defaults, block-registry requirements, the existing-Astro fixture and version-pinned CLI/generator/release tests; release-model test covers alpha.2 reuse refusal. Verify `pnpm install --frozen-lockfile`, `pnpm release:check` and release-model tests.
- [x] 1.2 Advance `TEMPLATE_VERSION` to `0.17.0`; update managed guides' prerequisites to name `0.1.0-alpha.3` (and what published alpha.2 lacks), `packages/create-lace/README.md`, and add the `0.17.0` upgrade entry with coordinates, manual `.env`/site steps and the `0003_site_build_outcomes` database step for Node and D1 (design 2); regenerate and review snapshots. Verify `create-lace` and CLI upgrade tests and `acceptance:generated snapshots`.

## 2. Field-trial regressions in exact-artifact acceptance

- [x] 2.1 Generalize guide command extraction/drift in `scripts/consumer-guides.mjs`; add reviewed production and Cloudflare sequences checked against the packed consumer's guides; start the production stack with the guide's command and use the Cloudflare guide sequence in the Cloudflare journey. Verify `tests/consumer-guides.test.mjs` including drift failures.
- [x] 2.2 Add `scripts/block-order-acceptance.mjs` (packed admin reorder/insert/duplicate/remove/undo → save, reload, publish, export, served Compose HTML; intercepted rejection; HTTP descending-position rejection) per design 3.1.
- [x] 2.3 Add `scripts/weak-etag-acceptance.mjs` (compressing weak-ETag proxy, packed static build and dev loader revalidation, publication refresh) per design 3.2.
- [x] 2.4 Run builder diagnostics on the loaded release images after tearing down the main stack, reusing the existing-site consumer; extract the credentials journey into a function usable with the packed generator/tarballs.
- [x] 2.5 Extend the Cloudflare consumer journey with Pages tracking against a local stub (succeeded and failed outcomes, token secrecy) after the untracked accepted check.
- [x] 2.6 Wire the journeys into `release` (and `all` where applicable), rename the upgrade receipt entry, assert the `0.17.0` database instruction in the upgrade plan, and update acceptance helper tests. Verify focused tests and Oxlint.

## 3. Feedback traceability and archive

- [x] 3.1 Move `onboarding-feedback{,-acceptance}.md` to `docs/archive/step-32/` and `lace-alpha-2-feedback.md` plus the 33A–33C acceptance records to `docs/archive/step-33/`; fix relative links and every reference; point the onboarding test at the archived paths.
- [x] 3.2 Add `docs/archive/step-33/alpha-2-feedback-acceptance.md` and `tests/alpha-2-feedback-acceptance.test.mjs` (shared parsers; release-phase stages only; §3–§5 name owner real-account checks); update the log's status header. Verify both feedback tests.

## 4. Quality gates and clean candidate

- [x] 4.1 Run focused tests (release tooling, create-lace, CLI, consumer guides, feedback maps), root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, strict OpenSpec validation and a package-only `--preview` preparation.
- [x] 4.2 Run the new journeys once against a working-tree preview or the workspace suite where feasible to shake out harness defects before the clean candidate.
- [x] 4.3 Commit the implementation; from that clean commit run `pnpm release:prepare --output .release-artifacts/alpha-3` (both platforms) and `pnpm release:verify`; confirm `complete` and `publicationEligible`.
- [x] 4.4 Run `pnpm acceptance:release --artifacts .release-artifacts/alpha-3` and require the full receipt including the field-trial journeys.

## 5. Evidence, documentation and archive

- [x] 5.1 Record `docs/archive/step-33/step-33h-verification.md` and `step-33h-artifacts.json` (source revision, fingerprint, versions, checksums, image IDs, receipt, registry evidence, remaining owner checks).
- [x] 5.2 Reconcile `docs/alpha-release.md`, `docs/compatibility.md`, architecture §25, roadmap (33H and Step 33 summary), root README and the feedback map with delivered behavior; publication and real-account/real-server checks remain explicit owner acts (input to 34C).
- [x] 5.3 Validate strictly, sync delta specs, archive the change and commit the evidence.
