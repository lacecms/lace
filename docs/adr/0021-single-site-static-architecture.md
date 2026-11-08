# ADR 0021: Single-site installation with a static Astro site

- Status: Accepted
- Date: 2026-11-08
- Governing architecture: [section 4.1](../architecture/README.md#41-single-site-deployment),
  [section 4.2](../architecture/README.md#42-static-public-site) and
  [section 7](../architecture/distribution.md#7-generated-user-project)

This record states a decision taken with the MVP baseline. It was previously
listed in architecture §24 and is recorded here retroactively.

## Context

Lace targets small sites that a developer or a coding agent customizes in
code. Multi-tenancy would shape every table, permission and route, and a
server-rendered public site would put the CMS on the request path of every
visitor.

## Decision

- One Lace installation manages exactly one site: one `lace.config.ts`, one
  content database, one media store, one admin application and one public site.
- Astro generates the public site as static output from published content read
  at build time; public page requests are normally served as static assets
  and do not require the CMS API.
- The supported onboarding path is a generator (`create-lace`) for a new or
  empty project. The generated starter site is optional: a project may connect
  an existing Astro site or run without a site.
- Lace upgrades never overwrite the user's Astro site source; engine-owned and
  user-owned files are separated by the managed-file manifest.

## Consequences

- Tables, authentication, routing and configuration carry no tenant dimension.
- Publication must trigger a rebuild before visitors see a change
  ([ADR 0027](0027-outbox-triggered-rebuild.md)).
- Dynamic per-request public features need a separate decision.

## Alternatives considered

- **Multi-site installations.** Rejected for the MVP: tenant scoping in every
  query, permission and URL for a use case Lace does not target.
- **Server-rendered public pages.** Rejected: couples site availability and
  latency to the CMS runtime.
