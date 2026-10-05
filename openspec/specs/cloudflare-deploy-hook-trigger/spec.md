# cloudflare-deploy-hook-trigger Specification

## Purpose
Defines the Cloudflare site-build trigger that asks an external deploy hook,
held only in a Worker secret, to rebuild the static site, including timeouts,
provider deployment-ID capture, and sanitized failure mapping.

## Requirements

### Requirement: Deploy hook is called without request-controlled data
The Cloudflare site-build trigger SHALL send one HTTPS `POST` to the configured
deploy-hook URL for each dispatched build. The request SHALL carry no body,
cookie, credential, command, path, or environment value derived from an HTTP
request, and SHALL not follow redirects. The deploy-hook URL SHALL be supplied
only as a Worker secret and SHALL never appear in logs, error envelopes, or
build records.

#### Scenario: A build is dispatched
- **WHEN** a claimed site-build event is dispatched with a deploy hook configured
- **THEN** exactly one bodiless `POST` reaches the configured URL with redirects
  disabled

#### Scenario: The hook redirects
- **WHEN** the deploy hook answers with a redirect
- **THEN** the redirect is not followed and the build attempt fails as a
  provider failure

### Requirement: Deploy-hook calls are bounded
Each deploy-hook call SHALL be aborted after the configured timeout, which
SHALL default to 10000 ms and SHALL be configurable from 1 to 60000 ms. At most
16 KiB of the response body SHALL be read; a larger body SHALL be treated as
containing no provider deployment ID.

#### Scenario: The hook does not answer
- **WHEN** the deploy hook does not respond before the timeout
- **THEN** the call is aborted and the attempt is recorded as a retryable
  `trigger_unavailable` failure

### Requirement: Deploy-hook responses map onto the build lifecycle
A 2xx response SHALL be treated as acceptance by the provider, never as proof of publication. When its JSON body is a Cloudflare API envelope with `success` not equal to `false` and a `result.id` of 1–200 characters from letters, digits, `.`, `_`, `:`, and `-`, the acceptance SHALL carry that provider deployment ID. Without deployment tracking, every accepted hook call SHALL be recorded as terminal `accepted`, with the provider ID when one was returned. A 2xx response without such an ID SHALL also be `accepted` and SHALL NOT be recorded as `succeeded`. A 2xx envelope with `success: false`, and any non-2xx response other than `408`, `425`, `429`, or `5xx`, SHALL be a `provider_failed` failure. Those four throttling or server statuses, network errors, and timeouts SHALL be `trigger_unavailable` failures. Failures SHALL use the existing retry policy and SHALL never record provider response text.

#### Scenario: Cloudflare returns a deployment ID
- **WHEN** the hook returns `200` with `{"success":true,"result":{"id":"dep-1"}}` and no tracking is configured
- **THEN** the build becomes `accepted` with provider ID `dep-1` and its event is not claimed again

#### Scenario: Hook accepts without an ID
- **WHEN** the hook returns a 2xx response whose body has no valid deployment ID
- **THEN** the build becomes `accepted` without a provider ID and never `succeeded`

#### Scenario: Hook is throttled or down
- **WHEN** the hook returns `429` or `503`, or the network call fails
- **THEN** the event is rescheduled with sanitized reason `trigger_unavailable`
  and publication stays committed

#### Scenario: Hook is revoked
- **WHEN** the hook returns `404` or an envelope with `success: false`
- **THEN** the attempt is recorded with sanitized reason `provider_failed`
