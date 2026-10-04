## ADDED Requirements

### Requirement: CI builds a starter generated from packed packages
Continuous integration SHALL, in addition to building the reference site, pack the Lace packages the generated project depends on, generate a project, install it from those tarballs outside the source workspace, and build its starter site against a local published-export server. The phase SHALL fail when the install resolves a Lace package from the source workspace, when the build emits fewer than the five built-in block types, or when the build token appears in any static output file.

#### Scenario: Shipped starter builds
- **WHEN** the starter phase runs on a clean checkout
- **THEN** the packed generated project installs, builds all five blocks from the served export, and contains no build token in its output

#### Scenario: Template references an unpublished helper
- **WHEN** the starter imports a module that exists only in the source workspace
- **THEN** the packed install or build fails the phase
