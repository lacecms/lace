## Context

See the [proposal](proposal.md) for the production observation. `MediaThumbnail` and the details preview currently use the same URL. The server resolves active media with `content:read` and streams the verified object. The library and picker use TanStack Query and share the paged admin media client. That client already accepts an explicit `limit`, and the REST contract permits 24.

Architecture §17 currently names the original preview endpoint for thumbnails. §9 describes original GIF delivery as byte-preserving and owns the upload and deletion lifecycle. §12 describes the original binary validators and §15 owns runtime ports. Record the derivative contract in those sections and the MP1 session in the roadmap before implementing it.

## Goals / Non-Goals

**Goals** include durable, bounded static thumbnails on both runtimes, post-upload generation with on-demand recovery, deletion with the original, and explicit pagination with accessible feedback.

**Non-goals** include a derivative catalog, a bulk backfill, Astro integration, public or build-token thumbnail access, an additional stored placeholder size and numbered navigation.

## Decisions

### One private derivative per media item

Add a fixed `GET /api/v1/admin/media/:mediaId/thumbnail` representation. The HTTP route owns session authentication, OpenAPI, private response headers and conditional handling. It resolves an active item with `content:read` before accessing the application thumbnail service. The service owns derivative generation, validation and storage. An eligibility check at the service's persistence boundary prevents a caller from generating a derivative for inactive media.

Use one static WebP representation that fits within 320 × 320 pixels and 96 KiB. Resize to fit without upscaling or cropping. Preserve display orientation, aspect ratio and transparency. Start with moderate encoding quality and allow a bounded reduction in quality or dimensions to reach the byte cap. Validate the actual output format, dimensions, animation flag and bytes before storage. Enforce input byte and pixel limits even when legacy source metadata is incomplete. The detail and focal-point preview uses the original.

The stored object is independent of tile styling, focal point, publication state and admin session. Grid, list, picker and editor summaries read the same WebP, and CSS determines presentation. Keep the stored-thumbnail operation keyed by media identity and recipe inside the media service. It supplies bytes, format and dimensions to an authorized caller. A later Astro change can authorize published media at its own boundary and downsample this same WebP for the inlined blurred background, without reading the original for that purpose. This session exposes the admin route and produces one stored size.

### Generate after upload and recover on demand

