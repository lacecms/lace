## ADDED Requirements

### Requirement: Worker identifies its bundled engine release
The Worker composition SHALL supply the bundled Cloudflare platform package's complete release version as server environment metadata in local and deployed consumer Workers. It SHALL NOT report `0.0.0` by default, infer a release from request headers or consumer package versions, or require an operator-maintained version variable. Release identity SHALL be available without filesystem access or an external request. Settings-status and OpenAPI metadata SHALL agree with the bundled engine artifact, and the matching packaged admin SHALL render that server-confirmed version.

#### Scenario: Independent local Worker identifies itself
- **WHEN** a generated consumer bundles an installed Cloudflare platform package and runs locally
- **THEN** authenticated settings status and OpenAPI report that package's full engine version without access to the engine checkout

#### Scenario: Consumer project has another version
- **WHEN** the user-owned project version differs from the installed engine release
- **THEN** Worker operational metadata still identifies the installed engine release
