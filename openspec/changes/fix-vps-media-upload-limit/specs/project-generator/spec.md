## ADDED Requirements

### Requirement: Upload-limit template upgrade protects ownership
The generator SHALL advance the managed template version to `0.31.0`, deliver
the web proxy configuration with the media upload and JSON body limits,
deliver a template upgrade instruction that explains the fix and the need to
recreate the `web` service, and retain deterministic managed hashes and
existing conflict detection. The instruction SHALL state that no new API,
admin, CLI or builder artifact is required.

#### Scenario: Upgrade from 0.30.0
- **WHEN** a consumer with unmodified 0.30.0 managed files applies the 0.31.0
  template upgrade
- **THEN** `deploy/nginx.conf` carries the new limits, the instruction names
  the `web` service recreation, and user README, configuration and site files
  are unchanged

#### Scenario: Edited proxy configuration
- **WHEN** the consumer has modified `deploy/nginx.conf`
- **THEN** the upgrade reports a managed-file conflict instead of overwriting
  it
