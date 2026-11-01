## ADDED Requirements

### Requirement: Operations guide documents content import
The generated operations guide SHALL contain an *Import content* section that
documents running `pnpm exec lace import <dir>` from the project root against
the project's own API: issuing an import token in Settings (allowing
publishing only when `--publish` is used), exporting `LACE_IMPORT_TOKEN` for
the shell session only and never writing it to `.env`, the origin for the Node
runtime (`http://127.0.0.1:3000` by default) and, in projects generated with
`--cloudflare`, for the local Worker (`http://127.0.0.1:8787`), validating with
`--validate-only` and reviewing with `--dry-run` before importing, that reruns
are safe and edited drafts are reported as conflicts, and that the state file
stays out of source control. It SHALL link to the public *Import content* page
for the format. The generated README SHALL mention the command. No package
script SHALL be generated for import.

#### Scenario: Operator imports into a local Node project
- **WHEN** an operator follows the section in a project generated without
  `--cloudflare`
- **THEN** the guide gives the Node origin, the token steps and the validate,
  dry-run and import commands, and names no Worker origin

#### Scenario: Operator imports into the local Worker
- **WHEN** an operator follows the section in a project generated with
  `--cloudflare`
- **THEN** the guide also gives the local Worker origin and states that the
  Worker must be running