`application` defines a narrow thumbnail generation port using the existing portable binary boundary. `server` composes it, and `platform-node` and `platform-cloudflare` wire the adapters. Node uses its existing Sharp/libvips dependency with auto-orientation and a single GIF display frame. Workers use the optional `IMAGES` binding with the private R2 byte stream, scale-down and static WebP output (`anim: false`). The Worker runtime uses a locally injected adapter for deterministic tests and the configured binding for provider acceptance. [Images binding](https://developers.cloudflare.com/images/optimization/binding/) · [First-frame option](https://developers.cloudflare.com/images/optimization/features/#anim)

Schedule a best-effort background attempt after the original write and confirmed metadata commit. Pass only the media ID across the scheduling boundary. The Worker uses request-lifetime background execution and Node uses bounded process work. Accessing the newly uploaded item and accessing an older item share the same read-or-create service. A lost or failed background attempt leaves a valid original and a missing derivative. The next authorized request can create it. Upload confirmation waits on the existing original and metadata writes.

Use the existing private bucket with a dedicated prefix such as `media-thumbnails/v1/<mediaId>.webp`. The original key remains the source for generation. Reuse the stored bytes across requests and process or Worker restarts. Store them through a narrow derivative storage capability with a create-if-absent write. Use the content digest for a representation-specific HTTP validator. Keep the recipe version in the private storage identity so a later recipe can be adopted explicitly. The media row needs no derivative field. HTTP validators still apply at the browser boundary.

Bound queue depth, transform parallelism and elapsed time for upload and on-demand work together. Admit a normal 24-item page of missing fixture thumbnails. Coalesce same-key work in one runtime where practical. Keep Worker streams and binding I/O in the owning request, and let bounded waiters re-read the persisted result. Concurrent workers may both reach conversion, but conditional insertion gives them one stored winner and the same bytes. A timed-out put can be reconciled by reading the deterministic key. Release capacity on settlement or confirmed cancellation, and surface only sanitized reasons for provider failure, overload and limits.

Persistent storage avoids repeating transforms for installations opened at long intervals. The cost is one small object per media item and cleanup attached to the media lifecycle. Lazy recovery covers existing media and interrupted background attempts without an upload migration or a mandatory backfill.

### Delete the derivative with its original

Extend the existing durable media deletion dispatcher. Once an item enters `deleting`, new thumbnail work is refused. Delete the derivative and the original idempotently before finalizing metadata deletion. Delete the thumbnail first so a thumbnail storage failure uses the existing retry path while the original is still available to the dispatcher. An absent derivative counts as success, including for older images and providers without thumbnail support.

Recheck authoritative active status before committing a derivative and after the write. If the item became inactive, attempt to remove the derivative and return the established ineligible result. Protect the crash and ambiguous-timeout window with a periodic, bounded, resumable scan of the derivative prefix. Remove objects for which authoritative metadata confirms an absent or inactive owner. SQL errors or uncertain results defer cleanup. Persist scan progress so later maintenance passes can visit the entire prefix. This also cleans derivatives left by deletion on a temporarily rolled-back release. Keep the maintenance path limited to derived keys and reuse runtime scheduling. Valid active derivatives have no expiry.

### Append 24 items by explicit cursor

Set one shared 24-item page size in the admin list query for the library and picker. Include the size in query identity and keep continuation depth local to each browsing session. A fresh library visit, a picker opening and an effective query change each start with the first page, even if another session loaded additional pages. Keep the existing admin media invalidation prefix. The API's default and other clients' page sizes stay as specified. Grid and list switch the presentation of the same pages. Suppress continuation against placeholder results. Keep the picker's active-only filtering and retained selection, including when one server page has zero eligible choices and still has a cursor.

Center the emphasized **Load more media** button beneath the items. Use a text loading state and a decorative downward indicator on the ready button. Keep the count in a polite status. A successful continuation announces the number added and the new count. If focus remains on the trigger, reveal the first appended item by focusing it. If a final continuation removes the trigger and adds nothing, put focus on the results status. Preserve focus if the user has moved. Keep the current results on failure and expose a retry on the same cursor.

The existing opaque cursor supports sequential append directly. Numbered navigation would need page indexes or a history of opaque cursors and extra policy for result changes. Automatic scroll fetching would make the browser start loading successive batches during a long scan. The explicit button lets readers choose when to continue and keeps all loaded results accessible for comparison and selection.

## Risks / Trade-offs

- **First access to old media takes longer** → serve metadata independently and bound conversion. Verify separate runs with missing derivatives and with a fresh runtime reading stored derivatives.
- **A derivative write overlaps deletion or loses acknowledgment** → keep inactive media ineligible, retry deletion idempotently, and reconcile late objects with the bounded scan.
- **Worker binding unavailable, limited or returning pass-through output** → keep the Worker and its original media reads usable. The codec bounds reject unchanged or animated output. Document the binding setup and provider account limits. Cloudflare documents AVIF input as Enterprise and dimensions or animation limits can also affect eligible originals. Verify JPEG, PNG and representative heavy GIF fixtures through a real binding. Unsupported files show a placeholder and retain their original preview. [Provider limits](https://developers.cloudflare.com/images/get-started/limits/) · [Pricing](https://developers.cloudflare.com/images/pricing/)
- **A local or simulated binding differs from production** → run an authorized provider check on an isolated deployment with a real binding. Exercise both visible first-frame differences and a multi-frame GIF at representative portfolio dimensions. Check the offline stub separately and record measured provider results.
- **Wire savings do not measure responsiveness** → compare the same populated fixture and viewport before and after in Chromium. Record image bytes and counts, and inspect the same scroll and click sequence. The hard first-batch payload bound is 24 × 96 KiB, or 2.25 MiB of thumbnail bodies. Measure cold and warm separately and report trace timings as observations.

## Migration Plan

1. Ship the thumbnail route and its admin consumer together in the normal packaged Node and Worker release.
2. On an existing Worker, the operator adds `"images": { "binding": "IMAGES" }` to the user-owned Wrangler configuration and deploys the matching release. Document this as part of Cloudflare setup, with the equivalent instruction for fresh projects. Node uses its existing runtime dependencies.
3. Open the library to generate missing thumbnails for existing active media. Derivatives are reconstructible from the existing media backups, and adoption needs no SQL or original-object migration. Roll back by deploying the earlier matched server and admin. Any retained derivatives remain private and can be reused or reconciled after a later upgrade.
