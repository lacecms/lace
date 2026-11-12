## ADDED Requirements

### Requirement: Cloudflare runtime dependency is optional for Node operations
The installed CLI SHALL run Node-target operator commands without Miniflare being installed or loaded. Miniflare SHALL be an optional peer of the CLI. A Cloudflare-target operator command without that peer SHALL fail before database mutation with a sanitized actionable message naming Miniflare and explaining how to install a compatible version, using the existing nonzero operation error and JSON result contract. Other module-loading errors SHALL NOT be misreported as a missing Miniflare installation. Generated Cloudflare projects SHALL provide a compatible Miniflare dependency for their operator commands. Existing doctor output and all other successful operator behavior SHALL remain unchanged.

#### Scenario: Node migration without Cloudflare runtime
- **WHEN** the installed CLI runs `lace db migrate --target node` on a fresh SQLite path and Miniflare cannot be resolved or loaded
- **THEN** migration succeeds and reports its installed versions without loading Miniflare

#### Scenario: Missing peer for a Cloudflare target
- **WHEN** an operator selects either Cloudflare target with valid settings and Miniflare is absent
- **THEN** the command exits before database mutation with a sanitized installation instruction and, in JSON mode, exactly one error result

#### Scenario: Generated Cloudflare installation
- **WHEN** a generated Cloudflare project installs its declared dependencies and runs its local Cloudflare operator command
- **THEN** its compatible Miniflare peer resolves and the command can use local D1

#### Scenario: Unrelated dependency failure
- **WHEN** loading a Cloudflare dependency fails for a reason other than Miniflare itself being absent
- **THEN** the CLI does not claim that Miniflare is missing or expose credentials

#### Scenario: Doctor remains stable
- **WHEN** an operator runs `lace doctor` with the same environment before and after this change
- **THEN** the report and exit status are unchanged
