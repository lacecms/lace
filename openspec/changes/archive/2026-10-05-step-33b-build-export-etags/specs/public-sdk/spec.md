## MODIFIED Requirements

### Requirement: Build export supports conditional retrieval
The SDK build-export operation SHALL accept an optional prior entity tag and
send it in `If-None-Match`. On a `304` response it SHALL return an unchanged
result with the response entity tag and SHALL NOT parse a response body. On a
successful export response it SHALL validate the build-export DTO and return
the validated export with its entity tag.

The operation SHALL validate strong and weak version-derived tags, return the received validator unchanged and send a supplied validator unchanged. Missing and malformed ETag headers on `200` or `304` SHALL raise distinct `LaceContractError` messages naming the expected `"N"` or `W/"N"` format and advising a compatible API/SDK upgrade and proxy/header configuration check. A malformed value SHALL be displayed as an escaped preview of at most 80 characters after build-token redaction; diagnostics SHALL contain neither the build credential nor the export body. A changed response tag SHALL encode the export version; a `304` tag SHALL encode the supplied prior version when a prior tag was supplied.

#### Scenario: The published version is unchanged
- **WHEN** a caller supplies an entity tag for the current published version
  and the build-export endpoint returns `304`
- **THEN** the SDK reports that the export is unchanged and makes no JSON parse
  attempt

#### Scenario: The published version has changed
- **WHEN** the caller supplies a stale entity tag and the endpoint returns a
  successful build export with a replacement entity tag
- **THEN** the SDK returns the validated export and replacement entity tag

#### Scenario: A compressed response has a weak validator
- **WHEN** compression rewrites an export tag to `W/"7"`
- **THEN** the SDK accepts and returns that exact tag and can send it on the next read

#### Scenario: Header diagnostics are actionable and safe
- **WHEN** an export response lacks an ETag or carries a malformed one containing controls, a long value or the configured token
- **THEN** a distinct bounded contract error explains the expected format and recovery, escapes controls and redacts the token without including the export body

#### Scenario: A response validator disagrees with its version
- **WHEN** a `200` tag encodes a different version than its export or a `304` tag differs from the prior version
- **THEN** the SDK rejects the response as a contract violation

