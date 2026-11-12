## Why

RF7B of the refactoring roadmap removes duplicated command parsing and developer-script implementations before RF7C reorganizes the CLI. Divergent parsers and parallel migration/sync paths make established behavior harder to maintain and verify.

## What Changes

- Introduce a shared flag parser and a command-definition table for every `lace` command, converting doctor and preflight first while preserving the current command grammar, help, output, diagnostics, lazy loading and execution behavior.
- Route the root Cloudflare migration and Compose content-sync wrappers through the built CLI, preserving their existing interfaces and safety protections; keep the separate Cloudflare development startup path working.
- Consolidate identical Node/library TypeScript configurations, rename the browser base to a web base documenting its fetch-types purpose, and remove the CLI's redundant lib overrides.
- Pin the existing help output and verify representative successful and invalid command invocations and both developer workflows.

This is a behavior-preserving refactor: no new capability or public contract change is intended. Existing accepted requirements remain authoritative.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Existing `operational-cli`, `cloudflare-local-development`, `local-node-development`, `content-import-cli` and upgrade/block-related specifications continue to apply; no requirements are changed.

## Impact

`packages/cli`, root development scripts and their tests, shared TypeScript configurations and their consumers are affected. Architecture §§6, 7, 12, 18–20 and 21 govern boundaries, development, tooling and operations. RF1A and RF7A are complete dependencies. RF7C source reorganization, RF7D naming hygiene, new CLI options and changes to generated consumer workflows are outside scope. No dependency or migration is intended.
