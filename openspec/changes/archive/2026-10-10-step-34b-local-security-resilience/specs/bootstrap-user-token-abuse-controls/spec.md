## ADDED Requirements

### Requirement: Cookie-authenticated management mutations enforce trusted origins
Before resolving a session actor for an unsafe HTTP method, the shared auth boundary SHALL deny an explicit untrusted, opaque or malformed Origin and origin-less browser requests marked cross-site by Fetch Metadata. Provider and Lace mutations SHALL use the same configured trusted-origin policy: canonical origin in production, with the existing development-only localhost/127.0.0.1 alias at the same scheme and port. Ordinary origin-less non-browser requests and safe reads SHALL preserve their existing contracts. Denial SHALL use sanitized existing authorization errors and SHALL NOT create or change users, content, tokens or media. Existing role, session, cookie, setup and provider CSRF rules SHALL remain in force.

#### Scenario: A foreign origin submits a valid administrator cookie
- **WHEN** a foreign-origin request attempts a Lace management mutation with a valid administrator cookie
- **THEN** it is denied before protected work, and persisted protected state remains unchanged on Node and Worker

#### Scenario: An operator submits a non-browser request without Origin
- **WHEN** a valid authenticated operator request has no Origin or cross-site Fetch Metadata
- **THEN** its original role and session authorization rules apply


### Requirement: Rate-limit subjects come from a trusted runtime boundary
Node SHALL derive client identity from the transport peer by default, ignoring caller-supplied forwarding headers. A configured trusted proxy policy SHALL accept forwarded identity only from an allowed immediate peer and resolve a validated chain from the trusted end; malformed or untrusted chains SHALL NOT select an arbitrary caller identity. Cloudflare SHALL use its platform-supplied client identity at its trusted ingress, not arbitrary forwarding headers. Lace authentication/setup protection and the authentication provider's sign-in protection SHALL use the same resolved identity. Missing trustworthy identity SHALL fail conservatively without accepting spoofed headers. Configuration failures SHALL identify setting names without values. Raw identities SHALL NOT enter logs or Lace's persisted buckets.

Authenticated upload and token-management limits SHALL use the validated actor identity, and caller headers SHALL NOT bypass those limits. Existing default limits, HMAC persistence, denied-request behavior and authorization requirements SHALL remain in force.

#### Scenario: A direct caller changes forwarding headers
- **WHEN** one direct Node client exhausts authentication attempts and changes X-Forwarded-For or a provider IP header
- **THEN** the same subject remains limited with 429 and Retry-After

#### Scenario: Two clients use a trusted proxy
- **WHEN** a configured proxy supplies valid distinct client chains for two clients
- **THEN** both authentication limiters distinguish the clients and forged values prepended by either client do not bypass their own limit

#### Scenario: Actors share a proxy
- **WHEN** two authenticated actors upload or manage tokens through the same proxy
- **THEN** their permitted operations count against separate actor limits and changing request IP headers does not reset either limit

#### Scenario: Client identity is unavailable
- **WHEN** no trustworthy transport or platform identity is available
- **THEN** protection uses a documented conservative fallback without trusting a caller's replacement header
