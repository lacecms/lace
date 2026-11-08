## MODIFIED Requirements

### Requirement: Module graphs inside workspace members are acyclic and follow declared layouts

The boundary checker SHALL build, for each workspace member, a graph of relative imports and re-exports between production modules under `src/`, including type-only imports, and SHALL fail on a cycle, naming the files on the cycle. Cycles that existed when this requirement was adopted SHALL pass only while each of their strongly connected components is a subset of a component recorded in a committed cycle baseline. A baseline component that no longer forms a cycle in the current graph SHALL fail the check as stale. A committed layout declaration SHALL list the packages that have adopted the architecture section 6 domain-directory layout and, for each such package, the directories each directory may import. For a declared package the checker SHALL fail when a module imports a module in an undeclared direction, when a subdirectory contains an `index` module, when a production module at the `src/` root is neither a package entry declared by the manifest `exports` or `bin` fields nor a process entry named in a committed root-entry list, or when the entry point's `Directory dependencies:` header names a directory set that differs from the declaration. The root-entry list SHALL give a reason for each module, naming what starts it directly (for example Node, a container command or a Compose service); an entry SHALL fail the check when its file no longer exists or is not a `src/` root module of a declared package. A committed exemption list SHALL record, with a reason, each package that deliberately keeps a flat `src/` because it has a single concern. An exemption SHALL fail the check when it names a path that is not a workspace member, when the same package is also declared in the layout declaration, or when the package has a `src/` subdirectory other than `test-support/`. Test files and modules under `src/test-support/` SHALL remain excluded from these graphs. Admin layer and slice structure checks SHALL remain unchanged, and the cycle rule SHALL also apply to `apps/admin` production modules.

#### Scenario: Type-only import closes a cycle
- **WHEN** two production modules of one package import each other, one of them through `import type`
- **THEN** the boundary check fails naming both files

#### Scenario: Baselined legacy cycle
- **WHEN** a package's only cycle lies within a strongly connected component recorded in the cycle baseline
- **THEN** the boundary check passes

#### Scenario: Legacy cycle grows
- **WHEN** a new module joins a baselined cycle so its strongly connected component is no longer a subset of the recorded component
- **THEN** the boundary check fails naming the new component

#### Scenario: Broken cycle leaves a stale entry
- **WHEN** a recorded component no longer contains a cycle in the current graph
- **THEN** the boundary check fails naming the stale baseline entry

#### Scenario: Import against the declared direction
- **WHEN** a module in a lower directory of a declared package imports a module in a directory that the declaration does not permit
- **THEN** the boundary check fails naming the importing file, the imported file and the forbidden directory edge

#### Scenario: Subdirectory barrel
- **WHEN** a declared package adds an `index` module inside a subdirectory of `src/`
- **THEN** the boundary check fails naming the barrel

#### Scenario: Extra root module
- **WHEN** a declared package adds a production module at its `src/` root that no `exports` or `bin` entry and no root-entry list entry names
- **THEN** the boundary check fails naming the module

#### Scenario: Listed process entry
- **WHEN** a declared application keeps a module at its `src/` root that a container command starts directly and the root-entry list names it with a reason
- **THEN** the boundary check passes and the module may import any directory of its package

#### Scenario: Stale or misplaced root entry
- **WHEN** the root-entry list names a module that was deleted, that sits inside a subdirectory, or that belongs to a package absent from the layout declaration
- **THEN** the boundary check fails naming the entry

#### Scenario: Entry header drifts from the declaration
- **WHEN** a declared package adds a directory or its entry header names a directory set different from the declaration
- **THEN** the boundary check fails naming the package and the differing directories

#### Scenario: Exempt package stays flat
- **WHEN** a package listed in the exemption list keeps every production module at its `src/` root
- **THEN** the boundary check passes without a layout declaration for that package

