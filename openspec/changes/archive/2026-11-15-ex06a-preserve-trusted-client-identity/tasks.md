## 1. Trust boundary

- [x] 1.1 Update architecture §14 and auth operations guidance with the
  request-lifetime identity rule. Check the text against the accepted Node
  proxy and Cloudflare ingress rules and the documented fallback.
- [x] 1.2 In the shared Hono app, capture the runtime-resolved address in typed
  request context before body handling. In the app tests, confirm the
  downstream context keeps the address after a streamed request is replaced
  and a direct call uses the fallback.

## 2. Rate-limit consumers

- [x] 2.1 Pass the captured value through the shared request limiter on both
  compositions. Verify existing actor-scoped and OAuth token subject rules,
  and check that buffered and ordinary requests increment the same client
  bucket.
- [x] 2.2 Pass the captured value to the provider route handler and overwrite
  the private Better Auth IP header in the adapter. Verify the trusted
  value, fallback, input body and allowlisted routes in focused auth and
  server tests.

## 3. Runtime verification

- [x] 3.1 Add Node and Worker cases to the security regression coverage.
  Verify that streamed sign-in enters the request-replacement path, that
  two interleaved clients keep separate Lace and production Better Auth
  budgets, and that the observed result distinguishes the two limiters.
  Include the Node listener's chunked path and the actual Worker fetch entry.
- [x] 3.2 Exercise spoofed provider and forwarding headers, valid and
  malformed Node proxy chains, valid and missing Worker identity, direct app
  calls, shared fallback and actor isolation. Verify an oversized stream
  receives the existing 413 before sign-in or setup work. Check sanitized logs
  and the existing hashed Lace bucket representation in the security suite.
- [x] 3.3 Run focused auth/server/runtime and security-boundary tests, then
  `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and
  `pnpm exec openspec validate ex06a-preserve-trusted-client-identity --type change --strict`.
