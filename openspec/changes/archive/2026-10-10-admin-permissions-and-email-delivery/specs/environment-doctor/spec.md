## ADDED Requirements

### Requirement: Doctor validates email settings without sending mail
For the `node` target, doctor SHALL validate the project environment's
`LACE_EMAIL_*`, `LACE_SMTP_*` and `LACE_RESEND_*` settings with the same
provider, sender, transport-security and pairing rules as the Node runtime.
Selecting `cloudflare` for the `node` target SHALL be reported as invalid.
Invalid settings SHALL be reported by variable name only, under the existing
deterministic output and exit rules. Doctor SHALL NOT open SMTP connections,
call provider APIs, or send messages. An absent provider SHALL be reported as
email delivery not configured, not as a failure.

#### Scenario: SMTP host is missing
- **WHEN** doctor runs for the `node` target with `LACE_EMAIL_PROVIDER=smtp`
  and no `LACE_SMTP_HOST`
- **THEN** it reports `LACE_SMTP_HOST` as invalid without contacting any mail
  server

#### Scenario: Email is not configured
- **WHEN** doctor runs without `LACE_EMAIL_PROVIDER`
- **THEN** it reports email delivery as not configured and does not fail on
  that account
