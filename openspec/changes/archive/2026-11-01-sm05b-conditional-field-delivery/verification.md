# SM5B verification

Date: 2026-11-01. Root commands ran on pinned Node 24.12.0.

## Narrow checks

| Check | Result |
| --- | --- |
| `@lacecms/content` tests, `type-test` | pass (217 tests; declared rules, hidden-link `delivered`, published value types) |
| `@lacecms/config` typecheck, `type-test` | pass (model `visibility` inference, optional targets, unopted unchanged) |
| `@lacecms/application` tests | pass (projection, references, hidden/visible links, stale revision, copy path, server paths, create) |
| `@lacecms/cli` import validation | pass (hidden over-long value rejected, hidden required not demanded) |
| `@lacecms/db` tests | pass (projection rowsets, key-set and media checks, projected SQL) |
| Repository contract, Node SQLite (file and in-memory) | 209/209 pass, including 4 new conditional publication cases |
| Repository contract and package tests, local D1 | 217/217 pass (104 contract cases) |
| In-memory store | pass (projected publication through `ContentUseCases`) |
| `@lacecms/render` tests and type tests | 106 pass; hidden data and hidden defaults removed, optional targets |
| `@lacecms/mcp` tests | 5 pass (descriptions, REST-equal rules, projected `get_entry`) |
| `@lacecms/contracts` tests | 156 pass (public DTO without hidden required targets, OpenAPI text) |
| Cross-runtime suite (`vitest.cross-runtime.config.mjs`) | 7/7 pass; conditional publication, public collection and global reads, build export, admin read and draft query identical on Node and the local Worker |
| D1 HTTP budgets (`vitest.d1-budgets.config.mjs`) | 4/4 pass |

## Root checks (CI order)

| Command | Result |
| --- | --- |
| `pnpm format:check` | pass |
| `pnpm lint` | pass (0 errors; two pre-existing warnings in untouched files) |
| `pnpm typecheck` | pass |
| `pnpm test` | pass (44 turbo tasks; 34 root files, 225 tests) |
| `pnpm build` | pass |
| `pnpm acceptance:starter` | pass |
| `pnpm acceptance:existing-site` | pass |
| `pnpm docs:check`, app-docs `test:variants` | pass |
| `pnpm openapi:check` | pass (regenerated `api-v1.json`) |
| `pnpm spec:validate` | 86 passed, 0 failed |
| `pnpm exec openspec validate sm05b-conditional-field-delivery --type change --strict` | valid |

Not run: Docker Node Compose journey and `acceptance:cloudflare`; neither
touches the changed publication path beyond what the cross-runtime suite covers.
