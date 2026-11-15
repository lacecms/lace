## Why

[EX1D](../../../docs/extensibility-roadmap.md#session-ex1d--type-cli-generator-and-app-tests-was-rf9f) restores TypeScript checking for 29 CLI, generator, API and builder source tests. The existing test projects can catch fixture and contract drift once those tests are checked.

## What Changes

- Type the 21 `@lacecms/cli`, two `create-lace`, four `@lacecms/app-api` and two `@lacecms/app-builder` tests listed in `scripts/test-typecheck-baseline.json` on the planning checkout. Remove the matching directives and baseline entries while retaining the existing test cases, assertions and cleanup.
- Run EX1D before EX2. Keep the `db`, `platform-node` and `platform-cloudflare` exceptions for EX1C after EX2D. The EX1D tests use the contracts on the target checkout, so they have no dependency on EX2 or EX1C.
- Scope changes to the four members' source tests, their typed test helpers, and the exception inventory. CLI behavior, generated file contents, runtime behavior and public exports are preserved.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The existing [workspace governance requirement](../../specs/workspace-governance/spec.md#requirement-test-typecheck-exceptions-are-limited-by-a-shrinking-baseline) already governs retiring these exceptions.

## Impact

Contributors get type checking for these tests through the existing pnpm tasks under [architecture §6 and §20](../../../docs/architecture/workspace.md). The accepted [operator CLI](../../specs/operational-cli/spec.md), [block installation](../../specs/block-installation-cli/spec.md), [content import](../../specs/content-import-cli/spec.md), [upgrade recovery](../../specs/upgrade-apply-recovery/spec.md), [project generator](../../specs/project-generator/spec.md), [Node API composition](../../specs/node-api-composition/spec.md) and [fixed-command builder](../../specs/fixed-command-vps-builder/spec.md) requirements continue to govern the existing tests.
