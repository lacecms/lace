## Context

`LaceImage.astro` delegates to `packages/astro/src/media/images.ts`. Its responsive variants come from `astro:assets`. Its current placeholder resolver independently downloads the original, transforms it with the configured image service, and caches the blur by original source URL. The published-site loader provides that source URL separately from the visitor-facing URL.

MP1's `MediaThumbnails` already supplies a durable, versioned static WebP, including for older media, using Sharp on Node and the Images binding on Workers. The admin read is session-only and covers unpublished media. The public original read uses `resolvePublic` to check active status and references from current published snapshots. The new path combines the latter eligibility rule with the derivative lifecycle.

## Goals / Non-Goals

Resolve the placeholder lazily at the same component boundary that renders variants. Give the browser the preview in the initial markup and allow builds to continue when an optional thumbnail is unavailable. Keep authorization in the CMS and the blur recipe in Astro. The existing protected preview input and the original-based behavior for custom descriptions that only provide a source URL remain outside MP2.

## Decisions

### Build-only access to the existing derivative

Add the build credential policy to `GET /api/v1/public/build-media/:mediaId/thumbnail`. Reuse build-export Bearer verification, challenge handling, usage timestamp and fail-closed registration. The route uses the shared ID parser and WebP response and validator handling. Its separate path keeps authenticated thumbnail traffic distinct from anonymous original delivery and Astro's configured remote image source path. Generated OpenAPI describes the binary, the conditional response and the build credential.

Add a published read entry point in `application` next to the admin thumbnail read. Use the same portable public media lookup as the original route before entering the shared read-or-create path and before returning its bytes. This catches unpublication during a stored read or generation. A confirmed miss can use the original inside the CMS through the bounded MP1 path. An existing derivative is read directly. Reuse the same persisted winner, timeout, admission, deletion and reconciliation logic on Node and Worker. A build token provides no session actor, so the new handler has no reason to call or impersonate the admin read.

The build route avoids exposing a new anonymous image URL or putting binary data in the paged export. A single shared media service retains ownership of the derivative across upload, admin browsing and builds.

### Lazy transport through existing image descriptions

The SDK's build client owns the request, including URL construction from the normalized API base, a strong ETag, bounded streaming, and cancellation through the body. Reject redirects. Transport failures carry a typed error without credentials or a raw response body in diagnostics. The published loader attaches a per-media reader closed over the existing authorized client only to optimized media from the validated export. Give it a stable cache identity derived from the API base and media ID. Keep credentials private to the request closure and validate the export before constructing the reader.

The render core forwards the reader through its structural media and image types and performs no I/O. It retains its current dependency boundaries. The immutable site view and usage-alt helper preserve the same reader identity for all uses of one item. Normal published builds always supply a reader for eligible optimized media, even when the API is from an older release. Descriptions constructed for protected preview or independently by a site can still use the existing source-URL behavior.

### Reuse the blur rendering and validate cached results

In Astro, use the optional reader for opaque still images with dimensions and a local transformer. Skip the GIF before requesting its thumbnail, since a background behind a frame with transparency could show the still underneath the animation. Validate the returned static WebP, use its decoded dimensions to fit within 64 pixels without upscaling, and reuse the existing blur data URL and background positioning. Keep the base WebP at or below 4 KiB before wrapping it. The responsive pipeline keeps the original source and the lightbox keeps the public URL. A protected preview or standalone description without a reader keeps the existing original-based resolver.

Share in-flight and completed work per media in a static build, with a bounded number of thumbnail requests in flight and a finite deadline for the optional read. Reuse the existing cache directory with a separate recipe namespace. Key entries by the API origin and base path, media ID and blur recipe. Store the derivative ETag and computed blur together using atomic replacement. A new build sends the ETag through its own authorized reader. Only a confirming 304 can reuse a cached blur. A changed thumbnail replaces it once processed. A missing or corrupt cache is a normal miss. Cache failures and optional thumbnail failures allow normal variants to proceed. Keep persistent entries free of tokens, raw endpoint errors and storage addresses.

## Risks / Trade-offs

- **Cold thumbnail generation can extend a build.** Read only when rendering an eligible image and share work across duplicate uses. Measure prewarmed and cold builds separately. Apply the optional read deadline independently of the original pipeline.
- **An older API, revoked credential or unavailable Images binding may leave an image without blur.** Treat the optional thumbnail result independently of the export and variant errors. A healthy original can still render.
- **A static output can outlive its publication.** A later build checks current eligibility before using cached blur. Previously deployed pages already contain the image rendering output and are refreshed through the existing publication rebuild.
- **An HTML budget matters on slow connections.** Cap each embedded WebP, check the generated markup against the cap, and verify in Chromium that the blur is visible before a deferred variant response and covered afterward. Record generated HTML and asset request bytes on the fixture.

## Migration Plan

Deploy the CMS route before upgrading `@lacecms/sdk` and `@lacecms/astro` together. Builds using the existing token can start reading the same thumbnails immediately. A site built before the API upgrade still renders its variants and can gain blur on a later rebuild. Existing private thumbnails need no migration and the public export keeps its format. The new cache recipe naturally starts cold. Rolling back either package set uses the earlier code paths or the optional-thumbnail fallback.
