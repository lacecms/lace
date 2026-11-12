## Why

RF7C of the refactoring roadmap brings the CLI's flat source tree under the existing architecture §6 layout. Its root-level implementation and `index`–`diagnostics` cycle obscure ownership and prevent the existing layout and cycle guards from fully protecting this package.

## What Changes

- Organize CLI implementation and colocated tests by concern, declare directory dependencies, and remove the CLI cycle and its baseline entry.
- Move the three shared JavaScript test helpers to typed `src/test-support/`, preserving source and packaged test coverage.
- Consolidate equivalent CLI-local record predicates and make the block scaffold's field-type handling exhaustive without importing content at runtime or changing generated output.
- Update references, guard inventories and roadmap bookkeeping for this session; retain the public package API, CLI behavior and packaged registry.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a behavior-preserving refactor under existing `workspace-governance`, `operational-cli`, and `block-source-registry` requirements; `skip_specs` avoids inventing a behavioral delta.

## Impact

`packages/cli`, its tests and build/packaged paths, boundary inventories, verification references, and the refactoring roadmap are affected. Architecture §§6, 7, 13, 19–20 and ADR 0020 govern the work. RF7A and RF7B are complete dependencies. RF9F retains the remaining CLI test typing; its duplicate assignment of the three helpers is corrected when RF7C completes. No new public exports, dependencies, command grammar, output, scaffold semantics or release changes are intended. RF7D naming work is out of scope.
