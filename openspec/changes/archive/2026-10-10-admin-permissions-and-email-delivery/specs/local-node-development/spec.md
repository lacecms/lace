## ADDED Requirements

### Requirement: The local Node stack captures outgoing email
The documented local Node development stack SHALL include a pinned local mail
capture service that accepts SMTP from the API container and offers a web
inbox on a documented local port. The local API SHALL be configured with the
`smtp` provider, development-only unencrypted transport, and a non-routable
development sender, so that no message leaves the developer's machine. The
local environment template SHALL contain no real mail credentials. Local
Cloudflare development templates SHALL default to the `log` provider. The
acceptance stack SHALL use the same capture configuration.

#### Scenario: Developer sends a test email locally
- **WHEN** a developer starts the local Node stack and an administrator sends a
  test email from Settings
- **THEN** the message appears in the local capture inbox and is not delivered
  to any external host

#### Scenario: Local environment is created
- **WHEN** the local environment is created from its template
- **THEN** it configures the capture service without any real provider key or
  password
