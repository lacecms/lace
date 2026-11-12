## 1. CLI structure

- [x] 1.1 Extract shared types, errors and diagnostics vocabulary from the entry cycle; keep the public entry's exact exports and verify the CLI source tests and packaged export pin.
- [x] 1.2 Move implementation and companion tests by concern, update internal imports and entry re-exports, declare actual one-way dependencies in the entry header and `scripts/source-layout.json`, and remove the CLI cycle baseline entry; verify the boundary checker passes without a CLI cycle or layout exception.
- [x] 1.3 Widen the production TypeScript include to nested modules, keep tests/test-support excluded, and update moved-path references in package scripts, tests, snapshots, subprocesses, verification runners and documentation; verify CLI build and referenced paths, including `dist/bin.js` and the import-schema generator.
- [x] 1.4 Preserve `dist/registry/` and correct the registry loader's moved URL base; verify bundled-registry byte parity and packaged block installation tests.

## 2. Shared test infrastructure and local rules

- [x] 2.1 Convert the three CLI fixture/API helpers to typed `src/test-support/` modules, update source and packaged consumers, remove their JavaScript allowlist entries and update moved baseline paths; verify test-support typechecking and both test configurations, with no test helpers emitted in the build.
- [x] 2.2 Replace equivalent CLI record predicates with one local helper while preserving narrower types and distinct predicates; run affected import, upgrade and block tests and confirm no production content dependency is added.
- [x] 2.3 Make block scaffold field handling exhaustive against the supported field vocabulary without altering malformed-input behavior or output bytes; verify all field types and representative existing generated markup with focused tests and typecheck.

## 3. Integration and completion

- [x] 3.1 Run CLI source and packaged suites, including command help snapshots, exports, Node and Cloudflare lazy loading, registry, import, upgrade and diagnostics; verify schema generation and built binary paths against current expected output.
- [x] 3.2 Update the roadmap progress log and reconcile RF9F's duplicate fixture-helper assignment while retaining its remaining test-typing work; verify documentation references and source/test baseline inventories.
- [x] 3.3 Run the root typecheck, Oxlint, Oxfmt check and boundary/governance checks, then `pnpm exec openspec validate rf07c-cli-source-layout --type change --strict`; record any failures and resolve them before completion.
