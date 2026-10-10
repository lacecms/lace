## ADDED Requirements

### Requirement: Settings shows email delivery and sends a self-addressed test email
Settings → Site status SHALL show a read-only "Email delivery" card from the
validated authenticated status response. The card SHALL name the configured
provider: "Not configured" for `none`, "Development log" for `log`, "SMTP",
"Resend", or "Cloudflare Email Service". For every provider other than `none`
it SHALL also show the sender address. It SHALL never show hosts, ports,
usernames, keys, or other provider settings. Refresh status SHALL refresh the
card with the other status data, and unavailable status SHALL reuse the existing
loading, error, retry, and stale-value behavior.

When a provider other than `none` is configured, the card SHALL offer **Send test
email**. The action SHALL send a fixed test message to the signed-in
administrator's own account address. The recipient SHALL never be entered or
chosen in the browser. While the request is pending the action SHALL be
disabled. On `sent` the admin SHALL announce that the provider accepted the
message for the administrator's address. On `failed` it SHALL show a
reason-specific explanation for `not_configured`, `invalid_message`,
`rejected`, `rate_limited` and `unavailable`, without provider error text. A
rate-limited request SHALL show the closed rate-limit message. The action SHALL
be unavailable to sessions without `settings:manage`, consistent with the
existing Settings access-denied behavior.

#### Scenario: Delivery is not configured
- **WHEN** an administrator opens Settings and the status reports provider `none`
- **THEN** the Email delivery card reads "Not configured" and offers no Send test
  email action

#### Scenario: Administrator sends a test email through SMTP
- **WHEN** an administrator with provider `smtp` selects Send test email and the
  provider accepts the message
- **THEN** a notification states that the test message was accepted for the
  administrator's own address

#### Scenario: Provider rejects the sender
- **WHEN** the test request returns `failed` with reason `rejected`
- **THEN** the card explains that the provider rejected the sender or recipient
  and suggests checking the sender domain, without showing provider error text

#### Scenario: Editor opens Settings
- **WHEN** an editor opens `/settings`
- **THEN** the screen shows access denied and issues no status or test-email
  request
