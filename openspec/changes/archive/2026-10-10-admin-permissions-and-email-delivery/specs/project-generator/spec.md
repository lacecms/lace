## ADDED Requirements

### Requirement: Template 0.21.0 delivers email delivery configuration
The generator SHALL advance the managed template version to `0.21.0`. The
following SHALL be updated:

- **Managed `.env.example`:** documents the optional email settings, with the
  provider unset (`none`).
- **Managed Compose file:** passes the email settings to the API service with
  empty defaults, so an unconfigured project starts unchanged.
- **Managed `worker/.dev.vars.example`** for `--cloudflare` projects: defaults
  local development to the `log` provider.
- **Newly generated user-owned `worker/wrangler.jsonc`:** contains a commented,
  optional `send_email` binding example.
- **Managed operations and scenario guides:** explain provider selection, the
  Workers Paid requirement and sending-domain onboarding for the Cloudflare
  provider, the free-tier Resend option, SMTP transport security, the Settings
  test action, and that secrets are set with the runtime's secret mechanism.

Template upgrade instructions SHALL state:

- email is optional;
- no database migration is added;
- API and admin artifacts must be deployed together, because the admin requires
  the session-summary endpoint;
- upgrade never edits `.env`, `.env.local`, `worker/wrangler.jsonc`, the README,
  `lace.config.ts`, or site files.

Upgrades SHALL preserve user-owned files and retain deterministic managed
hashes and existing conflict detection.

#### Scenario: Project is generated without email settings
- **WHEN** a project is generated and started with an `.env` copied from
  `.env.example`
- **THEN** the API starts with email delivery reported as not configured

#### Scenario: Existing project upgrades to 0.21.0
- **WHEN** a 0.20.0 project with unmodified managed files is upgraded
- **THEN** managed email guidance and environment examples are updated and its
  `.env` and `worker/wrangler.jsonc` are unchanged
