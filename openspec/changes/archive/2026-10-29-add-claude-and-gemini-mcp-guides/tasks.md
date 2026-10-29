## 1. Add client-specific connection recipes

- [x] 1.1 Record MCP3 and its MCP2 dependency in `backlog.md` without changing unrelated ordering; extend the existing pure formatter with Claude HTTP/add-json and Gemini settings JSON using selected scopes and safe shell/JSON escaping. Verify formatter tests parse both access modes, preserve non-default endpoints, and pass an intact JSON argument through a harmless shell substitute; confirm syntax against the cited official docs/current available CLI help.
- [x] 1.2 Add Claude Code and Gemini CLI panels to the existing MCP Settings card, with copy controls, correctly labelled terminal versus interactive sign-in steps, merge/update guidance and persistent access selection. Wrap the client tab list on narrow screens. Verify focused component tests cover both new recipes, access changes, copy success/failure, existing Codex/disabled/error/auth behavior and absence of mutation requests.

## 2. Document and verify the Settings extension

- [x] 2.1 Update `docs/mcp.md` and the contributor setup summary with the exact new recipes, their scope syntax and sign-in locations. Verify examples match the UI and source links, preserve browser consent and current-role limits, and make no unsupported web-Gemini or external-client acceptance claim.
- [x] 2.2 Verify all client panels and copy actions in a real browser at desktop and 320px width using keyboard navigation; record no horizontal page overflow. Run focused formatter/Settings regressions, root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm exec openspec validate add-claude-and-gemini-mcp-guides --type change --strict`; record results and the limits of documentation-only client verification.
