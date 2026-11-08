# ADR 0028: Spec-driven delivery and workspace toolchain

- Status: Accepted
- Date: 2026-11-08
- Governing architecture: [section 4.8](../architecture/README.md#48-spec-driven-delivery),
  [section 6](../architecture/workspace.md#6-repository-structure) and
  [section 19](../architecture/workspace.md#19-dependency-policy)

This record states a decision taken with the MVP baseline. It was previously
listed in architecture §24 and §25 and is recorded here retroactively.

## Context

Lace is developed largely with coding agents. Changes must be planned,
reviewed and verified against written behavior, and the workspace must give
fast, deterministic feedback.

## Decision

- Implementation follows the repository-local OpenSpec `spec-driven`
  workflow: proposal, delta specs, design and tasks before code; apply and
  archive only on explicit request.
- The workspace uses pnpm workspaces with Turborepo for dependency-aware tasks.
- Oxlint and Oxfmt are the linting and formatting toolchain; ESLint and
  Prettier are not used.

## Consequences

- Accepted specs in `openspec/specs/` are the detailed behavior authority
  below the architecture.
- Lint and format configuration lives in `.oxlintrc.json` and `.oxfmtrc.json`.

## Alternatives considered

- **Ad-hoc issue-driven changes.** Rejected: no reviewable contract for agents.
- **ESLint and Prettier.** Rejected: slower, and plugin sprawl.
