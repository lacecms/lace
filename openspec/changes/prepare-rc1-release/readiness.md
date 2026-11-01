# RC1 release progress

Status: all source gates passed; no rc1 registry publication or GitHub
release has occurred, and alpha.7 upgrade fixtures have not been retired.

## Selection and public baseline

Candidate: `0.1.0-rc1`, ownership template `0.46.0`, npm `next`, sixteen public
packages and API/builder for `linux/amd64` and `linux/arm64`. Shipping changes are committed and clean; the preparation inventory will record
the exact frozen revision including this verification record. The dated [registry preflight](registry-preflight.json) confirms
alpha.8's complete public set and rc1 availability on 2026-11-01; availability
is not reservation or publishing rights.

## Completed checks

Pinned Node 24.12.0 and pnpm 12.3.4 were used for source checks. Docker 29.8.2 /
Buildx advertises both platforms. Pinned Node containers executed successfully
on linux/amd64 (x64) and linux/arm64 (arm64); release-image smokes remain part
of preparation. Frozen installation passed with the lockfile unchanged.

- Release-model/artifact/publication/lifecycle tests: 71 passed, including RC
  coordinates and historical-version protection. Candidate `release:check` and
  `release:plan` agree on sixteen packages, both images and `next`.
- Generator suite: 64 passed. Focused generator/CLI/fixture verification: 84
  passed; final model/generator refresh: 49 passed. Six generated snapshots
  match two byte-stable generations after template guidance changes.
- Packed upgrade acceptance: exact alpha.7 and alpha.8 default/Cloudflare
  templates pass managed conflicts, new-guide collision refusal, protected
  user bytes, managed delivery and repeat no-op. Alpha.8 fixtures were generated
  from its real published archive with verified npm integrity and SHA-256.
- Documentation checks/build/variant build passed. Built-site browser smoke
  verified landing/navigation, live search results and the conditional-fields
  deep page.
- Packed starter acceptance passed all blocks, export/internal links, image
  variants/cache/lightbox/link precedence, gallery ambient video/accessibility/
  aspect ratio/reduced-motion fallback and offline import sample validation.
- `pnpm compat:mcp`: 114 passed. MCP package tests: 5 passed. These are source
  tests, not acceptance of the final saved rc1 inventory.
- Full workspace/root tests passed: 3334 tests, including 995 admin tests and 240 root tests.
- Root typecheck, lint, format check, generated OpenAPI check, all-spec strict
  validation (85 items) and strict change validation passed.
- Dependency/license audit completed for 992 locked records with one existing
  moderate esbuild advisory, GHSA-67mh-4wv8-2f99. Existing mitigation remains:
  legacy esbuild development server is never started/exposed; tooling only.
  No new exception. Lock SHA-256:
  `cb74f7af4cab116b827240310d2d6913eee0d2d614c8f74e61865ec397949e12`.
  Detailed local report: `.lace-acceptance/rc1-evidence/dependency-audit.json`.

## Remaining gates

Complete two-platform preparation, independent saved-inventory verification and
fresh exact-artifact Node/Worker acceptance remain outstanding. Acceptance must
exercise the updated MCP publication grant and conditional/tag/multi-picker
journeys; source-only tests and packed source probes do not replace this gate.

GitHub account authentication is available. npm `whoami` returned E401 during
preflight; owner local login is needed before publishing. Registry permission,
complete publication and GitHub evidence checks remain required. Real VPS/
Cloudflare deployment checks remain distinct from all local checks.

Only after verified rc1 publication will its actual published generator replace
historical fixtures in a later commit. The released tag/artifacts/evidence will
not be rewritten for that cleanup. Archiving and local release-data deletion
are not included.

## Preparation attempt 1 and bounded verifier correction

The first attempt, `.release-artifacts/rc1`, used clean pushed source
`dbf48e22fd071fdc8b39fed217fa8e15d426a108` (fingerprint
`eeb62ed825b8eeea98a85a7ee876278c4ff2610d7069bb662aaee0124419d4b9`). It stopped
while inspecting the CLI archive, before image preparation, with no complete
inventory: the historical verifier permitted only `dist/` exports, whereas SM4B
correctly exports `@lacecms/cli/lace-import.schema.json` from
`schema/lace-import.schema.json`.

