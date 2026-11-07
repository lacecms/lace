# browser-first-admin-setup Specification

## Purpose

Defines browser first-administrator setup using the existing operator-issued one-time token without exposing protected installation data or opening public enrollment.

## Requirements

### Requirement: Anonymous setup state is minimal and durable
Both Node and Worker SHALL serve `GET /api/v1/setup/state` without a session or token, returning a runtime-validated `200` JSON object containing only the boolean `setupComplete`. The value SHALL reflect persisted installation completion, including across restarts. An absent singleton in an otherwise migrated database SHALL mean incomplete setup. The read SHALL neither mutate state nor issue tokens, consume setup-attempt allowance, expose users, identifiers, timestamps, token metadata, credentials, or content configuration, nor authorize any protected operation. Responses SHALL carry `Cache-Control: no-store`. A failed persistence read SHALL return a sanitized failure rather than an invented incomplete state.

#### Scenario: Fresh migrated installation is inspected
- **WHEN** an anonymous client reads setup state before any token is minted or admin is created
- **THEN** it receives exactly `{ "setupComplete": false }` and no database row or credential is created

#### Scenario: Setup survives a restart
- **WHEN** setup completes and the runtime starts again using the same database
- **THEN** an anonymous state read returns exactly `{ "setupComplete": true }` with no administrator details

#### Scenario: Persistence is unavailable
- **WHEN** setup-state persistence cannot be read
- **THEN** the read fails with a sanitized error and does not claim that setup is available

#### Scenario: State is not a setup credential
- **WHEN** a caller reads incomplete state and then submits setup without a valid operator-issued token or requests protected content
- **THEN** the existing authorization and credential checks reject the operation without creating a user or revealing protected content

### Requirement: Setup screen accepts only an operator-issued credential
An anonymous visitor to `/admin/setup` on an incomplete installation SHALL see a focused setup card outside the authenticated shell with labelled email, new-password, and bootstrap-token fields. The screen SHALL explain how an operator obtains the existing one-time token through the supported bootstrap command, the one-hour expiry, and the 12-character password minimum. It SHALL validate the existing shared setup request limits, offer an accessible password visibility toggle, and submit only to `POST /api/v1/setup/admin` using the same origin. Pending submission SHALL be announced and SHALL prevent duplicate submission. Plaintext tokens and passwords SHALL remain only in transient form/request memory and SHALL NOT be written to browser storage, URL/search state, query-cache mutation variables, logs, analytics, or error text; they SHALL be cleared on successful completion or when the form closes.

#### Scenario: First administrator submits a valid form
- **WHEN** a visitor submits a valid email, password, and unexpired operator-issued token
- **THEN** the browser sends the existing setup request once, the server completes the guarded bootstrap protocol, and the browser clears secrets and opens normal sign-in with a completion notice

#### Scenario: Password does not satisfy the shared contract
- **WHEN** a visitor supplies a password shorter than 12 characters
- **THEN** the form identifies the password problem accessibly and does not attempt account creation

#### Scenario: Sensitive input is inspected outside the form
- **WHEN** a visitor enters a token and password and receives either a validation or server failure
- **THEN** neither value appears in the URL, browser storage, cached mutation variables, diagnostics, or error rendering

### Requirement: Recovery preserves the guarded bootstrap protocol
Browser setup SHALL preserve the server's expiry, claim/resume for the same email, foreign-email rejection, password validation, rate limits, and consumption of all outstanding tokens at completion. It SHALL NOT automatically replay a setup mutation. After a setup `404` or an interrupted response, it SHALL re-read durable setup state before deciding whether setup has completed. Confirmed completion SHALL close the form and offer ordinary sign-in without claiming the submitted credentials created the administrator. Confirmed incomplete setup SHALL retain the email and allow an explicit retry using the same token/email after interruption, or correction/replacement of an invalid or expired token. A failed reconciliation read SHALL present a retryable state error without resubmitting the mutation or assuming completion. Rate-limit errors SHALL show safe retry guidance and SHALL never bypass the server limit. Setup success or a completion read SHALL NOT establish or imply a browser session.

