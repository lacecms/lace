## MODIFIED Requirements

### Requirement: Evidence separates workspace verification from candidate acceptance
The security verification run SHALL write a record including source/tree identity, tool versions, commands, scenario results, sanitized fault checkpoints, budget measurements and audit dispositions to its own result directory. Candidate claims SHALL identify verified package checksums and image identities from the candidate's prepared inventory. Shipped changes SHALL require a reviewed refreshed clean-source candidate and exact-artifact regression acceptance before final candidate success; earlier artifacts SHALL NOT be relabelled as containing a fix. Local success SHALL NOT imply operations verification, real infrastructure acceptance, publication or stable-release approval. The maintained verification document SHALL describe the runner, its phases, its environment variables and its limits without embedding any run's results.

#### Scenario: Source correction passes against older candidate artifacts
- **WHEN** source tests pass but candidate artifacts predate a shipped correction
- **THEN** evidence reports source success and candidate acceptance remains pending until refreshed artifacts pass
