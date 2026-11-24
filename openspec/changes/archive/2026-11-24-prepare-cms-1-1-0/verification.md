# CMS 1.1.0 verification

## Published origin

On 2026-11-24, read-only registry checks resolved the public GitHub tag to
`357ebbbc8d2eb73acf164ae62db40647dce2a046` and confirmed a public stable
release, all sixteen npm packages, and GHCR API and builder indexes with each
Linux platform. Downloaded generator, SDK and contracts archives matched
their registry integrity and the 1.0.0 recorded SHA-256. The checked 1.1.0
version coordinates returned 404. [Observed identities](../../../../release/published-1.0.0.json).

The 1.0.0 deltas were synchronized before the overlapping 1.1.0 deltas.
The [1.0.0 archive](../2026-11-24-prepare-cms-1-0-0/) preserves the RC5
qualification and receipt. The active 1.1.0 fixture uses template 0.52.0.

## Focused cutovers and SDK

The `upgrade-node` and `upgrade-cloudflare` acceptance phases passed with
Node 24.22.1 and pnpm 12.21.0. The Node journey used the published 1.0.0
image indexes and locally built 1.1.0 images on arm64. The Worker journey
used the published 1.0.0 package graph and the packed 1.1.0 graph with
persistent local D1 and R2. On each runtime two explicit migration runs
added zero ledger entries. The schema, full ledger and recorded content
and durable work matched the 1.0.0 snapshot. The old credentials, role,
original media, draft and publication survived restart. The upgraded
site rebuilt, and coordinated recovery restored the 1.0.0 state and
previously served output. The Worker verified original delivery without
Images and thumbnail delivery with the local binding double.

Both journeys compiled the same custom implementation and mock against
the published 1.0.0 and packed 1.1.0 SDK declarations. The complete
`LaceClient` base interface matched, the new factory exposed typed
thumbnail reads, and the released 1.0.0 SDK read published content and
revalidated the format 2 export against the 1.1.0 API.

The workspace build, root typecheck, Oxlint and Oxfmt, database schema
check, OpenAPI check and strict change validation passed. The docs suite
verified 28 routes and the generator exercised all six site variants.
The dependency audit recorded 981 locked license records and one
existing tooling advisory covered by the reviewed disposition.

The retained published 0.52.0 fixtures passed plan/apply with the packed
CLI, including refusal of edited managed files, preservation of site and
Wrangler edits, and a repeat no-op. The 108 focused release and fixture
tests passed, including rejection of invalid 1.1.0 evidence and
verification of the historical 1.0.0 receipt. Repository-wide OpenSpec
validation passed for all 96 items.

The root test run passed all 64 workspace tasks and 442 root tests. The
source operations and security verification suites passed. The clean-checkout
cross-runtime run initially reached the product tests without a built CLI.
The build stage now includes `@lacecms/cli`. After building it in that checkout,
all three affected Node/D1 import cases passed on rerun. The other 25 product
cases passed on the first run.

The first saved-artifact run also exposed a missing built host-side builder
helper at the final packed restore and rotation step. Release acceptance now
builds the local test harness before loading the saved set. The five restore
and rotation tests passed separately against the packed consumer with the
prerequisites in place. The saved runtime archives remained in use for the
separate exact-artifact rerun.

## Saved-artifact acceptance

The local reviewed source snapshot was `a67c95ff0a85c8de3331bea29b697f753e2644ba`.
Preparation and independent verification covered all sixteen archives and all
four API and builder images. Images passed smoke checks on `linux/amd64` and
`linux/arm64`. Full acceptance passed 25 journeys on `linux/arm64` with
harness revision `2ec4d8921bfa7153027989833d3861e54b5e07b8`. Both populated
upgrades applied zero migrations and both 1.0.0 restores passed. The versioned
package and image publication dry runs passed.

The saved set is under `.release-artifacts/1.1.0-a67c95ff-local`. The inventory
SHA-256 is `7929fb1bb917d0cce3c9342aff439815aef0794bd22f16e85ed8503862e5765c`.
The acceptance receipt SHA-256 is
`83f5b26d71887dd5be8165f41f13abcb5890a87d2df611891eb753e352e9dad9`.
Both records were reverified after relocating the set into the workspace.
This run used a temporary local Git revision. The publishable set uses the
final reviewed revision available in the source repository. Real VPS and
remote D1/R2 staging are owner checks described in the [handoff](handoff.md).
