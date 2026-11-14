## Context

The Node listener associates its socket peer with the request through
`NodeRuntime.setRequestPeer` before invoking the app. The Worker resolves
`CF-Connecting-IP` at Worker ingress. Both use `TrustedClientAddresses` with
request-object keys. `createLaceApp` can pass a streamed body through Hono's
`bodyLimit`, which replaces `context.req.raw`. The Lace limiter and Better
Auth wrapper currently look up the address using this downstream object.

## Goals / Non-Goals

Resolve trust at ingress and transfer the result to typed HTTP request
context. Keep the applications, runtimes and provider adapter connected
through their existing portable boundaries.

## Decisions

### Capture the ingress value before body processing

Wire the existing runtime-supplied address reader through
`composeLaceServices` to `LaceAppInput`. An app middleware reads the original
request once before body handling and stores the resolved value in a typed
Hono context variable. Calls made without trusted ingress metadata use the
conservative fallback. Node still resolves trusted CIDRs against the actual
socket peer. Only Worker ingress reads the edge IP header. The ingress map
serves as the handoff to the app's first middleware.

The Node listener materializes the adapter's lazy request as a native Request
before associating the socket peer and invoking the app. It transfers the body
stream without cloning it, so Hono can replace a buffered chunked request and
an unused cloned stream cannot accumulate upload data.

Pass this context value as explicit input to the shared limiter and the
provider route handler. Keep the downstream request for method, URL, body
parsing and actor resolution. Preserve the limiter's actor selection and the
OAuth token route's existing address plus client ID subject. Keep the
existing direct-call shapes for runtime and provider APIs where callers rely
on them. The server's handler interfaces remain provider-neutral, and
`@lacecms/auth` owns constructing the private Better Auth request and
overwriting its IP header from the supplied trusted value.

Alternatives considered include copying the ingress map entry after each
request replacement, resetting the address in the rate limiter, and moving
rate limiting ahead of body handling. They would depend on the replacement
mechanism, cover only one of the consumers or change the existing order of
limits and body validation. A Hono context variable also avoids putting
trusted metadata in headers on the request shared by routes.

### Verify both consumers independently

Extend the existing Node and Worker security-boundary cases. Make the
streamed control enter the branch that replaces the request and verify the
same protection for known-length bodies. Use the Node listener for a chunked
transport regression and the Worker fetch entry for the edge identity path.
Check Lace's durable bucket decisions independently of the provider's
decision. Exercise the production Better Auth sign-in limiter with a focused
counter or observable rejection that Lace's limit cannot mask. Use
interleaved requests and compare two identities plus the missing-identity
case. Keep the regression at the HTTP boundary so EX4A can reuse it.

## Risks / Trade-offs

- **False positive from a stream that takes the clone-only branch.** Assert
  that the regression exercises request replacement in both runtime paths.
- **A limiter masks the other limiter's result.** Inspect Lace's durable
  decisions and independently assert the provider behavior before any
  shared-limit denial can hide it.
- **Body or execution context changes.** Retain the 413 behavior, forward the
  downstream body to the provider and preserve Worker `waitUntil` handling.

## Migration Plan

Deploy the matching packages and runtime images or Worker bundle. This change
requires no schema or settings migration. Existing durable rate windows keep
their configured expiry. Deployment rollback follows the existing package
and runtime rollback procedure.
