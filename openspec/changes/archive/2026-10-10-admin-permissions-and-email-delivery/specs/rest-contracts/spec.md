## ADDED Requirements

### Requirement: Admin session and email contracts are closed and validated
The shared contracts SHALL define a closed permission picklist containing
exactly `content:read`, `content:write`, `content:publish`, `media:write`,
`users:manage`, and `settings:manage`. They SHALL also define an admin
session-summary DTO with a strict `user` object (`id`, `email`, optional
`displayName`, and `role`) and a `permissions` array of unique picklist values.
The admin settings-status DTO SHALL gain a required `email` object with
`provider` from `none`, `log`, `smtp`, `resend`, `cloudflare` and a `from`
sender address present exactly when the provider is not `none`. The email-test
result DTO SHALL be either `{ status: "sent" }` or
`{ status: "failed", reason }` with a reason from `not_configured`,
`invalid_message`, `rejected`, `rate_limited`, `unavailable`. These DTOs SHALL
reject unknown fields and SHALL contain no credentials, hosts, ports, keys, or
provider error text. The generated OpenAPI document SHALL include them.

#### Scenario: Session summary carries an unknown permission
- **WHEN** a session-summary payload lists a permission outside the closed
  picklist
- **THEN** contract validation rejects the payload

#### Scenario: Status reports no provider
- **WHEN** the settings-status payload reports email provider `none` with a
  `from` address
- **THEN** contract validation rejects the payload

#### Scenario: Email test fails
- **WHEN** a test send fails because the provider quota is exceeded
- **THEN** the validated result is `{ status: "failed", reason: "rate_limited" }`
