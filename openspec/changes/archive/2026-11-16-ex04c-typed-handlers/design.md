## Context

See [proposal.md](proposal.md). The shared server registers routes from EX4A's
method, path and policy declarations. `hono-openapi` attaches documentation
to validator middleware, but its validator's declared return type erases
the hook response. The hook itself is cast to `never`, handlers often cast
validated values or reread raw params, and the response helper returns a
plain `Response`. Finally, `register*Routes(...): void` and the factory's
plain `Hono` return type discard the schemas Hono accumulates.

The roadmap counted 29 route casts before EX4A and EX4B. At EX4B's
completion, 24 remain in production route modules, including OpenAPI
adapters, plus one in the shared hook. The exit criterion is zero in
both locations, regardless of the historical count.

## Goals / Non-Goals

**Goals:** Infer schema output at the handler and schema-backed JSON bodies and
literal statuses at the client. Keep Standard Schema validation, Hono routing
and OpenAPI introspection on the same route declarations.

**Non-Goals:** Model every global middleware error in the RPC type, infer
provider protocol payloads, replace manual transport parsing or introduce a
second public API client. The inferred shape describes declared v1 product
routes; it does not certify that a deployment enabled an optional route.

## Decisions

### Keep one validator and preserve its documentation metadata

Type `validationHook` against the pinned Standard Schema hook contract. The
success branch continues without a response. The failure branch uses the
existing issue normalizer and returns the existing typed `422` JSON envelope,
with exact pointers and no submitted values.

Use the pinned `sValidator` for middleware inference and preserve the
`hono-openapi` validator metadata on that same middleware when needed to
carry the literal `422` through registration. Keep the integration in
`server/shared`: one schema, one validator execution and one documentation
description per input. A validator with no OpenAPI metadata would lose
documented inputs; a second runtime validator could change parsing and
validation order. Keep the existing JSON Schema conversion behavior; use
the converter's and OpenAPI's parameter or result types at their adapter
boundary instead of the route-level `as never` assertions.

Read validated targets through `context.req.valid()` without restating their
output types. Convert validated identifiers and the selected configuration
model key at the server-to-application boundary; infer the target types
from application inputs. Keep unavoidable nominal conversions in narrow
helpers over the already checked primitives, with the precondition explicit.
This retains the current dependency direction and avoids adding a server-to-
domain dependency or changing public wire schemas. For build export convert
the existing clock value and Bearer credential to the verifier's input types
at the authentication boundary. Preserve the Bearer check, rejection status,
headers, and the order of verification before query, conditional and export
work; a credential conversion must not turn invalid input into an internal
error.

Leave the current manual parsers in place for multipart, header and query
special cases and optional JSON. In particular, manual build request and
retry must still authorize the session before preparing the optional body
and retry ID. Preserve duplicate-query handling for build export and existing
content and media precondition evaluation.

### Carry real response types through the router

Have the JSON response helper carry the parsed wire DTO and the supplied
literal status (default `200`) through Hono's return type. Keep its existing
runtime schema parse, serialization and headers, including strict public
response validation; a type does not prove that an adapter returned a
valid DTO at runtime. Keep the shared classification and error envelope,
and retain exact statuses for explicit route returns such as `404` and
`422`. A handler returning more than one shape must retain the status and
body pairing, including the two build-export page shapes for `200`.
Preserve bodyless account and deletion responses and export/media `304`
responses. Type bodyless and binary branches using their actual response
formats; do not label a stream as JSON or buffer it to get a type.
Use Hono's response helpers where they produce equivalent responses, or
isolate any required annotation on the response at the shared constructor
that actually sets its body, format and status.

Have route groups return the actual schema-bearing registration chain and
compose them in the current v1 registration order. Capture the typed result
of mounting `API_V1` in `createLaceApp`; do not maintain a parallel route
map or cast the whole factory to a client schema. Keep the app middleware,
not-found handling, OpenAPI route and provider routes in their current
dispatch positions. Preserve the route-policy and OpenAPI metadata on the
registered handlers, including when using type-preserving subrouters.

Keep conditional registration for build export and OAuth connections.
Their static route types come from the same declarations as the rest of v1;
the capability gate controls whether those declarations are mounted. Keep
any necessary type bridge for conditional mounting local to composition.
Never mount an unavailable endpoint just to retain its client type. Better
Auth, MCP, API reference and health remain outside the v1 product RPC scope.

### Verify type inference and HTTP compatibility independently

Use compile-time checks on `hc<ReturnType<typeof createLaceApp>>` from the
server entry point: a path plus JSON mutation, a validated query with a
transformed output, a single-route validation error, more than one route
group, and bodyless and conditional responses. Assert exact status and DTO
types, and reject incorrect input or a nonexistent method. An assignment
that also accepts `any` is insufficient. Exercise emitted declarations as
well as source typechecking so the existing package entry works for compiled
consumers.

Use existing runtime tests and the OpenAPI snapshot to prove parity. Add
focused regression cases only where existing tests miss a changed boundary,
such as missing optional registrations, bodyless statuses, or exact issue
paths and ordering. Keep source sections within the existing directory and
file-size rules when splitting route groups.

## Risks / Trade-offs

- A widen-to-`Response` branch can erase useful client status narrowing.
  Check the assembled client, including mixed JSON, empty and streaming paths.
- Moving middleware or wrapping handlers can change route matching,
  authorization order or OpenAPI metadata. Keep registration order, check
  unavailable capabilities in partial apps, and compare generated OpenAPI
  with the committed artifact.
- A richer factory return type can expose types TypeScript cannot name in
  declarations. Run the declaration build and check downstream consumers
  before completion.

## Migration Plan

Deploy and roll back the server package as part of the normal engine build.
The app inputs, wire contracts, storage and package runtime exports are
unchanged. There is no data migration or client rollout.
