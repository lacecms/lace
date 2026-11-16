## Context

`server` currently exposes `accountSecurity`, `tokenSecurity` and `profiles` to routes. The session summary reads a profile in server composition, while settings status reads runtime capabilities in its handler. `AccountUseCases`, `OAuthConnectionUseCases`, `sendTestEmail` and `SiteBuildUseCases` already own part of the workflow and can carry the remaining checks.

| Current caller | Route-level checks | Application owner |
| --- | ---: | --- |
| `admin-users.ts` | 2 | User listing and update join existing account administration |
| `credentials.ts` | 6 | Build and import token administration |
| `setup-session.ts` | 2 | Settings status and test email |
| `builds.ts` | 3 | Configured site read, request and retry |

The roadmap's count of twelve matches the calls to `usersActor` and `settingsActor`. The build-site handler has one additional inline `content:read` check. The import issue handler also invokes `importTokenCapabilities`, which repeats its `settings:manage` check. Move that helper with the issuance logic and enforce that permission once.

## Goals / Non-Goals

**Goals**

- Give every in-scope operation an application entry point that enforces its own authority when called without HTTP.
- Keep transport and runtime concerns at their existing boundaries, including failure classification, guarded persistence and optional services.

**Non-Goals**

- OAuth protocol changes, new MCP tools, provider route changes, database migrations, or changes to the operator bootstrap minting command.
- Handler typing and pagination changes belong to EX4C and EX4D respectively.

## Decisions

### Use the existing actor and permission policy

Use the provider-neutral `Actor` across the boundary. For session-only operations, require a resolved actor without delegated authority, following the existing OAuth-connection use case. Enforce the same session rule in account self-service, settings, token and user management, and build use cases. Apply the domain role permission check for admin commands and build reads. A role-only check at the route or a permission-only check in an operation would leave some direct calls without protection, especially self-service and build reads.

Take the account owner from the actor ID and the opaque current-session ID from the authentication adapter. Account use cases own the session summary, profile and password changes, and owned session operations. Supply the existing MCP-connection availability flag to the account capabilities read. Keep OAuth connection ownership in its existing use case and adapter. Return a portable missing/disabled-profile outcome from the summary so REST can produce the current session challenge without moving challenge selection into the application.

### Compose focused use cases on the existing ports

Add user listing/update and setup state/completion to the account application boundary. Reuse the existing invitation, reset and session methods. Treat public setup, invitation and reset operations as explicit use cases with their existing accepted inputs and guarded outcomes. Keep the deferred-delivery callback used for password reset and password-change notices.

Token administration uses the list/issue/revoke portion of `TokenSecurityPort` and the composed clock. Issuance derives creator, capabilities and expiry in one place. Keep import verification at the authentication adapter and describe the authenticated result using the existing effective-permissions calculation. Credential projections in `server` map use-case results to the existing DTOs.

Settings status reads the existing configured model count, engine version, canonical MCP endpoint, email status and readiness through composed values and a readiness callback. Authorize before invoking the probe. Test email uses the existing application behavior and the acting user's persisted email. Build selection uses the safe identity already parsed at startup. Site-build reads and writes use the existing repository and outbox command paths. Keep the final-administrator, bootstrap and invitation guards inside the existing Node transaction or D1 guarded batch. An application pre-read cannot replace those guards.

### Preserve HTTP ordering through shared composition

`composeLaceServices` constructs the portable operations once for both runtimes. Route context exposes those operations, actor and current-session resolution, and the narrowly scoped transport capabilities. Keep the build-export verifier as a separately named authentication capability so its availability continues to control registration. Keep the existing optional route and error behavior in partial `createLaceApp` compositions and update the fixtures and offline OpenAPI generator input as needed.

Remove `usersActor` and `settingsActor` and the handler's `requireContentReader` call. Existing handler-side schemas, response projections and origin checks stay at the HTTP boundary. For the manual build and retry routes, authorize before optional body parsing as today. Let the command take deferred input preparation where needed, with a transport-neutral callback invoked after authorization and before enqueueing. Keep existing typed direct calls usable. Parsing eagerly there would change the response when a session lacks permission and the request also fails validation.

REST keeps the explicit import and build credential modes and MCP continues to call the shared content operations directly. Adding permission names to the EX4A route policy would duplicate the application authorization and leave non-HTTP entry points dependent on caller discipline.

## Risks / Trade-offs

- Authorization ordering can shift when a handler becomes thinner. Compare valid and invalid requests for representative admin, viewer and anonymous sessions, and assert no protected work after a refusal.
- A shared actor shape can carry import or MCP delegation. Exercise direct calls with delegated actors and verify the current REST cookie/Bearer matrix and MCP tool inventory.
- Moving composition can change optional-route and OpenAPI registration. Exercise both runtimes, partial composition, and the checked-in OpenAPI snapshot.

## Migration Plan

Deploy and roll back by replacing the application and server code together. Existing credentials, accounts, sessions, security state and build history use the same persistence contracts and require no data migration.
