# MVP traceability

This checklist maps every architecture §3 Included item and §14 security requirement. “Local covered” means named automated evidence exists; final candidate identities/results live in [34C](archive/step-34/step-34c-verification.md), [34B](archive/step-34/step-34b-verification.md) and [34A](archive/step-34/step-34a-verification.md). It is not a remote pass. Every row also requires the corresponding [owner-plan evidence](real-application-verification.md#post-roadmap-owner-evidence); all owner statuses below remain pending. Historical 34A/34B results retain their original artifact identities and are reused only for unaffected behavior.

## Included product scope

| Architecture §3 item | Named local evidence | Documentation | Local status / owner check |
| --- | --- | --- | --- |
| One installation per website | `tests/cross-runtime-product.acceptance.mjs`; `scripts/build-site-acceptance.mjs` selected-site isolation | Architecture §4.1; generated operations | Covered / pending isolated real deployment |
| Pages and collections | `scripts/cross-runtime-api.mjs` home/article creation and route/export comparisons | Architecture §8; configuration-synchronization.md | Covered / pending real editorial journey |
| Code-first definitions | `packages/config/src/index.test.mjs`; CLI sync tests; `cross-runtime-api.mjs` | configuration-synchronization.md | Covered / pending deployed config sync |
| Draft and published snapshots | `cross-runtime-api.mjs`; `publication-visibility-acceptance.mjs` | Architecture §4.4; generated publication guidance | Covered / pending draft isolation on real site |
| Ordered block content | `scripts/block-order-acceptance.mjs`; cross-runtime API/Astro ordered-block comparison | Architecture §9.5; personal-site-guide.md | Covered / pending browser reorder/publication |
| Tiptap rich text | Admin editor tests; `packages/content/src/index.test.mjs`; render tests | Architecture §11; site-styling.md | Covered / pending actual content/render review |
| R2 or MinIO media | `tests/operations.acceptance.mjs` object API backup, hashes, negatives and download; platform storage tests | local-operations-verification.md | Covered locally / pending real object consistency/restore |
| Better Auth email/password | `packages/auth/src/index.test.mjs`; both generated browser onboarding journeys; operations fresh sign-in | auth-operations.md | Covered / pending production cookies/origin/sign-in |
| Admin/editor/viewer roles | `cross-runtime-api.mjs` role denials; `packages/server/src/app.test.mjs` status boundary | Architecture §14; auth-operations.md | Covered / pending real-account role matrix |
| Versioned validated REST API | Contracts/server tests; `pnpm openapi:check`; exact-consumer API probes | Architecture §12; node-api.md | Covered / pending actual ingress error/authorization behavior |
| Astro build-time SDK | `scripts/cross-runtime-astro.mjs`; exact starter/independent-site journeys; weak ETag journey | personal-site-guide.md; generated Astro guide | Covered / pending provider build and served output |
| Outbox build dispatch | Builder runner tests; `scripts/generated-project-acceptance.mjs` failure/recovery; Worker controlled hook/Pages journey | Architecture §9.8; generated operations | Covered with controlled provider / pending real retries and deployment proof |
| Node/Docker and Cloudflare adapters | Exact Node consumer and local Worker journeys; operation restore/rotation on both | node-api.md; cloudflare-worker.md | Covered locally / pending real VPS/Cloudflare acceptance |
| CLI init and upgrade-safe layout | Six byte-stable generator snapshots; `template-upgrade-acceptance.mjs`; CLI upgrade-command/rollback tests; block conflict journey | Architecture §7; generated operations | Covered / pending independent install/upgrade from published artifacts |

## Security requirements

| Architecture §14 requirement | Named local evidence | Documentation | Local status / owner check |
| --- | --- | --- | --- |
| Secure HTTP-only production cookies | `packages/auth/src/index.test.mjs`; Node production smoke | auth-operations.md; generated production guide | Covered locally / pending actual HTTPS proxy cookies |
| CSRF and origin protection | `tests/security-boundary.test.mjs`; `scripts/consumer-34b-security.mjs` foreign/null/cross-site denials | local-security-verification.md | Covered / pending real ingress origin rejection |
| Explicit trusted origins | Auth/server security tests; generated origin settings | auth-operations.md | Covered / pending real-domain allowlist |
| Auth/upload rate limiting | Node/Worker security-contract tests; security acceptance actor/proxy identity probes | local-security-verification.md; 34B host-safety record | Covered / pending real trusted proxy and concurrency behavior |
| Upload MIME/size/filename validation | Platform security-contract tests; exact-consumer polyglot rejection | local-security-verification.md | Covered / pending provider limits and representative uploads |
| No secrets in client bundles | `scripts/consumer-security.mjs` static/image scans; `cross-runtime-astro.mjs` sentinel scan; complete release acceptance | local-security-verification.md | Covered / pending published asset inspection |
| Same-origin admin/API default | Node/Worker browser journeys; generated proxy/Worker assets | node-api.md; cloudflare-worker.md | Covered / pending real routing and TLS |
| Actor IDs on content mutations | `tests/operations.acceptance.mjs` correlated request log assertions; server application actor permissions | local-operations-verification.md | Actor context covered; complete durable audit trail and §21 entry/model/publication context remain a documented gap / pending real logs |
| Worker Better Auth AsyncLocalStorage compatibility | Worker bundle/smoke tests and generated `cf:build`/local onboarding | cloudflare-worker.md | Covered locally / pending deployed Worker smoke |

## Residual gates

34B's bounded D1 query/payload observations are finite simulator measurements, not a production capacity claim. Its dependency/advisory dispositions remain visible in [34B dependency evidence](archive/step-34/step-34b-dependency-audit.md); the 34C documentation/template change does not erase them. Coordinated local restore proves neither remote D1 SQL export nor R2 cross-store consistency. The owner must retain target identity, release/source checksum, command timestamps, redacted outcomes, restored object checksums, served static output and failure/recovery observations for each real check. Publication and stable-release approval are separate explicit acts. No local row authorizes either.
