## ADDED Requirements

### Requirement: Next-alpha template upgrade protects ownership
The generator SHALL advance the managed template version to `0.14.0` and generate exact `0.1.0-alpha.2` Lace package dependencies, `ghcr.io/lacecms/api:0.1.0-alpha.2` and `ghcr.io/lacecms/builder:0.1.0-alpha.2` image defaults and `0.1.0-alpha.2` installation commands in its guides. Generated guides SHALL state which onboarding behavior requires these or later artifacts and SHALL NOT claim that the published `0.1.0-alpha.1` artifacts contain it. The template upgrade instructions SHALL state that the upgrade replaces only managed files, that the operator updates the user-owned `.env` image references and, where present, the user-owned site's Lace dependency versions manually, and that no file under `site/`, `lace.config.ts`, README or `worker/wrangler.jsonc` is changed. The managed operations guide and the generated README SHALL instruct operators of the Compose deployment to stop the `api` and `dispatcher` services before running a host command that opens the SQLite database and to start them again afterwards, explaining that concurrent host and container access through a VM-backed bind mount leaves the services with diverging views. Upgrades SHALL retain deterministic managed hashes and existing conflict detection.

#### Scenario: Fresh generation
- **WHEN** a project is generated with template `0.14.0` in any site mode, with or without `--cloudflare`
- **THEN** every generated Lace dependency, image default and guide installation command names `0.1.0-alpha.2` and the ownership manifest records template `0.14.0`

#### Scenario: Host database command with the stack running
- **WHEN** an operator follows the generated guide to sync configuration or re-issue a setup token after starting the Compose API
- **THEN** the guide directs them to stop `api` and `dispatcher`, run the host command, and start the services again

#### Scenario: Upgrade from 0.13.0
- **WHEN** a consumer with unmodified 0.13.0 managed files applies the 0.14.0 upgrade from a template of the same site mode and Cloudflare selection
- **THEN** managed files equal the new template and every user-owned file, including `.env`, README, `lace.config.ts`, `worker/wrangler.jsonc` and all of `site/`, is unchanged, with the manual version steps listed in the instructions

#### Scenario: Modified managed file
- **WHEN** a managed file of the 0.13.0 project was edited by the operator
- **THEN** the upgrade plan reports the conflict and apply changes nothing
