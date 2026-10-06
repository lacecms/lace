## MODIFIED Requirements

### Requirement: Root README is user-owned and existing introductions are preserved

Fresh generated projects SHALL contain a root `README.md` classified as user-owned without a digest in the ownership manifest. When an allowed target already contains a regular `README.md`, generation SHALL preserve its exact bytes and classify that path as user-owned, without replacing or appending text. Successful CLI output SHALL direct fresh consumers to README and name the generated scenario guides and `docs/lace-operations.md`; when preserving a README, output SHALL explicitly identify the preserved file, the scenario guide paths, the operations reference and manual incorporation of Lace instructions. A project generated in a `cms/` directory SHALL place these files inside that installation root. The same rules SHALL apply with and without `--cloudflare`, retaining existing staged-publication and failure-recovery guarantees.

#### Scenario: Fresh root quickstart
- **WHEN** a consumer generates a fresh project in `cms/`
- **THEN** `cms/README.md` contains the Lace requirements and scenario guide links, its manifest entry has user ownership without a digest, and CLI output points to README, the scenario guides and the operations guide

#### Scenario: Existing README including arbitrary bytes
- **WHEN** `init .` succeeds in an allowed target containing a regular README
- **THEN** every original README byte remains unchanged, its manifest entry is user-owned, and CLI output directs the consumer to the scenario guides, the operations guide and manual incorporation

#### Scenario: Failure while preserving an introduction
- **WHEN** staged generation or publication fails in an allowed target with README
- **THEN** the original README and other allowed entries remain unchanged or existing recovery diagnostics identify the original backup, and the command does not claim successful setup

#### Scenario: Cloudflare ownership parity
- **WHEN** a project is generated with `--cloudflare` and an allowed existing README
- **THEN** the README preservation, ownership and fallback match the default variant, and output also names the Cloudflare guide

## ADDED Requirements

### Requirement: Scenario-guide template delivery protects ownership
The generator SHALL advance the ownership template to `0.16.0`, the next unused template version after the completed 33F template `0.15.0`, and record that same version in its manifest, upgrade instructions and current release definition. Every scenario guide SHALL be managed, classified in the deterministic file inventory and hashed. Both Compose guides SHALL be generated in every site mode; the Cloudflare guide SHALL be generated only with `--cloudflare`. Mode and Cloudflare rendering SHALL use the existing selection and omit absent-file links and unavailable scripts. Generator completion output SHALL link to the scenario entry points while retaining the existing site's block-install and connection next steps.

Upgrades from template `0.14.0` SHALL add new managed guides and replace unmodified managed references through the existing plan/apply procedure. Edited managed operations or guide files, and collisions at new managed guide paths, SHALL produce conflicts rather than overwrite operator bytes. Upgrade instructions SHALL give the new guide paths and explain that the user-owned README does not become the new entry README automatically. Upgrades SHALL preserve README, lace.config.ts, .env, Worker configuration and every site file byte-for-byte. Generation in a CMS directory SHALL never rewrite an existing site's root README; retained init README files SHALL be offered links through generator output. This change SHALL create no remote resource or deployment.

#### Scenario: Deterministic mode variants
- **WHEN** generation runs twice for each of the three site modes with and without Cloudflare
- **THEN** trees, managed guide hashes and manifests match the reviewed snapshots for that variant

#### Scenario: Upgrade from 0.14.0
- **WHEN** a template 0.14.0 project with unchanged managed files and customized user files applies a matching current template
- **THEN** new guides are installed, references are current, instructions name the new guides, user bytes are unchanged and a following plan has no changes

#### Scenario: Managed documentation or destination edited
- **WHEN** the old operations reference is edited or a user file occupies a new managed guide path
- **THEN** plan reports the conflict and apply preserves the files through existing conflict handling

#### Scenario: Existing-site README
- **WHEN** generation connects an existing Astro root from its CMS directory or init preserves an allowed README
- **THEN** existing README bytes remain unchanged and completion output offers the appropriate guide links