The verifier now permits precisely that declared CLI JSON data export and parses
its bytes. Other non-dist exports, malformed JSON and using this schema as a
compiled type/executable entry point still fail. A regression test covers these
boundaries; the exact previously rejected CLI archive passes inspection.
Root tests were repeated after the correction: 33 files / 241 tests passed;
typecheck, lint, format check and strict change validation passed again. No
runtime/package/schema contract changed and no audit exception was introduced.
The failed directory and its status remain intact. Retry uses the distinct
`.release-artifacts/rc1-r2` directory and a new clean pushed source revision.


## Owner clarification: preparation only

On 2026-11-01 the owner clarified that they will publish the release themselves.
This apply ends at a verified local artifact set and exact publication commands.
No npm upload, image push, GitHub tag/draft/release creation or post-release
fixture retirement is authorized in this preparation. The observed npm E401 is
therefore an owner prerequisite for a later publication, not a blocker to local
readiness. Alpha.7 fixtures remain; their replacement/removal is a later requested
follow-up after owner-confirmed rc1 publication. Planning artifacts and the
roadmap checkpoint were reconciled with this clarification; immutable prepared
bytes and source identity were not changed.


## Saved rc1-r2 inventory

Directory: `.release-artifacts/rc1-r2`. Independent `release:verify` passed.

- Artifact source: `430661f6f27c5108facd6949fba711153068d7dc` (clean, publication-eligible).
- Source fingerprint: `d03cb499f376216af0b1169df85bf4a38ca77ec3fc3e1292b36ce68ddf3fd581`.
- [Inventory](../../../.release-artifacts/rc1-r2/inventory.json) SHA-256: `f837cfba99fa2e3deef87261787fe24a2e5692cfe619dd32955df90e0e375bfc`.
- All sixteen archives and four platform images passed preparation inspection/smokes; exact-artifact acceptance is still running.

| Package | Archive SHA-256 |
| --- | --- |
| @lacecms/content | `bd3449cecfae96d1029a9987293ea1c50b31918dc898a20415265f909893ce8b` |
| @lacecms/config | `24f516893a2546051db407f7a911e537ed7fc7e628ee28121979bec9f627a5d9` |
| @lacecms/domain | `dd4619d2adb067d3074403537462684aff6cd801f63c5b4d5493548a4c0d76a6` |
| @lacecms/application | `632378f774b38400aada412dd7a576772fa41311392ee08fc34650fa0c42a472` |
| @lacecms/render | `767938cfde88d44b7f8c58bf7a53f17de9db8eb168a4e8385b4be7c33c2212f2` |
| @lacecms/contracts | `49eca44e2d4cc568e104ce109a7a00591d03e2eafce97d8674813cde4e9bc3fa` |
| @lacecms/sdk | `fbee5c8f369889b40f571cfc34a25d6416eb72f56aba9adc4d5bd60f63974ad7` |
| @lacecms/astro | `ed304625337fdc1b1ff124581945e920fd599a232809ae10ecf6ece9473f9366` |
| @lacecms/auth | `26879a680d28b392a3d929274a8fdfe66ee45a164a0829f291c55177bee5edd7` |
| @lacecms/db | `085590086d4565029f74fef88a2ea9d650911eec2160b165d27d279c725e5a19` |
| @lacecms/mcp | `2985f2070bf4882b8d8442857d62d6bb3d4348cdbed0b8b398a8abf22b1a0479` |
| @lacecms/server | `8acbe9d8391c80ed9075426f0d07296f5e4e3e0a5aff9e035eff3dba3488f089` |
| @lacecms/platform-cloudflare | `61afc4cc7d7c38fc6412cd710714eb74b7d16483032fadbe21836b085a8d5044` |
| @lacecms/platform-node | `1be6ba49c3fc04b072852c111115a168bcc7e92b427bc71e0f6313dfcafb98a2` |
| @lacecms/cli | `4037b725b91c8f9b572f65fcdae936d62351b9efd1fb00806ebb6d54d49d2f3b` |
| create-lace | `571f8377c58b677e72bc5e2d45b61dc204e9288dadbf3ae6b971efca721e9693` |

Local image identifiers are not remote registry digests.

| Image / platform | Local ID | Saved archive SHA-256 |
| --- | --- | --- |
| api / linux/amd64 | `sha256:9e33e48d81360c2b50724a87e7556eae37f410a4e02bc8150998528fe2da5818` | `cbc5a0d6009d5025c8adf8fb41bd3108de84825c95b6d3bed3adb8126906cf8d` |
| builder / linux/amd64 | `sha256:2c33777b8c1c6a9c9df864feb68f54b5704e48605af03177e66a8c4701095bc8` | `b0a52c1c636ab2ff639e8f6063d0cae7e93388c534a81ace6d4cfa9efdc841a6` |
| api / linux/arm64 | `sha256:82fa94fbc0f4e37307c71fd11ac179509416ee1dc415e348a2076a5d35d0df28` | `03c9d5713caceb522d303c79fc94ec16ad18a756a58e4b5c6a45776218e447a7` |
| builder / linux/arm64 | `sha256:dd261d9376f5e17d73f7fda10a026aefa5268d3ae1dc90536da85e5197b07ee8` | `29d3c08d1396e7addf7e1357234227abe6c19fda03ec9979e6e4aeb063272b5e` |


