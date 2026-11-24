## ADDED Requirements

### Requirement: CMS 1.1.0 selects one stable artifact set

The CMS 1.1.0 release plan SHALL select all sixteen public npm packages at `1.1.0` on `latest`, API and builder images at `1.1.0` for `linux/amd64` and `linux/arm64`, and the regular GitHub release `v1.1.0`. The generator SHALL report ownership template `0.53.0`. Package manifests, generated dependency coordinates, runtime versions, image defaults, registry requirements and current documentation SHALL agree with that plan. The publication record SHALL preserve the verified 1.0.0 release identity. Qualification SHALL bind its results to a complete clean-source 1.1.0 inventory. The existing owner approval, publication and cleanup workflow applies.

#### Scenario: The next stable release is planned
- **WHEN** the release model validates the selected 1.1.0 candidate and renders a publication plan
- **THEN** it reports the agreed package, image, template, channel and tag coordinates without registry writes

#### Scenario: Evidence comes from a different artifact set
- **WHEN** an operator presents a receipt for 1.0.0, a preview build or a different 1.1.0 inventory
- **THEN** it cannot qualify the selected 1.1.0 inventory
