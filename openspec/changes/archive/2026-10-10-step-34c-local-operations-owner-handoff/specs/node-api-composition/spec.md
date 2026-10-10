## ADDED Requirements

### Requirement: Node identifies its installed engine release
The default Node composition SHALL supply the installed platform package's full release version as server environment metadata in development, packaged consumers and API images. It SHALL NOT default to the private app/root version `0.0.0`, infer the release from request headers or user-project manifests, or require an operator setting to identify the engine. An explicitly supplied environment metadata override for an embedding caller SHALL remain supported. The default settings-status and OpenAPI metadata SHALL agree with the installed engine artifact.

#### Scenario: Packed Node installation identifies itself
- **WHEN** a consumer runs the API image or installed Node platform package without a metadata override
- **THEN** authenticated settings status and OpenAPI metadata report the version of that engine artifact

#### Scenario: Caller supplies metadata
- **WHEN** an embedding caller explicitly supplies server environment metadata
- **THEN** that metadata remains the source used by the server
