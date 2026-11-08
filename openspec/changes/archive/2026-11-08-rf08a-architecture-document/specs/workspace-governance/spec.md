## ADDED Requirements

### Requirement: Architecture documentation is a guarded domain directory

The repository SHALL keep its architecture in `docs/architecture/`: a `README.md` that holds the document purpose, product goals, scope, principles and a section map, plus one Markdown file per domain. Architecture sections SHALL keep their numbers §1–§26 as stable identifiers, each section SHALL appear in exactly one file, and the section map SHALL name, for every section number, the file that holds it. Architecture files other than `history.md` SHALL describe current behavior only: roadmap change and session codes (for example `CE7D`, `SM5`, `LIST1`, `CQ1`, `MCP2`, `RF5B`) and step numbers SHALL NOT appear in them outside ADR or archive link targets; `history.md` SHALL map each such code to its archived change. The decisions section SHALL point to the ADR index instead of restating decisions. The directory SHALL stay under 2,500 lines in total, not counting lines inside fenced Mermaid blocks, and each file SHALL stay under 600 lines including diagrams. The architecture SHALL contain a Mermaid table diagram that names every table defined by the Drizzle schema of `@lacecms/db`, the primary-key columns of each table and every foreign-key relation between tables. A root repository test SHALL fail, naming the offending item, when a schema table, primary-key column or foreign-key relation is missing from the table diagram, when the diagram names a table, primary key or relation the schema does not define, when a change code appears outside `history.md`, when the section map and the section headings disagree, or when a size ceiling is exceeded.

#### Scenario: A new Drizzle table is not added to the diagram

- **WHEN** a change adds a table to the `@lacecms/db` schema without adding it to the architecture table diagram
- **THEN** the root architecture test fails and names the missing table

#### Scenario: A foreign key changes without the diagram

- **WHEN** a schema change adds or removes a foreign key and the table diagram keeps the old relations
- **THEN** the root architecture test fails and names the missing or stale relation

#### Scenario: A change code returns to the architecture body

- **WHEN** an architecture file other than `history.md` mentions a roadmap code such as `CE7D` in a heading or prose
- **THEN** the root architecture test fails and names the file, line and code

#### Scenario: A section moves without the map

- **WHEN** a section heading is moved to another file, renumbered or removed and the `README.md` section map is unchanged
- **THEN** the root architecture test fails and names the section

#### Scenario: The architecture grows past its ceiling

- **WHEN** an edit makes one architecture file reach 600 lines or the directory reach 2,500 lines outside Mermaid blocks
- **THEN** the root architecture test fails and reports the measured and allowed line counts
