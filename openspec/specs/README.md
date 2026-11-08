# Lace specifications

Accepted capability behavior. Each capability is listed once, in the group
that owns its rules. When a rule could belong to several capabilities, the
group's ownership rule names the owner; other capabilities refer to it instead
of restating it. Architecture invariants live in
[`docs/architecture/`](../../docs/architecture/README.md); proposed deltas live
in `openspec/changes/`.

## Workspace and release

Repository structure, toolchain and quality gates → `workspace-governance`;
supported Node/pnpm ranges → `runtime-tooling-minimum-policy`; prepared and
published artifacts → `alpha-release-artifacts`.

- [workspace-governance](workspace-governance/spec.md)
- [runtime-tooling-minimum-policy](runtime-tooling-minimum-policy/spec.md)
- [alpha-release-artifacts](alpha-release-artifacts/spec.md)

## Configuration and content model

Model and configuration shape → `content-model-configuration`; descriptor
shape → `field-descriptors`; value validation → `content-validation`;
visibility → `conditional-fields`; structural change between versions →
`schema-evolution`; synchronization planning and reports →
`configuration-synchronization`; collection list queries →
`collection-query-options`; links to entries → `internal-url-links`.

- [content-model-configuration](content-model-configuration/spec.md)
- [field-descriptors](field-descriptors/spec.md)
- [content-validation](content-validation/spec.md)
- [conditional-fields](conditional-fields/spec.md)
- [schema-evolution](schema-evolution/spec.md)
- [configuration-synchronization](configuration-synchronization/spec.md)
- [collection-query-options](collection-query-options/spec.md)
- [internal-url-links](internal-url-links/spec.md)

## Content domain and persistence

Lifecycle and domain invariants → `content-domain-rules`; authorized entry
use cases → `content-use-cases`; media use cases → `media-use-cases`; ports
and in-memory behavior → `application-ports-and-commands`; behavior every
repository must pass → `content-repository-contracts`, with runtime-specific
behavior in `node-content-repositories` and `d1-content-repositories`;
relational schema and migrations → `sqlite-schema-and-migrations`; durable
background work → `outbox-dispatch`.

- [content-domain-rules](content-domain-rules/spec.md)
- [content-use-cases](content-use-cases/spec.md)
- [media-use-cases](media-use-cases/spec.md)
- [application-ports-and-commands](application-ports-and-commands/spec.md)
- [content-repository-contracts](content-repository-contracts/spec.md)
- [node-content-repositories](node-content-repositories/spec.md)
- [d1-content-repositories](d1-content-repositories/spec.md)
- [sqlite-schema-and-migrations](sqlite-schema-and-migrations/spec.md)
- [outbox-dispatch](outbox-dispatch/spec.md)

## Blocks

Block definitions, built-ins and the registry → `block-registry`, except the
Gallery block → `gallery-block` and video embeds → `video-embeds`; reusable
list layout → `list-layout`; conditional block settings →
`block-settings-visibility`; installed source markup, lock and block map →
`block-source-registry`; the `lace add block` command →
`block-installation-cli`.

- [block-registry](block-registry/spec.md)
- [gallery-block](gallery-block/spec.md)
- [video-embeds](video-embeds/spec.md)
- [list-layout](list-layout/spec.md)
- [block-settings-visibility](block-settings-visibility/spec.md)
- [block-source-registry](block-source-registry/spec.md)
- [block-installation-cli](block-installation-cli/spec.md)

## Delivery, rendering and builds

Public client → `public-sdk`; published export to site view →
`published-site-loader`; framework-neutral rendering → `render-core`; Astro
integration → `astro-adapter`; reference site → `astro-reference-site`; when
content becomes visible → `publication-visibility`; build target selection →
`build-site-selection`; build requests and history → `site-build-dispatch`;
build executors → `fixed-command-vps-builder`,
`cloudflare-deploy-hook-trigger` and `cloudflare-pages-deployment-tracking`.

- [public-sdk](public-sdk/spec.md)
- [published-site-loader](published-site-loader/spec.md)
- [render-core](render-core/spec.md)
- [astro-adapter](astro-adapter/spec.md)
- [astro-reference-site](astro-reference-site/spec.md)
- [publication-visibility](publication-visibility/spec.md)
- [build-site-selection](build-site-selection/spec.md)
- [site-build-dispatch](site-build-dispatch/spec.md)
- [fixed-command-vps-builder](fixed-command-vps-builder/spec.md)
- [cloudflare-deploy-hook-trigger](cloudflare-deploy-hook-trigger/spec.md)
- [cloudflare-pages-deployment-tracking](cloudflare-pages-deployment-tracking/spec.md)

## API, accounts and MCP

HTTP composition → `hono-app-factory`; request and response shapes →
`rest-contracts`; browser API reference → `api-documentation-ui`; sessions and
actors → `authentication-and-actor-boundary`; setup, tokens and abuse limits →
`bootstrap-user-token-abuse-controls` and `browser-first-admin-setup`;
account flows → `account-invitations`, `account-self-service` and
`password-recovery`; D1 security storage → `d1-security-persistence`; MCP
tools → `mcp-content-server`; MCP delegation → `mcp-oauth-delegation`.

