## Why

In roadmap session EX6B, both production Compose definitions publish the Node
API and Nginx across host interfaces. Production needs a single ingress path
through Nginx, including first-administrator setup before the builder starts.

## What Changes

- **BREAKING** Remove the API's production host-port mapping. Publish Nginx on
  IPv4 loopback by default, retaining the configurable `LACE_HTTP_PORT`.
- Route production browser, host HTTP operations and manual Astro build
  requests through the configured HTTPS ingress. Keep a documented
  loopback Nginx upstream and an explicit path for a different proxy topology.
- Start Nginx and the CMS dependencies for production bootstrap before a build
  token exists. Preserve the generated local `pnpm dev:api` workflow through a
  development-only Compose file selected explicitly by that command.
- Update the generated and repository production files, operator guides and
  upgrade guidance. Verify the resolved mappings and their behavior with
  packaged consumers, including the transition from local dev to production.
- Keep Cloudflare Worker ingress, Node listener behavior, proxy trust
  resolution and database semantics outside this session.

## Capabilities

### New Capabilities

### Modified Capabilities

- `vps-composition` defines internal API routing, the default loopback Nginx
  port and explicit alternate proxy configuration.
- `project-generator` defines the generated development and production
  entry points and the upgrade instructions for existing installs.
- `generated-project-acceptance` verifies effective Compose bindings and
  ingress, including upgrades from the published rc4 template.

## Impact

The change affects production Compose, generator assets and snapshots, the
generated operator flow, and public Node deployment documentation. Update
architecture §5 and §7 before implementing the new defaults. EX6B has no
implementation dependencies. Release numbering and publication are separate
from this change.

[Roadmap EX6B](../../../docs/extensibility-roadmap.md#session-ex6b--restrict-host-port-bindings-in-production-compose) ·
[Architecture §5](../../../docs/architecture/deployment.md#5-system-context) ·
[Architecture §7](../../../docs/architecture/distribution.md#7-generated-user-project) ·
[VPS composition](../../specs/vps-composition/spec.md) ·
[Project generator](../../specs/project-generator/spec.md) ·
[Generated acceptance](../../specs/generated-project-acceptance/spec.md)
