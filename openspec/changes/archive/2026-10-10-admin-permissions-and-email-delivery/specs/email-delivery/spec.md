## Purpose

Provides a portable way for Lace to send transactional email through an
operator-selected provider on Node and Cloudflare, with closed delivery
outcomes, validated configuration, secret-safe diagnostics, and local capture
for development.

## ADDED Requirements

### Requirement: Email delivery reports closed outcomes through one portable port
The system SHALL send transactional email through one runtime-neutral delivery
capability that accepts a single recipient address, a subject, a plain-text
body, and an optional HTML body, and uses the configured sender identity. Every
delivery attempt SHALL resolve to exactly one closed outcome: `sent`, or
`failed` with one reason from `not_configured`, `invalid_message`, `rejected`,
`rate_limited`, or `unavailable`. Provider exceptions, network errors, timeouts
and provider-specific codes SHALL be mapped to these reasons and SHALL NOT
escape to callers. A recipient or subject containing a carriage return or line
feed, or a recipient that is not a single valid address, SHALL fail with
`invalid_message` before any provider is contacted. A `sent` outcome SHALL mean
only that the provider accepted the message, not that it was delivered.

#### Scenario: Provider accepts a message
- **WHEN** a valid message is sent and the configured provider accepts it
- **THEN** the outcome is `sent`

#### Scenario: Header injection is attempted
- **WHEN** a message subject contains a line feed followed by an extra header
- **THEN** the outcome is `failed` with reason `invalid_message` and no provider
  request is made

#### Scenario: Provider times out
- **WHEN** the provider does not answer within the configured timeout
- **THEN** the outcome is `failed` with reason `unavailable` and no provider
  error text reaches the caller

#### Scenario: Delivery is not configured
- **WHEN** the provider is `none` and a message is sent
- **THEN** the outcome is `failed` with reason `not_configured` and nothing is
  written to any external system

### Requirement: Operators select one email provider per runtime
The provider SHALL be selected by `LACE_EMAIL_PROVIDER` with values `none`,
`log`, `smtp`, `resend`, or `cloudflare`; an absent or empty value SHALL mean
`none`. Node SHALL support `none`, `log`, `smtp`, and `resend`. The Cloudflare
Worker SHALL support `none`, `log`, `resend`, and `cloudflare`. Selecting a
provider the runtime does not support SHALL fail startup. Every provider other
than `none` SHALL require `LACE_EMAIL_FROM`, a single sender address with an
optional display name. The closed outcomes, message validation and sender
identity SHALL behave identically on both runtimes for every provider they
share.

#### Scenario: Default installation has no provider
- **WHEN** a runtime starts without `LACE_EMAIL_PROVIDER`
- **THEN** it starts normally with email delivery reported as `none`

#### Scenario: SMTP is selected on the Worker
- **WHEN** the Worker starts with `LACE_EMAIL_PROVIDER=smtp`
- **THEN** startup fails, naming `LACE_EMAIL_PROVIDER` as invalid

#### Scenario: Sender is missing
- **WHEN** a runtime starts with `LACE_EMAIL_PROVIDER=resend` and no
  `LACE_EMAIL_FROM`
- **THEN** startup fails, naming `LACE_EMAIL_FROM` as missing

### Requirement: The log provider is restricted to development
The `log` provider SHALL write each accepted message, including its recipient,
subject and bodies, as one structured record to standard output, and SHALL
report `sent`. A runtime composed for production SHALL refuse to start with
`LACE_EMAIL_PROVIDER=log`, because logged messages can contain account links.

#### Scenario: Developer reads a message from the log
- **WHEN** a development runtime with the `log` provider sends a message
- **THEN** the message recipient, subject and text appear in the runtime output

#### Scenario: Log provider in production
- **WHEN** a production Node runtime or a Worker with `LACE_ENVIRONMENT` other
  than `development` starts with `LACE_EMAIL_PROVIDER=log`
- **THEN** startup fails, naming `LACE_EMAIL_PROVIDER` as invalid

