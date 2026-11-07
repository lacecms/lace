## ADDED Requirements

### Requirement: Test helpers are typed, shared and unpublished

Shared test helpers SHALL be TypeScript modules under a member's
`src/test-support/` or exported by `@lacecms/test-utils`, and SHALL be
type-checked. A non-test `.mjs` module under a member's `src/` SHALL fail the
boundary check unless an explicit, documented list names it. The list SHALL
hold only production scripts and helpers that a later roadmap session
converts. Plain-Node consumers of a TypeScript test helper SHALL import it
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

### Requirement: Source test caching follows dependency edges

The cached result of a member's source `test` task SHALL depend on that
member's own files, the files of the workspace members it depends on
(including development dependencies), and the shared test configuration. It
SHALL also depend on any repository file outside those members that its
tests read, declared as an input of that member only. A change to a member
that is not in the dependency closure SHALL NOT invalidate the cached result.

#### Scenario: A dependency's source changes
- **WHEN** a source file of `@lacecms/content` changes
- **THEN** the source `test` task hash of `@lacecms/contracts`, which depends
  on it, changes

#### Scenario: An unrelated package changes
- **WHEN** a source file of `@lacecms/cli` changes
- **THEN** the source `test` task hash of `@lacecms/content` stays the same

#### Scenario: A test reads a repository fixture
- **WHEN** a file under the block registry changes
- **THEN** the source `test` task hash of `@lacecms/astro`, whose tests compile
  registry components, changes
