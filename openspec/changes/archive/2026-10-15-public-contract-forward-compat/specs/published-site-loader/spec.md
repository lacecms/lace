## MODIFIED Requirements

### Requirement: Loader failures carry stable codes and hints
Loader failures SHALL be SDK errors with one of these stable codes:

- `missing_configuration`;
- `rejected_token` for HTTP 401 or 403 from the build export;
- `api_unavailable` for transport failures, including timeouts;
- `version_mismatch`;
- `invalid_export`.

An export whose `formatVersion` is newer than the SDK supports SHALL fail with
`invalid_export`. Its message SHALL name both format versions and advise
upgrading `@lacecms/sdk`. Other SDK failures, such as other HTTP errors and
other contract violations, SHALL propagate unchanged. Messages SHALL be
project-neutral, SHALL never contain the build token, and SHALL preserve the
underlying failure as the cause. A caller-supplied hint for a code SHALL be
appended to that code's message.

#### Scenario: The API rejects the token
- **WHEN** the build export responds with HTTP 401
- **THEN** the loader fails with `rejected_token`, the message omits the token, and the HTTP error is the cause

#### Scenario: A generated project names its commands
- **WHEN** a loader created with a hint for `api_unavailable` cannot reach the API
- **THEN** the `api_unavailable` message ends with that hint

#### Scenario: An unrelated HTTP failure
- **WHEN** the build export responds with HTTP 500 and a valid error envelope
- **THEN** the loader rethrows the SDK HTTP error unchanged

#### Scenario: The API serves a newer export format
- **WHEN** the API returns an export with `formatVersion: 2` to a loader whose
  SDK supports format 1
- **THEN** the loader fails with `invalid_export`, the message advises
  upgrading `@lacecms/sdk`, and the SDK contract error is the cause
