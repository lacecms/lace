## ADDED Requirements

### Requirement: Documentation is an isolated private workspace application

The repository SHALL declare `@lacecms/app-docs` as a private application in the existing pnpm/Turborepo workspace. Its build, typecheck, lint and relevant verification SHALL participate in root quality commands and CI with pinned catalog/lockfile dependencies and the existing Node/pnpm baseline. It SHALL NOT be included in public npm package inventories or CMS/builder runtime images. It SHALL NOT import Lace runtime packages or be imported by CMS applications/packages; documentation infrastructure SHALL NOT introduce a new CMS runtime dependency edge. Boundary checks SHALL recognize and enforce this application boundary. Oxlint/Oxfmt SHALL remain the configured lint/format tools.

#### Scenario: Clean root checks
- **WHEN** frozen dependencies are installed and the existing root quality commands are run
- **THEN** documentation tasks participate successfully without starting CMS services and public artifact inventories remain unchanged

#### Scenario: Runtime coupling
- **WHEN** a docs source imports a Lace runtime package or a CMS member imports the docs application
- **THEN** boundary verification fails and identifies the forbidden dependency

#### Scenario: Documentation-only dependency
- **WHEN** a static documentation dependency is added
- **THEN** it is pinned through the workspace policy and does not enter published CMS runtime manifests or images
