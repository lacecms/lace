## MODIFIED Requirements

### Requirement: Secret exclusion and release evidence are explicit
Acceptance SHALL inspect generated shipping files, extracted package archives, selected image filesystems/configuration, static output and captured diagnostics for test credentials and secret material. Secret detections SHALL fail without echoing values; expected operator .env and persistent auth storage SHALL remain outside shipping scans. Evidence SHALL record exact artifact/source identities, platform, checks and results, preserve relevant local Node/D1 and Worker coverage, and explicitly exclude registry publication, real Cloudflare deployment and stable-release certification.

#### Scenario: Secret reaches shipping output or diagnostics
- **WHEN** a setup password, token or deployment secret occurs in a shipping surface or captured diagnostic
- **THEN** acceptance fails with the affected surface identified and the value redacted
