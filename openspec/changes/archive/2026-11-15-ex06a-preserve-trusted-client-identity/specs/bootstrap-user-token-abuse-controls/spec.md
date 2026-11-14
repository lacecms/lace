## MODIFIED Requirements

### Requirement: Rate-limit subjects come from a trusted runtime boundary
Node SHALL derive client identity from the transport peer by default, ignoring caller-supplied forwarding headers. A configured trusted proxy policy SHALL accept forwarded identity only from an allowed immediate peer and resolve a validated chain from the trusted end. A malformed or untrusted chain SHALL fall back to the transport peer when available. Cloudflare SHALL use the validated platform-supplied address from its trusted ingress. A request that bypasses that ingress SHALL have no trusted Cloudflare identity.

Both runtimes SHALL retain the resolved identity for the lifetime of the request. The identity SHALL survive body validation and buffering, including when the downstream request object is replaced. Lace client-scoped rate limits and Better Auth sign-in protection SHALL use the same retained identity. Concurrent requests SHALL retain independent identities. When trustworthy identity is unavailable, both protections SHALL use the shared conservative `0.0.0.0` fallback. Caller-provided address headers, including the internal provider IP header, SHALL NOT supply a replacement.

Configuration failures SHALL identify setting names without values. Raw identities SHALL NOT enter logs or Lace's persisted buckets. Authenticated upload and token-management limits SHALL use the validated actor identity, and caller headers SHALL NOT bypass those limits. Existing default limits, HMAC persistence, denied-request behavior and authorization requirements SHALL remain in force.

#### Scenario: A direct caller changes forwarding headers
- **WHEN** one direct Node client exhausts authentication attempts and changes X-Forwarded-For or a provider IP header
- **THEN** the same subject remains limited with 429 and Retry-After

#### Scenario: Two clients use a trusted proxy
- **WHEN** a configured proxy supplies valid distinct client chains for two clients
- **THEN** both authentication limiters distinguish the clients and forged values prepended by either client do not bypass their own limit

#### Scenario: Invalid proxy metadata is discarded
- **WHEN** Node receives a malformed forwarded chain from a configured proxy
- **THEN** both protections use the trusted immediate transport peer

#### Scenario: Two trusted clients send buffered requests
- **WHEN** two distinct trusted clients on either runtime interleave streamed sign-in requests whose bodies are buffered and whose request objects are replaced
- **THEN** each request retains its ingress identity for both protections, exhausting one client's budget leaves the other client's budget available, and downstream sign-in receives the original submitted body

#### Scenario: A trusted client alternates body framing
- **WHEN** a trusted client on either runtime alternates ordinary and buffered streamed requests to a client-scoped operation
- **THEN** the same client budget counts both forms and the existing response and retry contract applies when the budget is exhausted

#### Scenario: Caller headers reach the Worker
- **WHEN** the trusted Worker ingress supplies a valid address and a caller supplies separate forwarding or provider IP headers
- **THEN** buffering the body leaves both protections using the validated platform address

#### Scenario: Actors share a proxy
- **WHEN** two authenticated actors upload or manage tokens through the same proxy
- **THEN** their permitted operations count against separate actor limits and changing request IP headers does not reset either limit

#### Scenario: Client identity is unavailable
- **WHEN** Node lacks a trustworthy transport identity or the Worker has no valid platform identity, including when the application is invoked directly
- **THEN** both protections use the same conservative fallback across ordinary and streamed requests, regardless of caller-supplied address headers

#### Scenario: A stream exceeds the configured body limit
- **WHEN** a streamed sign-in or setup body exceeds the configured JSON limit
- **THEN** the existing 413 response is returned before the sign-in provider or setup mutation runs
