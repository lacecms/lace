# SM1 verification

Date: 2026-10-31. Branch: `codex/site-migration-roadmap`.

## Implemented behavior

- videoEmbed v2 provides required aspect-ratio and playback choice cards, with
  `16:9` / `player` defaults and an identity migration.
- Provider descriptions expose deterministic `ambientSrc` alongside unchanged
  player URLs, ignoring input playback/tracking options.
- Registry revision 2 supports ambient mounting, inert posters, ratio hooks,
  focus-revealed source links and player fallbacks for reduced motion / no JS.
- Root/starter model versions, all three site copies and their hashes, template
  0.40.0, six generator snapshots and upgrade documentation are updated.
- `registry/registry.json` already indexes the same videoEmbed manifest; its
  entry needs no change. CLI builds bundle the updated registry byte for byte.

## Verification results

| Check | Result |
| --- | --- |
| Content unit tests | Pass, 181 tests; canonical URLs, metadata, defaults and invalid settings |
| Render unit tests | Pass, 104 tests; both URLs and contextual errors |
| Astro tests | Pass, 76 tests; all playback/poster combinations and structural markup |
| SQLite/D1 migration contract | Pass on file-backed SQLite, memory SQLite and local D1; draft/published/hidden data, envelope, poster usage, settings, invalid-save isolation and idempotence |
| CLI registry/install tests | Pass, 29 tests; components, CSS, clean installation, edited-source conflicts and `.new` proposals |
| Reference-site tests | Pass, 4 tests including static builds and Chromium journeys |
| Admin block-editor tests | Pass, 11 tests; setting defaults, choice-card authoring, viewer access and conflict recovery |
| Generator tests | Pass, 64 tests |
| Generator snapshots | Six variants regenerated twice with identical output; verified again by starter acceptance |
| Cross-runtime video acceptance | Pass on Node/SQLite/MinIO and local Worker/D1/R2; metadata projection, default/custom settings, rejection, immutable publication, media and authorization |
| `pnpm typecheck` | Pass, root workspace and project config |
| `pnpm lint` | Pass, Oxlint and boundary/color checks |
| `pnpm format:check` | Pass, Oxfmt |
| `pnpm openapi:check` | Pass |
| `pnpm docs:check` | Pass, 19 pages, local links/resources, types and tests |
| `pnpm --filter @lacecms/app-docs test:variants` | Pass, extra locale and fixed version |
| `pnpm build` | Pass, run by both packed acceptance commands before packaging |
| `pnpm acceptance:starter` | Pass; 15 packed packages, frozen installation, typecheck and builds |
| `pnpm acceptance:existing-site` | Pass; connection, public media, hooks, safe links and edited-source preservation |
| `pnpm spec:validate` | Pass, 84 items, no failures |
| Strict change validation | Pass, `pnpm exec openspec validate sm01-video-embed-playback --type change --strict` |
| `pnpm test` | Pass; 44 workspace tasks, then 33 root files / 222 root tests on pinned toolchain |

Chromium checks cover pointer/Enter/Space player activation, active ambient URL
and permissions, inert visible posters, source-link focus reveal, selected ratio,
six ambient blocks initialized twice without duplicates, reduced-motion fallback
and no-JS player geometry. Static HTML checks exclude templates/noscript and
confirm that neither ambient fixture contains a live iframe.

## Execution notes and limits

The shell's fallback pnpm is 11.25.0. Checks used pinned pnpm 12.3.4 through
Corepack, with a temporary PATH shim so nested pnpm scripts use the same version.
The initial Node 24.22.1 run passed workspace tests but the release-artifact
failure-injection test requires exactly Node 24.12.0. The final root run uses
installed Node 24.12.0 and pnpm 12.3.4.
Sandboxed local-server checks initially failed with EPERM; successful reruns used
approved local test execution. Initial failures also exposed a stale v1 admin
fixture and incorrect paths in the new test fixtures; these were corrected and
focused checks rerun successfully. The added structural CSS also crossed Astro's
stylesheet extraction threshold: the existing-site test now checks the full
build output for the styling hook, covering both inlined and extracted CSS.
Both previously failing root test files pass on the pinned toolchain (9 tests).

Provider browser requests use local stubs. Real provider availability, domain
embedding policy and device autoplay restrictions remain site-owner smoke checks.
Ambient intentionally has no pause control; the documented WCAG 2.2.2 limitation
and a site-owned stop-control example follow the owner's approved design.
No remote service was deployed, no existing installation was synchronized, and
the five capability deltas are synchronized into accepted specs. The completed
change is archived at
`openspec/changes/archive/2026-10-31-sm01-video-embed-playback`.
Main-spec validation passed for all 82 capabilities before archiving.