## Acceptance attempt 1: global navigation boundary

The first exact-artifact run passed starter, Node setup/publication/import,
security, Compose failure/retry/persistence, external-site and local Worker
journeys, including the new Worker MCP publication/conditional/media multi-picker
checks. It then stopped in the historical block-order journey: its whole-page
key scan included the navigation global's `b1` block after the import sample had
published navigation. Draft and build-export order matched the entry editor;
this was a test-boundary mismatch, not evidence of a product ordering defect.

The served-order check is now scoped by the shipped `data-lace-entry` hook and
still checks every rendered block for the target entry. A focused regression
covers navigation, reordered attributes, unscoped markup and an absent entry.
No success receipt was written for the failed run; temporary services were
stopped/removed. The saved source/packages/images stay unchanged. A fresh full
run uses the same immutable inventory and a separately recorded reviewed harness
revision; no partial run is substituted for a full acceptance receipt.


## Owner publication commands (after successful saved-artifact acceptance)

Use the pinned toolchain (Node 24.12.0, pnpm 12.3.4), local npm/GHCR/GitHub
publishing credentials and this exact saved directory. The commands below are
handoff instructions; they have not been applied by the preparation agent.
`corepack pnpm` selects the project-pinned pnpm even when a shell fallback is
older. `npm whoami` must succeed and the account needs publishing rights for
create-lace and @lacecms. `docker login ghcr.io` uses the owner's local GHCR
credentials; follow the maintained release guide for scopes/visibility.

```sh
nvm use 24.12.0
npm login
npm whoami
docker login ghcr.io
gh auth status

corepack pnpm release:publish:npm --artifacts .release-artifacts/rc1-r2 --dry-run
corepack pnpm release:publish:npm --artifacts .release-artifacts/rc1-r2

corepack pnpm release:publish:images --artifacts .release-artifacts/rc1-r2 --dry-run
corepack pnpm release:publish:images --artifacts .release-artifacts/rc1-r2

corepack pnpm release:github --artifacts .release-artifacts/rc1-r2
corepack pnpm release:github --artifacts .release-artifacts/rc1-r2 --apply
```

The final command creates/resumes the prerelease and tag `v0.1.0-rc1` at the
inventory's source `430661f6f27c5108facd6949fba711153068d7dc`, even when current
HEAD contains newer verification notes or harness fixes. Reviewed changelog links
use the notes revision. It requires complete verified public npm and both GHCR
manifests and uploads only inventory, acceptance and complete npm/image reports.
It leaves latest unchanged. A GitHub preview before registry publication is
expected to report unmet publication prerequisites, not release completion.

If publication is interrupted, rerun against this same directory: the scripts
verify matching immutable identities and resume only missing items. Keep the
saved bytes, receipts and submission journals; do not rebuild or overwrite a
published coordinate. No local artifact cleanup was requested. The failed
`.release-artifacts/rc1` attempt is separate and does not establish readiness.
After the owner confirms a complete public rc1 release, request the separate
alpha.7 fixture retirement follow-up; keep those fixtures until then.

The second full attempt reached the same served-order assertion but exposed an
error in the first harness correction: the entry hook belongs to `<main>`, not
each block root. The checker now uses the already audited linkedom HTML parser
to select the actual `main[data-lace-entry]` container and read its descendants.
Regression fixtures match that shipped layout. Packed starter acceptance also
checks the helper against real built HTML and the expected exported home keys,
including a header navigation global; that focused packed run passed. No runtime
or saved artifact bytes changed. A fresh complete run remains required.


A focused saved Node HTTPS/MCP run then reached the new media upload check and
returned 422. A local TLS echo regression reproduced the harness problem:
Node-native FormData passed to Wrangler's separate Undici fetch became
`text/plain` instead of multipart. The test transport now serializes native
Request form data to bytes with its matching multipart headers before sending
through the trusted-certificate Undici agent. The API's strict upload validation
is unchanged. This correction affects the test driver only and uses existing
audited dependencies; the saved package/image bytes remain unchanged.
