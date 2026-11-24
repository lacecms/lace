## Why

The single `CI / quality` job in PR #86 took 20 minutes 35 seconds. A failure requires repeating the whole job, and two source test suites account for most of its runtime. [Baseline run](https://github.com/lacecms/lace/actions/runs/45412312777/job/138509099373?pr=86)

## What Changes

- Deliver one CI maintenance session outside the EX1–EX7 roadmap steps. It has no release or deployment dependencies.
- Run independent checks in parallel and retain `CI / quality` as the aggregate status. Failed test jobs can be retried independently.
- Run the existing source, packaged, and root test coverage in separate jobs. Start with two Admin Vitest shards and divide the long local D1 repository contract across two runners.
- Build the workspace once per run and reuse the build outputs in jobs that need them. Keep frozen installs with the existing pinned toolchain and pnpm store cache.
- Keep local root commands, the PR and `main` triggers, and the checks run by the current quality job. Application behavior, released packages, deployments, and dedicated acceptance workflows are outside this session.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-governance` permits CI to partition the root test gate with equivalent coverage and defines the aggregate status and shared build behavior.

## Impact

Touches `.github/workflows/ci.yml`, shared CI setup, CI-facing test and build orchestration, and the contributor verification guide. The relevant architecture is [§4.8](../../../docs/architecture/README.md#48-spec-driven-delivery) and [§20](../../../docs/architecture/workspace.md#20-testing-strategy). The [packed consumer acceptance requirements](../../specs/generated-project-acceptance/spec.md) continue to apply.