- [hono-app-factory](hono-app-factory/spec.md)
- [rest-contracts](rest-contracts/spec.md)
- [api-documentation-ui](api-documentation-ui/spec.md)
- [authentication-and-actor-boundary](authentication-and-actor-boundary/spec.md)
- [bootstrap-user-token-abuse-controls](bootstrap-user-token-abuse-controls/spec.md)
- [browser-first-admin-setup](browser-first-admin-setup/spec.md)
- [account-invitations](account-invitations/spec.md)
- [account-self-service](account-self-service/spec.md)
- [password-recovery](password-recovery/spec.md)
- [d1-security-persistence](d1-security-persistence/spec.md)
- [mcp-content-server](mcp-content-server/spec.md)
- [mcp-oauth-delegation](mcp-oauth-delegation/spec.md)

## Admin

Shell and routes → `admin-application-shell`; tokens and styling →
`admin-design-system`; source layers → `admin-source-structure`; remote state
and lists → `admin-remote-state-and-lists`; the entry editor core →
`admin-draft-editor`, with fields → `admin-draft-editor-fields`, media and
list items → `admin-draft-editor-media-lists`, blocks →
`admin-draft-editor-blocks` and publication and lifecycle actions →
`admin-draft-editor-publication`; media library → `admin-media-library`;
users and settings → `admin-users-and-settings`; account screens →
`admin-account-screens`; introductory tour → `admin-introductory-tour`.

- [admin-application-shell](admin-application-shell/spec.md)
- [admin-design-system](admin-design-system/spec.md)
- [admin-source-structure](admin-source-structure/spec.md)
- [admin-remote-state-and-lists](admin-remote-state-and-lists/spec.md)
- [admin-draft-editor](admin-draft-editor/spec.md)
- [admin-draft-editor-fields](admin-draft-editor-fields/spec.md)
- [admin-draft-editor-media-lists](admin-draft-editor-media-lists/spec.md)
- [admin-draft-editor-blocks](admin-draft-editor-blocks/spec.md)
- [admin-draft-editor-publication](admin-draft-editor-publication/spec.md)
- [admin-media-library](admin-media-library/spec.md)
- [admin-users-and-settings](admin-users-and-settings/spec.md)
- [admin-account-screens](admin-account-screens/spec.md)
- [admin-introductory-tour](admin-introductory-tour/spec.md)

## Runtimes and deployment

Node composition → `node-api-composition`, object storage →
`node-minio-object-storage`, local development → `local-node-development`,
VPS topology → `vps-composition`; Worker composition →
`cloudflare-worker-composition`, R2 media → `cloudflare-media-storage`,
scheduled dispatch → `cloudflare-scheduled-dispatch`, local Cloudflare →
`cloudflare-local-development`, generated consumer Worker →
`cloudflare-consumer-worker`, remote operator credentials →
`cloudflare-operator-credentials`; transactional email → `email-delivery`.

- [node-api-composition](node-api-composition/spec.md)
- [node-minio-object-storage](node-minio-object-storage/spec.md)
- [local-node-development](local-node-development/spec.md)
- [vps-composition](vps-composition/spec.md)
- [cloudflare-worker-composition](cloudflare-worker-composition/spec.md)
- [cloudflare-media-storage](cloudflare-media-storage/spec.md)
- [cloudflare-scheduled-dispatch](cloudflare-scheduled-dispatch/spec.md)
- [cloudflare-local-development](cloudflare-local-development/spec.md)
- [cloudflare-consumer-worker](cloudflare-consumer-worker/spec.md)
- [cloudflare-operator-credentials](cloudflare-operator-credentials/spec.md)
- [email-delivery](email-delivery/spec.md)

## CLI, generator and upgrades

Database and administrator commands → `operational-cli`; read-only
diagnosis → `environment-doctor`; content import → `content-import-cli`;
project generation and templates → `project-generator`; delivered onboarding
guides → `generated-project-onboarding`; upgrade plans →
`upgrade-planner`; applying upgrades → `upgrade-apply-recovery`.

- [operational-cli](operational-cli/spec.md)
- [environment-doctor](environment-doctor/spec.md)
- [content-import-cli](content-import-cli/spec.md)
- [project-generator](project-generator/spec.md)
- [generated-project-onboarding](generated-project-onboarding/spec.md)
- [upgrade-planner](upgrade-planner/spec.md)
- [upgrade-apply-recovery](upgrade-apply-recovery/spec.md)

## Acceptance and verification

Generated consumer journeys → `generated-project-acceptance`; exact-artifact
release acceptance → `prepublication-consumer-security`; browser-admin
walkthrough → `local-product-acceptance`; runtime parity →
`cross-runtime-product-verification`; operations and restore →
`local-operations-verification`; security and fault recovery →
`local-security-resilience-verification`.

- [generated-project-acceptance](generated-project-acceptance/spec.md)
- [prepublication-consumer-security](prepublication-consumer-security/spec.md)
- [local-product-acceptance](local-product-acceptance/spec.md)
- [cross-runtime-product-verification](cross-runtime-product-verification/spec.md)
- [local-operations-verification](local-operations-verification/spec.md)
- [local-security-resilience-verification](local-security-resilience-verification/spec.md)

## Documentation

Public guidance content → `public-documentation`; publishing the
documentation site → `documentation-publication`.

- [public-documentation](public-documentation/spec.md)
- [documentation-publication](documentation-publication/spec.md)
