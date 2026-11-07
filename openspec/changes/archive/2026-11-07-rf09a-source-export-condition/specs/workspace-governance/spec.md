## MODIFIED Requirements

### Requirement: Package tests run from source and packaged output separately

Each workspace member's `test` command, including the admin application's
unit tests, SHALL run its tests against TypeScript source and SHALL NOT depend
on any build task. Every `@lacecms/*` specifier, including every declared
subpath export, SHALL resolve to source through a `@lacecms/source` export condition
that the target package declares in its own manifest. Test runners and test
type-checking SHALL enable that condition. Production builds, development
servers, production type-checking and packaged-output tests SHALL NOT enable
it. Every package export whose target is compiled output SHALL list the
`@lacecms/source` condition first, naming the existing source module that the target
is built from. The boundary checker SHALL fail, naming the package and
export, when that condition is missing, not first, or names a missing file.
Test files SHALL be TypeScript and SHALL be type-checked by the member's
`typecheck` command. Test and type-test projects SHALL type-check against
source without built output. The only permitted exceptions are legacy test
files listed in the typecheck-exception baseline, and that baseline SHALL only
shrink. Each published package SHALL keep at least one packaged-output test
that imports its built entry point (and every declared subpath export) and
asserts the exact public export list. Packaged-output tests SHALL run under a
separate `test:packaged` command that depends on the package's build and its
dependencies' builds. The root test command SHALL run both kinds. Tests SHALL
import other Lace packages through their declared package specifiers as the
repository convention. The boundary checker SHALL NOT enforce import
restrictions inside excluded test files or test-support modules; source
tests SHALL still run without built output. Tests MAY import registry
components and local test fixtures through relative paths.

#### Scenario: Package test on a clean checkout
- **WHEN** a contributor runs one package's `test` command on a checkout with no `dist/` directories
- **THEN** the tests run against source and pass without building any package

#### Scenario: Admin unit tests on a clean checkout
- **WHEN** a contributor runs `pnpm --filter @lacecms/app-admin test` on a
  checkout with no `dist/` directories
- **THEN** the admin unit tests resolve `@lacecms/content`,
  `@lacecms/contracts` and the `@lacecms/test-utils` subpaths from source and
  pass

#### Scenario: Test typecheck on a clean checkout
- **WHEN** a contributor type-checks a member's test or type-test project on a
  checkout with no `dist/` directories
- **THEN** sibling packages resolve to source and the check passes without
  building any package

#### Scenario: A new subpath export lacks its source condition
- **WHEN** a package adds an export whose target is compiled output without a
  first `@lacecms/source` condition naming an existing source module
- **THEN** the boundary check fails naming the package and the export

#### Scenario: Production consumers keep compiled output
- **WHEN** a package is built, the admin development server or production
  build runs, or a packaged-output test imports a package
- **THEN** resolution ignores the `@lacecms/source` condition and uses compiled output

#### Scenario: Packaged export list drifts
- **WHEN** a package's build omits or renames a public export
- **THEN** that package's packaged-output test fails naming the missing or unexpected export while its source tests still pass

#### Scenario: Source test relies on built output
- **WHEN** a source test requires a `dist/` file instead of source and runs on a checkout without built output
- **THEN** the source-test gate fails because the built file is unavailable; the boundary checker does not inspect the excluded test imports

#### Scenario: Unlisted test disables type checking
- **WHEN** a test file that the typecheck-exception baseline does not list disables type checking
- **THEN** the boundary check fails before the package's typecheck can silently skip the file
