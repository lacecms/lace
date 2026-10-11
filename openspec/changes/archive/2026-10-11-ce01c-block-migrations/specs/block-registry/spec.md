## MODIFIED Requirements

### Requirement: Versioned portable block definitions
The system SHALL define a block with a stable type beginning with an ASCII
letter and containing only ASCII letters, digits, and hyphens, a positive
integer schema version, optional human-readable label and description, typed
field descriptors, an optional valid default field record, and optional data
migrations. A block definition SHALL be detached, deeply readonly data; it
SHALL expose a runtime validator for its fields and a detached serializable
metadata projection that contains no executable value. Defaults and present
values SHALL follow the same draft and publish field-validation rules as model
fields. A block field SHALL NOT declare a `renamedFrom` hint, because changes
to stored block data are expressed through block versions, not field hints.

Migrations SHALL be declared as a map from a target version to a synchronous
function that receives the block data of the previous version and returns the
data of the target version. The target versions SHALL form one contiguous
range of integers that ends at the block's version and starts no lower than 2;
a version 1 block SHALL declare no migrations, and every value SHALL be a
function. Migrations SHALL be retained only on the runtime definition: they
SHALL NOT appear in the metadata projection, the canonical model structure,
the structural or projection hash, or any public projection. Migrating stored
data SHALL compose the declared functions in ascending order from the version
after the stored version to the block's version. Composition SHALL fail as a
missing step when the stored version is below the range the declared
migrations reach. It SHALL fail when a function throws or returns a value that
is not a JSON object. Each function SHALL receive a detached copy of its input,
so it cannot alter stored data.

#### Scenario: Define a serializable block
- **WHEN** configuration defines a valid versioned block using public field descriptors
- **THEN** it receives detached readonly metadata, a runtime validator, and any
  validated default field data

#### Scenario: Reject an invalid block definition
- **WHEN** a block type or version is unstable, metadata is non-serializable,
  a field map is malformed, or default data violates its fields
- **THEN** definition fails before application startup

#### Scenario: Reject a rename hint in a block field
- **WHEN** a block definition contains a field that declares `renamedFrom`
- **THEN** definition fails before application startup with an error naming
  the field

#### Scenario: Define a block with a migration chain
- **WHEN** a block of version 3 declares migrations for versions 2 and 3
- **THEN** definition succeeds, the metadata projection, structure and hashes
  equal those of the same block without migrations, and migrating version 1
  data applies the version 2 function and then the version 3 function

#### Scenario: Reject a malformed migration map
- **WHEN** a block declares a migration for a version above its own version,
  for version 1 or below, a gap such as versions 2 and 4 for a version 4
  block, a range that does not end at its version, a non-integer key, or a
  value that is not a function
- **THEN** definition fails before application startup with an error naming
  the offending migration key

#### Scenario: Composition fails for an unreachable stored version
- **WHEN** a version 3 block declares only the migration to version 3 and
  stored data of version 1 is migrated
- **THEN** composition fails as a missing step naming versions 1 and 3

#### Scenario: Migration output must be a JSON object
- **WHEN** a migration throws, returns an array, a promise, or a value
  containing a function or a non-finite number
- **THEN** composition fails naming the step's target version and the stored
  input is unchanged