#### Scenario: Unknown or expired token yields an ambiguous 404
- **WHEN** setup submission returns `404` and the fresh state read still reports incomplete setup
- **THEN** the form stays available, retains the email, and gives safe token-check/reissue guidance without reporting completion or creating a session

#### Scenario: A response is lost after durable completion
- **WHEN** the setup response is interrupted and a fresh state read confirms completion
- **THEN** the form clears secrets and offers sign-in without submitting another setup request

#### Scenario: Bootstrap is interrupted after a claim
- **WHEN** the server has claimed a token but not recorded completion and the user explicitly retries with the same token and email
- **THEN** the existing protocol resumes safely without a second administrator or password replacement

#### Scenario: A different email attempts claim takeover
- **WHEN** a claimed token is retried with another email
- **THEN** setup is rejected, the UI shows a sanitized failure, and the existing claimed user is not modified

#### Scenario: Another visitor completes setup first
- **WHEN** a stale setup form submits after another client completed setup and receives the existing `404`
- **THEN** a fresh completion read closes that form and shows sign-in, while no additional user is created by that stale request

#### Scenario: Reconciliation is unavailable
- **WHEN** submission returns `404` or loses its response and the subsequent state read fails
- **THEN** the UI offers a read retry and performs no automatic setup mutation

#### Scenario: Setup request allowance is exhausted
- **WHEN** the server rejects a setup attempt with `429` and `Retry-After`
- **THEN** the UI describes the request limit without disclosing credentials and leaves retry under explicit user control

### Requirement: Setup is accessible and responsive
The setup screen and its loading, validation, error, and completion states SHALL use the existing admin design tokens and accessible controls. Setup SHALL work using keyboard input alone with visible focus, labelled fields, accessible password visibility state, and announced pending/error states. At 375px width it SHALL require no horizontal page scroll and SHALL respect reduced-motion preferences. Browser accessibility checks SHALL audit the setup route and its actionable error states using the existing WCAG A/AA rules without globally disabling rules. Node and Worker SHALL expose the same observable setup contracts used by the browser.

#### Scenario: Keyboard-only first-admin setup
- **WHEN** a visitor uses only the keyboard to enter the setup fields, toggle password visibility, submit, and reach sign-in
- **THEN** the entire flow completes with visible focus and announced pending and completion states

#### Scenario: Setup is inspected at a narrow viewport
- **WHEN** the setup page and its error state are audited at 375px width with reduced motion
- **THEN** all controls remain usable without horizontal scrolling and no WCAG A/AA violation is reported

### Requirement: Setup outcomes share one ambiguous response
Every setup submission outcome that depends on installation state SHALL
answer with the same `404 NOT_FOUND` envelope, so an unauthenticated client
cannot distinguish them. These outcomes are:

- an unknown, expired, consumed or foreign-email setup token;
- setup that is already complete;
- setup that is unavailable.

The persistence adapters SHALL raise these outcomes as typed account failures
with the not-found code, on Node and Cloudflare, and the server SHALL map them
through the shared classifier.

An unexpected failure during setup, such as an unavailable database, SHALL
NOT be presented as one of these outcomes. It SHALL return `500
INTERNAL_ERROR` with the generic message. An inconsistent stored setup state
SHALL be an internal invariant failure.

#### Scenario: A completed installation stays ambiguous
- **WHEN** a client submits setup after another client completed it
- **THEN** the API returns the same `404` envelope as for an unknown token,
  and no user is created

#### Scenario: A database outage is not reported as a bad token
- **WHEN** the database is unavailable while a setup submission runs
- **THEN** the API returns `500 INTERNAL_ERROR`, and the admin shows its
  existing sanitized server-failure state instead of token guidance
