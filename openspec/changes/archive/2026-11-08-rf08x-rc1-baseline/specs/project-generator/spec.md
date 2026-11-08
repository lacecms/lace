## ADDED Requirements

### Requirement: Upgrade instructions cover only the latest published template
The generated `.lace/upgrade-instructions.json` SHALL describe only the
database and configuration steps from the latest published template to the
current template, and SHALL NOT keep entries for upgrades from older
templates. Its database steps SHALL state that the baseline migration replaces
every earlier migration, so a database created before the baseline is
exported if its content must be kept, recreated, migrated, synchronized and
bootstrapped again. The generated operations guide SHALL describe the baseline
migration and SHALL NOT name numbered migrations that are no longer checked
in.

#### Scenario: rc1 project reads the next template's instructions
- **WHEN** an operator plans an upgrade of an rc1 (template `0.46.0`) project
  to the current template
- **THEN** the upgrade guidance names the database recreation step for the
  baseline and the current template's configuration step, and no step for a
  template older than rc1

#### Scenario: Generated guide names no removed migration
- **WHEN** a project is generated in any site mode
- **THEN** its operations guide mentions the baseline migration and no
  migration file that is not checked in
