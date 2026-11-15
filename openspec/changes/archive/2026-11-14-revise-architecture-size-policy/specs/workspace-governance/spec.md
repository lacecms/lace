## MODIFIED Requirements

### Requirement: Architecture documentation is a guarded domain directory

The repository SHALL keep its architecture in `docs/architecture/`: a `README.md` that holds the document purpose, product goals, scope, principles and a section map, plus one Markdown file per domain. Architecture sections SHALL keep their numbers §1–§26 as stable identifiers, each section SHALL appear in exactly one file, and the section map SHALL name, for every section number, the file that holds it. Architecture files other than `history.md` SHALL describe current behavior only: roadmap change and session codes (for example `CE7D`, `SM5`, `LIST1`, `CQ1`, `MCP2`, `RF5B`) and step numbers SHALL NOT appear in them outside ADR or archive link targets; `history.md` SHALL map each such code to its archived change. The decisions section SHALL point to the ADR index instead of restating decisions. The root architecture check SHALL warn without failing when the directory exceeds 3,000 nonblank lines outside fenced Mermaid blocks, and SHALL fail when any file exceeds 600 lines outside fenced Mermaid blocks, including blank lines. Whitespace-only lines count as blank; diagram fences and their contents do not count in either measure. The check SHALL report the measured count and threshold in each size diagnostic. The architecture SHALL contain a Mermaid table diagram that names every table defined by the Drizzle schema of `@lacecms/db`, the primary-key columns of each table and every foreign-key relation between tables. A root repository test SHALL fail, naming the offending item, when a schema table, primary-key column or foreign-key relation is missing from the table diagram, when the diagram names a table, primary key or relation the schema does not define, when a change code appears outside `history.md`, when the section map and the section headings disagree, or when a per-file size limit is exceeded.

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

#### Scenario: Directory review threshold is crossed

- **WHEN** the directory has 3,001 nonblank lines outside Mermaid blocks and no file exceeds its limit
- **THEN** the root architecture check reports a warning with the measured count and threshold and succeeds

#### Scenario: Directory is at its review threshold

- **WHEN** the directory has 3,000 nonblank lines outside Mermaid blocks
- **THEN** the size check emits no directory warning

#### Scenario: The architecture grows past its ceiling

- **WHEN** a file has 601 lines outside Mermaid blocks, including blank lines
- **THEN** the root architecture check fails and names the file, measured count and limit

#### Scenario: A file is at its limit

- **WHEN** a file has 600 lines outside Mermaid blocks, including blank lines
- **THEN** the per-file size check accepts it

#### Scenario: Diagrams and whitespace are counted consistently

- **WHEN** a file contains a fenced Mermaid diagram, blank lines and whitespace-only lines
- **THEN** neither count includes the diagram or its fences; the directory count excludes blank and whitespace-only lines while the file count includes them
