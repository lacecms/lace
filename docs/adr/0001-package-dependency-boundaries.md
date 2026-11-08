# ADR 0001: Preserve package dependency boundaries

- Status: Accepted
- Date: 2026-09-07
- Governing architecture: [section 6](../architecture/workspace.md#6-repository-structure)

## Context

Lace must compose portable Node and Cloudflare behavior without letting transport
or infrastructure concerns leak into domain code.

## Decision

Use the architecture's directed package graph. `content` and `config` remain
runtime-portable, `domain` has no framework or infrastructure imports, and
`application` depends only on domain, content, and normalized configuration.
`contracts` owns transport DTOs and is not an application dependency. Database,
auth, server, platform, CLI, admin, and site packages use only their assigned
imports. Packages expose explicit public entry points; imports through another
package's source path are forbidden.

## Consequences

- Use cases can be tested against ports and composed with Node or Cloudflare
  adapters.
- Step 1 must enforce cycles and prohibited edges mechanically in CI.

## Alternatives considered

- A single application package was rejected because it obscures runtime
  boundaries.
- Cross-package relative source imports were rejected because they bypass public
  exports and defeat dependency-direction checks.
- Wrapping every framework API was rejected because only genuine platform
  boundaries need narrow ports.
