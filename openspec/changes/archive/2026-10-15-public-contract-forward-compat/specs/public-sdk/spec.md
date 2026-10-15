## ADDED Requirements

### Requirement: Public SDK rejects unsupported export formats
The SDK SHALL declare the highest build-export format version it supports.
When a validated export carries a higher `formatVersion`, the SDK SHALL reject
it with a typed contract error. The error SHALL name the received and the
supported format versions and tell the operator to upgrade `@lacecms/sdk` to a
release compatible with the Lace API. It SHALL NOT include the export body or
the build credential. An export whose `formatVersion` is equal to or lower
than the supported version SHALL be accepted when it satisfies the tolerant
contract.

#### Scenario: A newer API changes the export format
- **WHEN** the SDK supports format version 1 and the export carries
  `formatVersion: 2`
- **THEN** the SDK rejects it with a contract error naming versions 2 and 1
  and advising an SDK upgrade, and returns no export

#### Scenario: The export format is supported
- **WHEN** the export carries `formatVersion: 1` and additional unknown keys
- **THEN** the SDK returns the validated export without the unknown keys

## MODIFIED Requirements

### Requirement: Public SDK validates responses and reports typed failures
The SDK SHALL validate successful JSON responses with the tolerant variants of
the shared public DTO schemas before returning them. Object keys unknown to
the contract SHALL be ignored and removed at every depth, so the returned
value holds exactly the contract's keys. Missing required keys, wrong value
types and violated value constraints SHALL still fail validation.

The SDK SHALL map a valid Lace error envelope on a non-success response to a
typed HTTP error containing its status and error code. An error code unknown
to the SDK SHALL be preserved as a string, not treated as a contract
violation. The SDK SHALL report any of the following as a typed contract
error:

- an invalid JSON body;
- a success body that fails tolerant validation;
- a non-success response without a valid tolerant error envelope.

It SHALL NOT return unchecked JSON.

#### Scenario: A server returns malformed published content
- **WHEN** a successful public response lacks a required key or carries a
  wrong value type
- **THEN** the SDK rejects it with a typed contract error and exposes no
  partially validated content to the caller

#### Scenario: A newer server returns additional keys
- **WHEN** a public page response carries an unknown key on the response, on
  the entry, on a block and on a media item, together with every required key
- **THEN** the SDK returns the page without those keys and raises no error

#### Scenario: A server rejects a public request
- **WHEN** a public resource responds with a valid Lace error envelope such as
  `NOT_FOUND` or `AUTHORIZATION_DENIED`
- **THEN** the SDK rejects it with a typed HTTP error carrying that status and
  stable error code

#### Scenario: A newer server reports an unknown error code
- **WHEN** a public resource responds with HTTP 409 and an envelope whose code
  is `FUTURE_CONDITION`
- **THEN** the SDK rejects it with a typed HTTP error carrying status 409 and
  code `FUTURE_CONDITION`
