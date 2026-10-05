## 1. Shared contract

- [x] 1.1 Support safe strong/weak version tags while retaining strong-only mutation If-Match; verify contracts regression tests.

## 2. SDK and loaders

- [x] 2.1 Preserve validators, check response versions, and add bounded redacted header diagnostics; verify SDK 200/304 and loader state/retry tests.

## 3. Runtime and compression acceptance

- [x] 3.1 Ensure origin ETags match loaded exports and verify auth, malformed tags, short-circuit, race and post-publication 200 behavior in server, Node/SQLite and Worker/D1 tests.
- [x] 3.2 Verify standard static/dev published-site and Astro loaders with global fetch through a gzip HTTP proxy, including 304 and later publication.

## 4. Delivery checks

- [x] 4.1 Record 33B acceptance and roadmap completion; run focused tests, root typecheck, Oxlint, Oxfmt, OpenAPI check and strict change validation. Real Pages evidence remains assigned to 33H/34C.
