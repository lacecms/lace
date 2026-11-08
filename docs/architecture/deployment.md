# Deployment and operations

Part of the [Lace architecture](README.md).

## 5. System context

```text
Content editor
    |
    v
Admin SPA ---- REST ----> Lace API ----> SQLite/D1
                             |  |
                             |  +------> MinIO/R2
                             |
                             +---------> Build trigger/outbox
                                             |
                                             v
                                      Astro static build
                                             |
                                             v
                                      Static site hosting
```

The admin application and the authenticated API share one origin, which avoids
cross-origin cookie and CORS complexity. The optional MCP surface lives in the
same CMS deployment on both runtimes and needs no extra process, Durable Object
or KV binding; only `LACE_MCP_ENABLED=true` exposes `/mcp` and its OAuth routes
([mcp-content-server](../../openspec/specs/mcp-content-server/spec.md)).
Publication through MCP requires the separate `content:publish` scope, consent
by a user whose current role holds that permission (administrators only) and
the shared publication guards; unpublication and deletion stay forbidden
([ADR 0015](../adr/0015-mcp-publication-scope.md)).

### Cloudflare deployment

```text
Cloudflare Worker: /api/v1/*, /api/auth/*, /admin/* -> built admin assets
Bindings: D1 (authoritative SQL data), R2 (media objects), KV (optional cache)
Separate static deployment: Astro output, rebuilt by deploy hook or CI
```

A generated Cloudflare consumer (`--cloudflare`) owns its Worker in `worker/`:
a managed entry that imports the project's `lace.config.ts` and a user-owned
`wrangler.jsonc`. `@lacecms/platform-cloudflare` ships the compiled admin of the
same release, so the Worker is bundled and deployed without an engine checkout.
Secrets are uploaded with Wrangler and kept locally in the ignored
`worker/.dev.vars`, never in the Worker configuration
([cloudflare-consumer-worker](../../openspec/specs/cloudflare-consumer-worker/spec.md)).

The static Astro deployment is configured separately; deploying it never
deploys the CMS. The reference hook-driven host is a Git-connected Cloudflare
Pages project whose deploy hook, the Worker secret `LACE_DEPLOY_HOOK_URL`, is
the build trigger; Pages builds the site from the Worker origin with a read-only
build token. The generated direct-upload workflow is the alternative without
hook-driven rebuilds. A hook accepted by the provider is an `accepted` build, never a
confirmed deployment (§9.8); optional Pages tracking with a separate read-only
token follows the exact deployment to a proven outcome or a deadline
([cloudflare-deploy-hook-trigger](../../openspec/specs/cloudflare-deploy-hook-trigger/spec.md),
[cloudflare-pages-deployment-tracking](../../openspec/specs/cloudflare-pages-deployment-tracking/spec.md)).
Real-account steps are in `docs/cloudflare-deployment-handoff.md`, used in the
[owner checks on real infrastructure](../verification.md#owner-checks-on-real-infrastructure).

### VPS deployment

```text
Docker Compose
├── lace-api: Node.js + Hono, built admin assets, mounted SQLite volume
├── minio: mounted object-storage volume
├── site-builder: private authenticated HTTP endpoint, read-only
│   generated-project source mount, static-output volume, builder-cache volume
└── static web server/reverse proxy: Astro build output
```

Production builds go through `SiteBuildTrigger`; the VPS implementation calls
the first-party builder's private authenticated endpoint, and a later adapter
may call an external CI webhook. The API never accepts an arbitrary shell
command from an HTTP request. The builder ignores command, path and environment
overrides, runs one image-defined build against fixed mount paths, builds into
a temporary release and atomically switches the served release only after
success. Its own deployment settings, never the request, supply
`LACE_BUILD_SITE_URL` and `LACE_SITE_INDEXING` (§9.8;
[ADR 0004](../adr/0004-fixed-command-vps-builder.md),
[fixed-command-vps-builder](../../openspec/specs/fixed-command-vps-builder/spec.md)).

The builder cache (pnpm store and Astro image cache) is a bounded optimization:
it never enters a release, never depends on request data, and an unusable cache
means an uncached build. Static responses revalidate so a switched release is
visible on reload, except content-hashed `/_astro/` files, which are immutable
for 30 days; Cloudflare Pages receives the same rule through the site's
`public/_headers`, which the VPS proxy refuses to serve
([vps-composition](../../openspec/specs/vps-composition/spec.md)).

## 18. Development modes

Two root development commands are required:

- `pnpm dev:node`, the fast vendor-independent workflow: Hono on Node, a local
  SQLite file, MinIO, the admin and Astro development servers behind a
  same-origin proxy, and a local mail capture so outgoing email never leaves
  the machine ([local-node-development](../../openspec/specs/local-node-development/spec.md));
- `pnpm dev:cloudflare`, the integration workflow that validates Cloudflare
  bindings and runtime compatibility: the Worker with locally simulated,
  persisted D1, R2 and optional KV, the `log` email provider, and the admin and
  Astro development servers against the Worker
  ([cloudflare-local-development](../../openspec/specs/cloudflare-local-development/spec.md)).

Generated Cloudflare consumers use their own commands: `cf:dev` runs
`wrangler dev` for `worker/wrangler.jsonc` with state in `.lace/data/cloudflare`,
and `cf:db:migrate`, `cf:content:sync` and `cf:auth:bootstrap` use the explicit
`cloudflare-local` target. Remote provisioning, migration and deployment remain
explicit operator commands.

The workspace also provides `pnpm build`, `typecheck`, `lint`, `test`,
`db:generate`, `db:migrate:node`, `db:migrate:cloudflare` and `content:sync`.

## 21. Observability and operations

Structured logs carry the request ID, the authenticated actor ID where
available, route and status, duration, content entry and model identifiers for
mutations, publication/build event IDs, and sanitized errors
([hono-app-factory](../../openspec/specs/hono-app-factory/spec.md)).

`GET /health/live` and `GET /health/ready` are separate; readiness verifies
configuration and database availability without expensive external calls on
every probe.

Operationally important admin information: active engine version, database
migration version, content-configuration hash/sync state, object-storage
connectivity and latest site build status.

`pnpm verify:operations` verifies local health, coordinated restore, credential
rotation and forward migration
([local-operations-verification](../../openspec/specs/local-operations-verification/spec.md));
results go under `.lace-acceptance/verify-{cross-runtime,security,operations}-*`.
Real deployment checks remain
[owner operations](../verification.md#owner-checks-on-real-infrastructure).
