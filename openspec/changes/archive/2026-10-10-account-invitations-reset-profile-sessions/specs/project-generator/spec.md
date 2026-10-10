## ADDED Requirements

### Requirement: Template 0.22.0 delivers account-lifecycle upgrade instructions
The generator SHALL advance the managed template version to `0.22.0`. Template
upgrade instructions SHALL state that Lace engines with invitations and
password recovery require migration `0004`. For Compose they SHALL give the
stop, back up, migrate and restart sequence; for Cloudflare, the D1 backup and
remote migration before deploy. They SHALL state that API and admin artifacts
must be deployed together, that administrators now invite users instead of
setting their passwords, and that outgoing account email is optional, with
links handed to the administrator when email is not configured. Upgrades SHALL
preserve user-owned files and retain deterministic managed hashes and existing
conflict detection.

#### Scenario: Existing project upgrades to 0.22.0
- **WHEN** a 0.21.0 project with unmodified managed files is upgraded
- **THEN** the upgrade instructions describe migration `0004` and coordinated
  deployment, and user-owned files are unchanged
