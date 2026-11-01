## ADDED Requirements

### Requirement: Internal documentation is indexed and link-checked

The repository SHALL keep an index of internal documentation (`docs/README.md`) listing every Markdown file under `docs/`, including archived roadmaps, with a status of `authoritative`, `internal note` or `historical` and the architecture section or capability it details, and an ADR index (`docs/adr/README.md`) listing every ADR by number, title and status. Relative Markdown links in the root `README.md`, `DEVELOPMENT.md`, `AGENTS.md`, `backlog.md` and every file under `docs/` SHALL resolve to an existing file or directory. A repository test SHALL fail when a link target is missing, when a `docs/` file has no index row, or when an ADR has no ADR-index row. Verification run records, per-release readiness narratives and other evidence of completed work SHALL NOT be stored under `docs/`; the archived OpenSpec changes, archived roadmaps and ADRs are the repository's history.

#### Scenario: Document is deleted or moved
- **WHEN** a contributor deletes or moves a file under `docs/` and another document still links to its old path
- **THEN** the root test fails naming the linking document and the missing target

#### Scenario: Document is added without an index row
- **WHEN** a new Markdown file is added under `docs/` or `docs/adr/` without an index row
- **THEN** the root test fails naming the file

#### Scenario: Index is complete
- **WHEN** every `docs/` file and ADR has an index row and every relative link resolves
- **THEN** the root test passes
