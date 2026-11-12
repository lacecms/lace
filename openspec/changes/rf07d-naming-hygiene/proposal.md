## Why

RF7D finishes the naming hygiene begun in RF1A: historical release and roadmap labels obscure what current verification and tests actually exercise. The current root guard does not protect test titles from this drift.

## What Changes

- Rename the release-named media-selection journey and its references, and give release- or step-numbered verification logs and stages behavior-based names.
- Replace roadmap codes in test titles, temporary-directory prefixes and repository contract case names with descriptive names, updating the literal case-name pin with the cases.
- Extend root governance to reject roadmap codes in test titles, with focused positive and negative checks. Preserve actual release coordinates and historical fixture content when they are test data.
- Record the session's measured outcome in the roadmap. Runtime behavior, coverage, case order and public APIs remain unchanged; verification labels and test names intentionally change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-governance`: require and test a root guard against roadmap identifiers in test titles.

## Impact

This is roadmap RF7D, following completed RF7A–RF7C and RF1A. It affects repository test sources, test-support and contract case pins, verification scripts and references, the root governance test and roadmap bookkeeping. Architecture §§6 and 20 and `workspace-governance` govern the work. RF8X's upgrade fixtures and historical archives are outside scope; actual release/version values and product behavior are not renamed. No dependencies or public exports change.