#### Scenario: Exempt package gains a directory
- **WHEN** a package listed in the exemption list adds a `src/` subdirectory other than `test-support/`
- **THEN** the boundary check fails naming the package and the directory, so the package must adopt the layout instead

#### Scenario: Package both declared and exempt
- **WHEN** the exemption list names a package that the layout declaration also lists, or a path that is not a workspace member
- **THEN** the boundary check fails naming the exemption entry

### Requirement: Test helpers are typed, shared and unpublished

Shared test helpers SHALL be TypeScript modules under a member's
`src/test-support/` or exported by `@lacecms/test-utils`, and SHALL be
type-checked. A non-test `.mjs` or `.js` module under a member's `src/`, and a
JavaScript test file under a member's `src/` other than a
`*.packaged.test.mjs` packaged-output test, SHALL fail the boundary check
unless an explicit, documented list names it. Every list entry SHALL give its
reason: a production script run by plain Node or a framework configuration, a
helper that a later roadmap session converts, or a test whose subject is
itself an untyped listed module. A list entry SHALL fail the check when its
file no longer exists. A module under `src/test-support/` SHALL NOT be
listed. Plain-Node consumers of a TypeScript test helper SHALL import it
through Node's built-in type stripping on the supported Node version, so a
helper SHALL use only erasable TypeScript syntax.

`@lacecms/test-utils` SHALL provide the actor fixtures (one builder per role
and a delegated-authority builder) and typed partial port fakes for every
member that may depend on it. A partial fake SHALL satisfy its port type
without a type assertion, and calling an unimplemented member SHALL throw an
error naming the port and the member. Members that `@lacecms/test-utils`
depends on SHALL keep their fixtures in package-local typed test-support. No
test-support module SHALL define its own copy of an actor fixture that
`@lacecms/test-utils` provides.

Node integration and product tests SHALL open runtimes through one Node
runtime test harness. The harness SHALL own the test actor resolver and test
settings, and SHALL run against either the source or the compiled runtime
module that the caller passes. Packages SHALL publish no test-only export: a
test-only package subpath SHALL resolve only through the `@lacecms/source` condition,
and release preparation SHALL omit it from the packed manifest.

#### Scenario: A new untyped helper is added
- **WHEN** a contributor adds a non-test `.mjs` module under a member's `src/`
  that the list does not name
- **THEN** the boundary check fails naming the file

#### Scenario: A new JavaScript source test is added
- **WHEN** a contributor adds a `*.test.mjs` file under a member's `src/` that
  is not a `*.packaged.test.mjs` packaged-output test and that the list does
  not name
- **THEN** the boundary check fails naming the file

#### Scenario: A listed JavaScript test
- **WHEN** the list names a JavaScript test file with the reason that it tests
  an untyped listed module
- **THEN** the boundary check passes

#### Scenario: Packaged-output tests stay JavaScript
- **WHEN** a member keeps `*.packaged.test.mjs` files under `src/`
- **THEN** the boundary check passes without listing them

#### Scenario: A plain-Node script uses the D1 harness
- **WHEN** the durable-restart child process, a plain Node script, imports the
  TypeScript D1 test harness
- **THEN** the harness loads through type stripping and the restart test
  passes as before

#### Scenario: A partial fake meets an unexpected call
- **WHEN** a test builds a partial security-port fake that implements only
  the setup operation, and the code under test calls the session operation
- **THEN** the call throws an error naming the port and the session operation,
  and the fake needed no type assertion

#### Scenario: Packaged product tests use the compiled runtime
- **WHEN** a packaged-output product test opens a runtime through the Node
  harness, passing the compiled platform module
- **THEN** the runtime under test is the compiled one, and a source product
  test passing the source module runs the same scenario against source

#### Scenario: The test actor subpath is not published
- **WHEN** release preparation packs `@lacecms/platform-node`
- **THEN** the packed manifest exports no test subpath, and importing
  `@lacecms/platform-node/test` without the `@lacecms/source` condition fails as an
  unexported path
