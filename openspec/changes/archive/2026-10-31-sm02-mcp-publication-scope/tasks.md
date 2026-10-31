## 1. Architecture and planning documents

- [x] 1.1 Update `docs/mvp-architecture.md` §3 *Included* MCP bullet and the MCP paragraph of §5 (publish scope, admin-only consent, retained unpublish/delete ban) and add `docs/adr/0015-mcp-publication-scope.md`; verify with `git diff` that no other invariant changes
- [x] 1.2 Mark SM2 `in progress` in `docs/site-migration-roadmap.md`; verify the overview table and progress log agree

## 2. OAuth scopes and consent

- [x] 2.1 Add `content:publish` to `MCP_OAUTH_SCOPES` and make `normalizeMcpScopes` add write and read for publish requests; verify `packages/auth` tests for normalization order, implied scopes, unknown-scope rejection and both discovery metadata documents advertising the scope
- [x] 2.2 Return `canPublish` in consent details and refuse an approval containing `content:publish` when the current role lacks the permission (`access_denied`, no grant); verify auth tests for administrator approval, editor refusal, editor narrower approval and viewer behavior unchanged
- [x] 2.3 Map the publish scope in `mcp-actor.ts` to permission `content:publish` and operation `publish`, accepting `content:publish` as a required scope; verify tests for publish-scoped, write-only and read-only tokens and for a demoted administrator

## 3. Application and contracts

- [x] 3.1 Add `publish` to `delegatedContentOperations`; verify application tests that a publish-scoped delegated administrator can publish while unpublish, delete, revert and duplicate stay denied for every delegated actor, and that a read/write grant cannot publish
- [x] 3.2 Add `mcpToolArgumentSchemas.publish_entry` (strict `entryId`, `expectedRevision`, optional `idempotencyKey` using the REST schema) and extract the REST publication result enrichment (`seo`, `updatedBy`) into a shared helper used by REST; verify contracts tests and that REST publish responses and OpenAPI are unchanged (`pnpm openapi:check`)

## 4. MCP tool and HTTP boundary

- [x] 4.1 Add the `publish_entry` tool to `packages/mcp` calling the shared publication operation and returning the shared result; verify MCP tests for success, replay with the same idempotency key, stale revision, validation, route conflict and unavailable-link errors as tool errors, and tool lists of five (read/write) and six (publish) tools
- [x] 4.2 Require scope `content:publish` for `tools/call` of `publish_entry` in the `/mcp` route; verify server tests that a write-only token receives 403 `insufficient_scope` with `scope="content:publish"` before content work and that the token never reaches logs
- [x] 4.3 Extend the OAuth/MCP compatibility suites (`scripts/fixtures/oauth-mcp`: lifecycle, equivalence, Worker) for consent with publish, tool invocation, REST/MCP result equivalence, a single coalesced build and unchanged ban on unpublish/delete on Node and local Worker; verify `pnpm compat:mcp`

## 5. Admin application

- [x] 5.1 Add the third consent choice "Read, edit and publish" with next-build note, disabled explanation without permission, read default and updated ban text in `McpConsentForm`; verify admin unit tests and an accessible-name check for all three radios
- [x] 5.2 Extend `McpAccess` with `publish` and the Settings card choice "Publishing" for Codex CLI, TOML, Claude Code and Gemini recipes with administrator-only, next-build and unpublish/delete notes; verify admin unit tests that every recipe carries exactly the selected scopes and that switching clients keeps the choice
- [x] 5.3 Show "Publish" for publish-scoped grants in Account MCP connections; verify the connections unit test
- [x] 5.4 Update admin browser tests for consent and Settings MCP setup, including 320px width and keyboard use of the new choice; verify they pass in Chromium

## 6. Documentation

- [x] 6.1 Update `docs/mcp.md` (scopes, consent, `publish_entry` arguments and idempotent retries, insufficient-scope re-consent, retained bans, security notes); verify the documentation checks pass
- [x] 6.2 Update the managed `packages/create-lace/templates/docs/lace-mcp.md` with the publishing scope recipes and bans, bump `TEMPLATE_VERSION` to 0.41.0 with an `.lace/upgrade-instructions.json` entry (no migration; re-authorize clients to gain publication), refresh generated-project snapshots; verify create-lace tests, `tests/consumer-guides.test.mjs` and `pnpm acceptance:starter`

## 7. Verification and completion

- [x] 7.1 Run root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check`, `pnpm compat:mcp` and the CI steps in `.github/workflows/ci.yml`; record results in `verification.md`
- [x] 7.2 Run `pnpm exec openspec validate sm02-mcp-publication-scope --type change --strict` and update the roadmap progress log; verify validation passes
