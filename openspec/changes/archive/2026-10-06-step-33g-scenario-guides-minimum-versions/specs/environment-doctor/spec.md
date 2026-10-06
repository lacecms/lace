## ADDED Requirements

### Requirement: Doctor accepts generated minimum-only version declarations
Doctor SHALL evaluate the selected consumer project's engine declarations without imposing additional repository-only Node or pnpm major caps. For current generated declarations Node `>=24.12.0` and pnpm `>=12`, versions meeting the minimum SHALL pass the version checks and versions below the minimum SHALL fail them. A passing version check SHALL remain only evidence of satisfying that declaration. Valid custom consumer ranges, including explicit upper bounds, SHALL continue to be enforced; missing/invalid declarations and existing secret-safe output and read-only constraints SHALL remain unchanged.

#### Scenario: Minimum and newer majors
- **WHEN** doctor receives a generated consumer manifest and versions at the minimum or stable newer majors
- **THEN** its Node and pnpm version checks pass without claiming the newer majors were runtime-tested

#### Scenario: Below the minimum
- **WHEN** installed Node is 24.11.9 or pnpm is 11.9.9 against the generated declarations
- **THEN** the corresponding compatibility check fails and the prerequisite exit is 4

#### Scenario: Consumer retains an upper bound
- **WHEN** an existing consumer retains a valid bounded engine range and the installed version exceeds it
- **THEN** doctor fails that declared range instead of silently adopting the current generated minimum policy
