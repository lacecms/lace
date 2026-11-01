## MODIFIED Requirements

### Requirement: Evidence distinguishes source tests and candidate acceptance
The verification record written by each run SHALL identify source revision and working-tree state, tool versions, commands, runtime/scenario results, public-contract decision and candidate package/image inventory when artifacts are used. Exact-artifact checks SHALL reference verified checksums and image identities from the final candidate; workspace-only tests SHALL be explicitly identified. Missing or stale candidate artifacts SHALL prevent an exact-artifact success claim. Shipped-behavior changes SHALL require newly reviewed candidate artifacts before final candidate acceptance is claimed. Local simulation SHALL NOT count as real VPS/Cloudflare deployment evidence, stable-release approval, or completion of the security and operations verifications.

#### Scenario: Existing candidate is reused
- **WHEN** candidate identity and checksums match a previously verified prepared inventory and shipped behavior is unchanged
- **THEN** local artifact acceptance can reuse that set while separately recording current-source contract results

#### Scenario: Only source tests are available
- **WHEN** tests pass in the workspace but exact candidate acceptance has not run
- **THEN** the record reports source verification only and leaves candidate acceptance unverified
