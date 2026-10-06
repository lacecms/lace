## ADDED Requirements

### Requirement: Cloudflare onboarding makes credential choices explicit
Generated Cloudflare guidance and repository handoff SHALL document a single sufficiently scoped token or a D1-scoped Lace token plus Wrangler OAuth. The split choice SHALL store remote credentials in `.lace/cloudflare-operator.env` loaded explicitly through the CLI option, never in `.env` or `.env.local`; the guide SHALL give protected-file creation and ignore instructions without usable credentials. A single token SHALL be supplied explicitly for the intended Wrangler invocation rather than recommended for implicit root dotenv storage. Permission tables SHALL distinguish D1 operations, Workers deploy/secrets, resource provisioning, Pages and optional KV/routes. LACE_AUTH_SECRET SHALL be described as the CMS authentication secret (local Worker variables versus uploaded Worker secret), not a Cloudflare management credential; operator, OAuth, build/setup and Pages tracking credentials SHALL have distinct purposes.

Before remote commands the guide SHALL run preflight with the explicit target/account/database and chosen Wrangler authentication mode. Before deployment/secrets it SHALL require separate project-pinned `wrangler whoami` and permission review; preflight SHALL not be presented as proof of write access. The split-choice recovery SHALL remove API-token assignments from both implicit root dotenv files and clear inherited token variables, then recheck, so the next command cannot reload the token. Upgrade guidance for alpha.2 SHALL retain private/user files and explain manual migration, one-time login and repeat preflight, without automatic remote action.

#### Scenario: Login followed by D1-only token
- **WHEN** an operator follows OAuth login, private D1 token configuration and remote migration/sync
- **THEN** subsequent Wrangler deploy/secret instructions use OAuth after checking shell and both implicit dotenv locations, without leaking the D1 token into their environment

#### Scenario: Legacy token survives in dotenv-local
- **WHEN** an alpha.2 project removes the shell token but still stores it in `.env.local`
- **THEN** the guide and preflight identify the remaining source and require removal before claiming the split credential choice is ready

#### Scenario: Single-token operation
- **WHEN** the operator chooses one token for both tools
- **THEN** the guide identifies every required operation scope and explicit loading, distinguishing read-only preflight evidence from write permission review
