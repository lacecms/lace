## ADDED Requirements

### Requirement: Test titles describe behavior

Test and suite titles in maintained repository test files SHALL describe the behavior exercised rather than encode roadmap change or session identifiers. A root repository test SHALL check literal and static portions of template-literal titles supplied to test and suite declarations, including parameterized and modifier forms, in root tests and workspace source, packaged and browser tests. It SHALL report the file and offending title when it finds a roadmap identifier. It SHALL distinguish identifiers as whole tokens, including the project's numbered roadmap families and their optional session letters, from ordinary words. Release coordinates and roadmap identifiers used as test data, historical documentation, comments or non-title strings SHALL NOT cause a failure.

#### Scenario: Roadmap code in a title
- **WHEN** a maintained test declares a title containing a roadmap identifier such as `CE9A`, `LIST1`, or `SM1`
- **THEN** the root test fails and identifies the file and title

#### Scenario: Parameterized and template titles
- **WHEN** a parameterized or modified test or suite has a roadmap identifier in a literal or static template portion of its title
- **THEN** the root test reports it

#### Scenario: Relevant identifiers outside titles
- **WHEN** a test uses a release coordinate or roadmap identifier as data or a comment, or a descriptive title contains an ordinary word
- **THEN** the naming guard does not report that occurrence
