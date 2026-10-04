## MODIFIED Requirements

### Requirement: Upgrade inputs are validated before planning
The planner SHALL read a project manifest and an explicitly selected pristine target template directory with a manifest. It SHALL accept only schema version 1, a nonempty template version, an optional site record (`mode` `starter` with path `site`, `existing` with a safe relative path, or `none` with `null`), safe relative POSIX file paths, explicit user/managed ownership, and lowercase SHA-256 digests for managed files only. A manifest without a site record SHALL be read as starter mode with path `site`. It SHALL refuse unknown formats, malformed metadata, paths under `.lace`, traversal, symbolic links, nonregular managed files, and target bytes whose hashes differ from the target manifest. It SHALL refuse a target template whose site mode or path differs from the project's, naming the `create-lace` flags that generate a matching template. `site/**` and `lace.config.ts` SHALL never be classified as managed. It SHALL NOT load project code, access runtime databases or require runtime credentials.

#### Scenario: Future manifest format
- **WHEN** either manifest declares a schema version newer than 1
- **THEN** planning fails with an actionable manifest error and neither directory changes

#### Scenario: Unsafe template
- **WHEN** a managed path traverses outside the project, uses a symlink, or target bytes fail their declared hash
- **THEN** planning fails before producing an actionable plan without reading through the unsafe path

#### Scenario: Template generated for another site mode
- **WHEN** a project recorded as existing site at `..` is planned against a starter-mode template
- **THEN** planning fails with an input error naming `--existing-site ..` and neither directory changes

#### Scenario: Legacy starter project
- **WHEN** a project manifest without a site record is planned against a starter-mode template
- **THEN** planning proceeds and an applied upgrade records starter mode with path `site`
