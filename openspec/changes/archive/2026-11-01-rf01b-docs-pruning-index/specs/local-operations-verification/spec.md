## MODIFIED Requirements

### Requirement: Traceability and candidate identity control completion claims
One maintained verification document SHALL map every Included item in architecture §3 and security requirements in §14 to the concrete tests, runners, acceptance stages and guides that cover it, with explicit gaps and owner-check references for external checks. Each verification run SHALL record source identity, tool versions, commands, phase results and, when artifacts are used, the exact artifact checksums/image identities in its own result directory rather than in the maintained document. Shipped code or managed-template changes SHALL require a coherent clean-source candidate and exact-artifact acceptance on clean generated Node and Cloudflare-local consumers, including the starter and independent user-owned Astro ownership cases. Historical run records SHALL NOT be kept in the repository; the archived release changes hold each release's readiness evidence. Local checks SHALL NOT close remote deployment, remote capacity, remote restore, publication or stable-release approval, which remain pending until their own evidence exists.

#### Scenario: Source changes after the previous candidate
- **WHEN** version display or guide changes pass workspace checks but packed artifacts predate them
- **THEN** candidate acceptance stays pending until refreshed artifacts pass the required exact-artifact journeys

#### Scenario: Roadmap local acceptance completes
- **WHEN** all required local phases pass and every §3 and §14 item has a row in the verification document
- **THEN** local completion is recorded while unperformed external checks retain pending status

#### Scenario: Coverage row loses its evidence
- **WHEN** a test, runner phase or acceptance stage named in a coverage row is removed
- **THEN** the verification document is updated in the same change so that no row names evidence that does not exist
