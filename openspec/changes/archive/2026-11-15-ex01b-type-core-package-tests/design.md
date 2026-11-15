## Context

The eight packages already run `tsc` over their source tests and use `@lacecms/source` in `tsconfig.test.json`. `@ts-nocheck` is the exception. EX1A may replace the paths of the `server` content-route and `sdk` published-site suites before this change starts. The tests in this session still use the fixtures and persistence setup present when EX1B starts.

## Goals / Non-Goals

Restore strict checking at fixture construction, port calls, transport boundaries and assertions. Keep scope within the tests and test-support for this session's packages. Keep `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and source resolution in force.

## Decisions

1. **Use dependency-safe fixtures.** Reuse `contracts/src/test-support/rest-fixtures.ts`, content's test helpers and application's configuration and media fixtures in their owning packages. `@lacecms/test-utils` already depends on `contracts`, `content` and `application`, so those packages keep local helpers. `server` and `mcp` already depend on `@lacecms/test-utils` for tests and can reuse its actors and `fakePort`; `server` keeps `src/test-support/app-harness.ts`. Keep SDK, Astro and render fixtures local where their client, framework or render shapes are specific to the suite. A single cross-package test dependency would introduce reverse edges for the foundational packages.
2. **Type both sides of the runtime boundary.** Use existing DTOs, inferred schema output, branded ID constructors, port signatures and `satisfies` for valid fixtures. Keep deliberately invalid JSON and unknown values at the parser, request or protocol boundary. Narrow returned JSON, optional values and caught errors before asserting their details. If a case deliberately calls a typed function with an invalid argument to exercise its runtime validation, keep that input and localize any necessary assertion to that call with a reason. Whole-object double assertions, explicit `any` and file-wide suppressions would conceal the fixture errors this session is meant to catch.
3. **Retire exceptions by package.** Remove each directive and its baseline path together after the package compiles. Scope exit to zero entries and zero directives for the eight packages, since EX1A may type or relocate some scenarios during the split.

## Risks / Trade-offs

- A broad fixture rewrite could change which failure an invalid sample reaches. Run each affected suite and keep its invalid values, expected issues, test names and outcome assertions.
- EX2 can update fixtures while EX1B is in progress. Keep any test-only edits narrow and use the fixture API present on the target branch at integration. An EX2 test-store migration belongs to EX2D.
