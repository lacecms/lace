## MODIFIED Requirements

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
