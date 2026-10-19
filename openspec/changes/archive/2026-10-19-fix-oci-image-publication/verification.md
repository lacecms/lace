# OCI publication repair verification

All six implementation tasks are complete. This repair changes release tooling
and tests only; no package, image, inventory or acceptance bytes were rebuilt or
modified. No remote mutation was performed by the repair.

## Root cause and correction

The alpha.7 API/amd64 Docker ID is an OCI index digest with a runtime image and
an attestation, rather than a config digest. Shared graph verification now accepts
that exact root identity, authenticates raw manifest bytes and immutable child
references, and checks platforms and expected attestation bindings. Legacy config
IDs remain supported. Flattened and nested final indexes are compared against the
verified expected leaf graph; unrelated, missing or duplicate descriptors fail.

Publication resume, anonymous verification, GitHub finalization and cleanup share
these checks. Traversal is bounded (64 visited nodes, five index levels), with
immutable-reference caching. Registry/authentication failures remain errors.

## Tests and quality gates

- Red regression run reproduced three OCI index failures before implementation.
- Focused release/image/publication/lifecycle/cleanup: **7 files, 96 tests passed**.
- Controlled partial publication skips the matching uploaded platform, pushes only
  missing images and verifies final flattened attestations; a rerun makes no push.
- Controlled independent verification, GitHub finalization and cleanup preflight
  accept index-ID artifacts; altered graph membership blocks cleanup before deletion.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: passed.
- Explicit Oxlint on changed scripts/tests and strict OpenSpec validation: passed.

## Actual read-only alpha.7 verification

At `2026-10-19T18:36:31.371Z`, anonymous GHCR reads validated the actual uploaded
`ghcr.io/lacecms/api:0.1.0-alpha.7-amd64` and its immutable children through the shared matcher.
Expected and remote root digest both equal:

`sha256:823736efeac6b9c8cfe73305cafc9a3657afeb6f379f1e84004b0287849e76f1`

`pnpm release:publish:images --artifacts .release-artifacts/alpha-7 --dry-run`
passed using Docker inspection with authenticated manifest-byte checks. The plan:

- skips matching API/amd64;
- would upload API/arm64 and both builder platforms;
- would assemble API and builder version manifests after their inputs exist.

No load, tag, push, manifest creation or publication receipt was performed.
`publication-images.json` remains absent because the public set is incomplete.
Only the observed API/amd64 upload is verified here; the future complete registry
set is covered by controlled tests and must be verified after operator publication.

Original hashes verified unchanged against the Alpha7 handoff:

- Inventory SHA-256: `0de1f9dbed0c831a79774b943165a6441d331af712532542d021a37bc380d556`.
- Acceptance SHA-256: `7a58d1065bcb7ef6119fa82805163211f6d1869bc480e59ebcc32a9fb755547f`.

Evidence logs and public verification JSON are retained locally under
`.release-artifacts/alpha-7-evidence/oci-publication-fix`.

## Operator resume

With the corrected scripts, run the original live command when ready:

```sh
pnpm release:publish:images --artifacts .release-artifacts/alpha-7
```

The uploaded matching platform is skipped. Do not rebuild images, edit saved IDs,
strip provenance, replace version tags or substitute another artifact source.
The saved shipping source remains `665bd3499b49180a0873881bd9a93bb2722f556a`.
No OpenSpec archive or release cleanup was performed.