### Requirement: SMTP delivery on Node enforces transport security
The `smtp` provider SHALL require `LACE_SMTP_HOST` and SHALL accept
`LACE_SMTP_PORT` (default `587`), `LACE_SMTP_SECURITY` with values `starttls`
(default), `tls`, or `none`, and optional `LACE_SMTP_USER` and
`LACE_SMTP_PASSWORD`, which SHALL be supplied together or not at all. With
`starttls` the connection SHALL fail rather than continue unencrypted when the
server does not offer STARTTLS. `none` SHALL be accepted only in development.
Server rejection of the sender or recipient SHALL map to `rejected`, and
connection, authentication and timeout failures SHALL map to `unavailable`.

#### Scenario: Unencrypted SMTP in production
- **WHEN** a production Node runtime starts with `LACE_SMTP_SECURITY=none`
- **THEN** startup fails, naming `LACE_SMTP_SECURITY` as invalid

#### Scenario: Credentials are incomplete
- **WHEN** `LACE_SMTP_USER` is set without `LACE_SMTP_PASSWORD`
- **THEN** startup fails, naming `LACE_SMTP_PASSWORD` as missing

#### Scenario: Server lacks STARTTLS
- **WHEN** the configured server does not offer STARTTLS and security is
  `starttls`
- **THEN** the outcome is `failed` with reason `unavailable` and no message
  content is transmitted

### Requirement: Resend delivery works on both runtimes over HTTPS
The `resend` provider SHALL require the secret `LACE_RESEND_API_KEY` and SHALL
send each message with one authenticated HTTPS request to the provider's email
endpoint, bounded by `LACE_EMAIL_TIMEOUT_MS` (default 10000 milliseconds).
It SHALL accept an optional `LACE_RESEND_API_BASE_URL` endpoint-origin override
for tests, which SHALL be HTTPS outside development. A provider response for validation or domain
problems SHALL map to `rejected`, rate or quota responses SHALL map to
`rate_limited`, and network failures, timeouts and server errors SHALL map to
`unavailable`.

#### Scenario: Resend quota is exhausted
- **WHEN** the provider answers that the daily sending quota is exceeded
- **THEN** the outcome is `failed` with reason `rate_limited`

#### Scenario: Resend key is missing
- **WHEN** a runtime starts with `LACE_EMAIL_PROVIDER=resend` and no
  `LACE_RESEND_API_KEY`
- **THEN** startup fails, naming `LACE_RESEND_API_KEY` as missing

### Requirement: Cloudflare delivery uses the Email Service binding
The `cloudflare` provider SHALL require a `send_email` binding named `EMAIL`
that exposes `send`, and SHALL send structured messages through it. A missing
or malformed binding SHALL fail Worker startup, naming `EMAIL`. Binding error
codes for unverified senders, unavailable sending domains, disallowed or
suppressed recipients SHALL map to `rejected`; rate and daily-limit codes SHALL
map to `rate_limited`; validation codes SHALL map to `invalid_message`; and
delivery or internal codes SHALL map to `unavailable`.

#### Scenario: Sender domain is not onboarded
- **WHEN** the binding reports that the sender is not verified
- **THEN** the outcome is `failed` with reason `rejected`

#### Scenario: Binding is absent
- **WHEN** the Worker starts with `LACE_EMAIL_PROVIDER=cloudflare` and no
  `EMAIL` binding
- **THEN** startup fails, naming `EMAIL` as missing

### Requirement: Email configuration and failures never disclose secrets
Startup validation SHALL name invalid or missing email variables and bindings
without repeating any supplied value. SMTP passwords and Resend API keys SHALL
never appear in logs, error responses, status responses, or diagnostics.
Delivery failures in non-`log` providers SHALL be logged only as a structured
record with the provider kind and closed reason, without recipient address,
subject, body, or provider error text.

#### Scenario: Invalid SMTP port value is reported
- **WHEN** startup rejects `LACE_SMTP_PORT=secret-looking-value`
- **THEN** the error names `LACE_SMTP_PORT` and does not contain the supplied
  value

#### Scenario: Delivery failure is logged
- **WHEN** a Resend request is rejected
- **THEN** the runtime log records provider `resend` and reason `rejected` and
  contains neither the recipient nor the API key
