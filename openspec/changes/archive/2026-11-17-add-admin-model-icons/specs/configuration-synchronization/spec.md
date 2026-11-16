## ADDED Requirements

### Requirement: Sidebar icon edits update display metadata through synchronization
On Node/SQLite and Cloudflare/D1, adding, changing, or removing a model icon
SHALL be classified as a projection-only update when structure and version
match. The existing guarded mutation SHALL update the full projection
identity and its public identity source together. With a trusted public
baseline and equal public identity, synchronization SHALL preserve published
state and build work as well as content snapshots and their revisions. A
missing or untrusted public baseline SHALL follow the existing conservative
rules for projection changes.

#### Scenario: Syncing only an icon edit needs no rebuild
- **WHEN** an existing model with trusted public identity changes only its
  icon and synchronization applies the plan
- **THEN** sync updates the model's projection identity and source with no
  snapshot writes, published-state advance, or build request, and repeating
  sync yields no operations

#### Scenario: Changing an icon alongside public metadata still rebuilds
- **WHEN** an existing model changes both its icon and a public projection
  property such as its label
- **THEN** the guarded update advances published state once and creates or
  coalesces one pending build request

#### Scenario: An icon edit without a trusted public baseline follows normal recovery
- **WHEN** an icon change alters the full projection hash while the stored
  public baseline is missing or untrusted
- **THEN** sync records a new public identity pair, advances published state
  once, and creates or coalesces one pending build request
