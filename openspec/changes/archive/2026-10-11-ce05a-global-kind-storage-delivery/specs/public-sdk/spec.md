## ADDED Requirements

### Requirement: Public SDK reads published globals
The SDK SHALL expose `getGlobal(modelKey)`, which validates the model key as a
public identifier, requests only `/api/v1/public/globals/:modelKey`, and returns
the validated `{global, media}` response. A `404` SHALL surface as the SDK's
typed API error, like other single public reads. The build-export operation
SHALL return the export's `globals` list, empty when the response omits it.

#### Scenario: A build reads a global
- **WHEN** a build calls `getGlobal("settings")` and the global is published
- **THEN** the SDK requests `/api/v1/public/globals/settings` and returns the
  published global and its media dictionary

#### Scenario: A malformed global response
- **WHEN** the API returns a global carrying a `path` or `draft` key
- **THEN** the SDK fails with its contract-violation error

#### Scenario: An invalid model key
- **WHEN** a caller passes an empty model key
- **THEN** the SDK refuses it before sending a request
