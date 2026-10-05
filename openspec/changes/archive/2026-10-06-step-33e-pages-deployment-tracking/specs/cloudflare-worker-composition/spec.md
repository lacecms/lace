## ADDED Requirements

### Requirement: Worker composes optional Pages tracking
The Worker SHALL validate the optional Pages tracking settings together with its other bindings, without disclosing values, and SHALL compose a site-build tracker backed by the D1 repository, the Worker clock, and a Pages deployment reader when tracking is configured, or by no reader otherwise. The deploy-hook trigger SHALL be told whether tracking is configured.

#### Scenario: Tracking settings are valid
- **WHEN** the Worker starts with a deploy hook and valid Pages tracking settings
- **THEN** identified hook acceptances are tracked and scheduled runs read the Pages deployment with the configured token

#### Scenario: Invalid tracking timeout
- **WHEN** `LACE_PAGES_TRACKING_TIMEOUT_MINUTES` is `4`, `1441`, or not an integer
- **THEN** requests receive the sanitized `503` and logs name only that variable
