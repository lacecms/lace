## ADDED Requirements

### Requirement: Direct account creation has a closed credential-safe contract
The shared REST contracts SHALL define a strict creation request containing
only `email` and `role`. The address SHALL satisfy the existing account email
validation after trimming, and the role SHALL be one of `admin`, `editor` or
`viewer`. The strict success response SHALL contain `user` in the managed user
shape with `disabled: false`, the closed `delivery` outcome and `link` exactly
when `delivery.status` is `failed`. The link SHALL be a token-bearing reset
URL with the token in its fragment. Neither payload SHALL contain a password,
provider credential state or a separate token field. The API specification
SHALL describe the session-only route, request, response and error outcomes.

#### Scenario: Legacy password-bearing input
- **WHEN** a create request includes the old `password` field or any unexpected field
- **THEN** shared validation rejects it and no account is created

#### Scenario: Delivery and link disagree
- **WHEN** a creation response includes a link with a `sent` outcome, or omits the link with a `failed` outcome
- **THEN** shared validation rejects the response
