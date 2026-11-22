# Verification

All commands ran from the repository root. The Worker measurements include session
authentication and completion of the request's registered background work.
[Per-phase measurements and fixture conditions](../../../../docs/verification.md#media-draft-detachment)

| Check | Command | Outcome |
| --- | --- | --- |
| Application permissions and media commands | `pnpm --filter @lacecms/application exec vitest run src/media/use-cases.test.ts src/content/authority.test.ts` | 15 tests passed |
| Persistence and concurrent updates | `pnpm --filter @lacecms/test-utils exec vitest run src/application-persistence/media-usage.test.ts` | 12 tests passed |
| Shared repository contract | `pnpm --filter @lacecms/platform-node exec vitest run src/repository-contract.test.ts -t 'admits up to fifty\|detaches a named'` and the same command with `@lacecms/platform-cloudflare` | 4 SQLite and 2 local D1 cases passed |
| Wire contract and packaged exports | `pnpm --filter @lacecms/contracts exec vitest run src/media/queries.test.ts` and `pnpm --filter @lacecms/contracts exec vitest run --config vitest.packaged.config.mjs src/packaged-exports.packaged.test.mjs` | 4 schema and 2 packaged tests passed |
| REST and OpenAPI | `pnpm --filter @lacecms/server exec vitest run src/routes/media.test.ts src/routes/openapi-contract.test.ts` | 18 tests passed |
| Generated contract | `pnpm openapi:generate` followed by `pnpm openapi:check` | Regeneration matched byte for byte. The check compared against the candidate snapshot in a temporary Git index. |
| Authenticated HTTP | `pnpm exec vitest run --config vitest.verification.config.mjs tests/media-detachment.acceptance.mjs --silent=false` | Both runtime cases passed with 0, 1, 2, 50 and 51 owners. Each successful step changed exactly its named draft. |
| Mixed Worker budgets | `pnpm --filter @lacecms/platform-cloudflare exec vitest run src/worker-dispatch.test.ts src/reference-worker-budget.test.ts --silent=false` | 9 tests passed, including the maximum mixed draft and scheduled dispatch |
| Existing maximum-draft HTTP budget | `pnpm exec vitest run --config vitest.verification.config.mjs tests/d1-http-budgets.acceptance.mjs -t 'create/save/publish accepts 200'` | Passed |
| Admin client, dialog and recovery | `pnpm --filter @lacecms/app-admin exec vitest run src/features/delete-media src/shared/api/admin-client-media.test.ts src/widgets/media-library/MediaDetailsPanel/MediaDetailsPanel.test.tsx` | 42 tests passed |
| Browser confirmation | `pnpm --filter @lacecms/app-admin exec playwright test e2e/media-deletion.e2e.ts` | Chromium confirmed the admission, entry, finish and pending state |
| Documentation | `pnpm docs:check` | Passed |
| Workspace and change | `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm exec openspec validate bound-media-draft-detachment --type change --strict` | All passed |

The largest measured detach request used 43 statements, a 35-statement batch
and 100 binds on the 200-block draft. With five due deletions and a due build,
the Worker processed two deletion events and one build in the post-commit pass.
Zero-use admission used 33 statements and finish used 32.
