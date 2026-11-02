## ADDED Requirements

### Requirement: Every layer evaluates rules through one shared evaluator
Server validation, the published projection (publication, block migration,
published internal links and render), configuration synchronization (pruning
newly hidden published values, skipping hidden backfills and checking newly
visible published occurrences) and the admin SHALL decide whether a target is
visible through one shared evaluator exported by the portable content
package. The evaluator SHALL first compute each controller's effective value
in the occurrence and SHALL then match the target's rule against it. The
effective value SHALL be the controller's present value; a controller that is
absent, or holds `null` as a cleared form value, SHALL take its declared
default, and without a default it SHALL match no rule. No layer SHALL apply
its own default, cleared-value or absence handling. For the same field
definitions, rules and occurrence values every layer SHALL report the same set
of visible keys, on Node and Cloudflare. The published projection SHALL apply
the same effective values to the values it is given, so projecting values that
omit a defaulted controller treats the default as the controller value.
Existing validation results, published snapshots, delivered values and admin
presentation of normalized content SHALL remain unchanged.

#### Scenario: Default applies the same everywhere
- **WHEN** an occurrence omits required select `kind` whose default is `image`, `media` depends on `["image"]` and `videoUrl` on `["video"]`
- **THEN** server validation, the published projection, synchronization pruning and the admin all report `media` visible and `videoUrl` hidden

#### Scenario: Cleared controller in the admin
- **WHEN** an editor clears `kind` so the form holds `null` for it
- **THEN** the admin shows the targets of the default `image`, exactly as the server evaluates an occurrence that omits `kind`

#### Scenario: Optional controller without a default
- **WHEN** optional boolean `hasCta` has no default and is absent, and `ctaUrl` depends on `[true]`
- **THEN** every layer reports `ctaUrl` hidden

#### Scenario: Projection of values without a defaulted controller
- **WHEN** the published projection receives a group value that omits `kind` (default `image`) and holds both `media` and `videoUrl`
- **THEN** the projection keeps `media`, removes `videoUrl`, and keeps the key order of retained keys

#### Scenario: Parity on both runtimes
- **WHEN** the same model, nested group and list-item rules and values are published on Node SQLite and on Cloudflare D1, and pruned by a synchronization that adds those rules
- **THEN** both stored published snapshots hold exactly the keys the shared evaluator reports visible, and equal the keys the admin shows for those values
