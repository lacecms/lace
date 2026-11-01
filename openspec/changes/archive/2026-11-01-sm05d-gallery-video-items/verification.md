# Verification — sm05d-gallery-video-items

Date: 2026-11-01. Node 24.12.0 for the root test run.

| Check | Result |
| --- | --- |
| `packages/content` unit (220) and type tests | pass; `videoEmbed` metadata hash pinned unchanged |
| Repository contract `Gallery` cases on SQLite (file, memory) and D1 | pass (LIST1 v3→v5, SM5D v4→v5 + mixed publication) |
| `packages/astro` registry render tests (26) | pass |
| CLI block registry/command/site tests (36) | pass, including clean revision 6 → 7 update and edited-component conflict |
| `apps/site` fixture build + Chromium video browser test | pass (gallery ambient/player/reduced-motion/no-JS, videoEmbed isolation) |
| Admin unit suite (989+) | pass |
| Admin e2e `gallery-video-items`, `media-tags`, `media-multi-select`, `conditional-fields`, list layouts | pass, axe at 320 px |
| Full admin Playwright suite | 166 passed; `composites` pointer drag fails as on HEAD (pre-existing); `composites` keyboard edit failed once under load and passes alone |
| `create-lace` tests (64), generated-project snapshots | pass, snapshots refreshed for template 0.45.0 |
| `pnpm acceptance:starter`, `pnpm acceptance:existing-site` | pass |
| Cross-runtime suite (`vitest.cross-runtime.config.mjs`) | 7/7 pass |
| Import sample test | pass |
| Root `format:check`, `lint` (incl. boundaries/colors), `typecheck`, `test`, `build`, `openapi:check` | pass |
| `docs:check`, `docs:build` | pass |
| `openspec validate sm05d-gallery-video-items --strict`, `spec:validate` | pass (86/86) |

Not run: full `acceptance:generated` (Docker Node Compose and Cloudflare journeys).

Plan refinements recorded during apply: configuration sync stores validated
migration results (drafts gain item defaults, publications gain `kind`); empty
`videoTitle` fails in drafts too (length rules apply); visibility controllers
no longer summarize rows (new admin requirement); narrow toolbar order is
search, types, sort, tag field, Clear filters (single sort control).
