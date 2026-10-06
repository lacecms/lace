## ADDED Requirements

### Requirement: Cloudflare credential example and upgrade preserve ownership
Cloudflare generation SHALL deliver managed `docs/cloudflare-operator.env.example` with credential-free placeholders for account ID, D1 ID, token and Worker configuration. The private runtime copy SHALL be ignored and user-owned, absent from managed upgrade inventory and never generated with a usable token. Generated `.env.example` SHALL no longer invite storing the remote token in root dotenv; local Cloudflare configuration SHALL remain available. Generation without Cloudflare SHALL deliver no operator example and no remote credential placeholders encouraging implicit Wrangler loading. Existing generated cf scripts SHALL remain local-only.

The ownership template SHALL advance to `0.15.0`, with coherent inventory, upgrade instructions, release template metadata and deterministic snapshots. Upgrades SHALL change only managed files through existing conflict review, and SHALL never move, remove or copy real credentials or modify README, `.env`, `.env.local`, the runtime operator file, lace.config.ts, Worker configuration or site source. Instructions SHALL explain creating the protected private file and moving/removing legacy assignments manually, requiring current CLI support before using the new option. Modified managed references and colliding managed-example destinations SHALL remain conflicts.

#### Scenario: Fresh Cloudflare project
- **WHEN** generation runs with Cloudflare in any site mode
- **THEN** the example is credential-free, classified and hashed, the runtime copy is ignored, and local cf scripts still select only simulated resources

#### Scenario: Non-Cloudflare generation
- **WHEN** generation runs without Cloudflare
- **THEN** no private operator example is delivered and local generation remains account-free

#### Scenario: Upgrade legacy project
- **WHEN** a 0.14.0 project containing legacy token assignments upgrades
- **THEN** managed instructions/example/ignore rules are updated, all private/user bytes are preserved and instructions require manual credential relocation
