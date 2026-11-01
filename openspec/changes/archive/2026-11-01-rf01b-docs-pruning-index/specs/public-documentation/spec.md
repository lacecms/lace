## MODIFIED Requirements

### Requirement: Public and internal documentation retain explicit ownership

Repository `docs/**` materials SHALL remain maintained internal engineering documents listed in the internal documentation index with a status; the public site SHALL NOT publish the directory wholesale. An internal document MAY be consolidated into another or deleted only when the index and every document that linked to it are updated in the same change, so that no link or ownership row names a missing file. Public guidance SHALL live in the documentation application, internal architecture/specs SHALL retain their existing authority, and generated-project guides SHALL remain version-matched consumer assets. Internal and public overlapping guidance SHALL use an explicit topic/source map so future behavior changes identify both audiences requiring review. Internal-only edits SHALL NOT change public output unless an explicitly declared public build input is also changed.

#### Scenario: Public guide derives from internal material
- **WHEN** a guide is adapted for the public site
- **THEN** the internal original remains available, public prose is appropriate to users, and the ownership map identifies the maintained source and related audience-specific documents

#### Scenario: Internal report changes
- **WHEN** only an internal verification report or architecture document is edited
- **THEN** its content does not automatically become a public page or resource

#### Scenario: Internal document is consolidated
- **WHEN** an internal document is merged into another and deleted
- **THEN** the index records the replacement, the ownership map and every linking document point at the replacement, and the link guard passes
