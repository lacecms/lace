## Why

On the deployed Media page, the first 50 tiles loaded 50 originals, including six GIFs. Chrome measured one 6193 × 7741 image in a 136 px tile and estimated 121 MB of potential savings from optimized image delivery.

Admin visits can be separated by hours or by a Worker restart. The same stored thumbnail needs to be available on the next visit without another conversion.

## What Changes

- Store one small, static WebP per media item in the existing private R2 or S3-compatible bucket. Start generation in the background after a successful upload. For any item whose thumbnail is missing, generate and store it on the first authorized request.
- Clean up the thumbnail through the existing asynchronous media deletion lifecycle. Reconcile late writes from interrupted generation so they cannot leave persistent orphaned derivatives.
- Use the new thumbnails wherever the admin uses its shared thumbnail component, including the library grid and list, the picker and editor field summaries. Opening a library item continues to show its original through the authenticated detail preview, with animation for GIFs.
- Store the thumbnail as an uncropped, media-level derivative with a versioned recipe. A future Astro integration can use this same WebP as the source for an inline blurred background.
- Request 24 items at a time in the Media library and picker. Add a prominent, centered **Load more media** button below the results that appends the next batch, with loading, retry and accessible arrival feedback.
- Keep media browsable when a derivative is unavailable. Show the existing fallback and allow users to open the item and its original preview.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- [`admin-media-library`](../../../specs/admin-media-library/spec.md) — lightweight imagery, first-frame GIF thumbnails, original detail previews and explicit 24-item batches.
- [`admin-draft-editor-media-lists`](../../../specs/admin-draft-editor-media-lists/spec.md) — use the thumbnail endpoint for media-leaf summaries.
- [`media-use-cases`](../../../specs/media-use-cases/spec.md) — bounded derivative generation after upload and on demand, durable private storage, active-media eligibility and recoverable deletion.
- [`hono-app-factory`](../../../specs/hono-app-factory/spec.md) — add a session-only thumbnail route with representation-specific cache validators and recoverable failure.

## Impact

**Roadmap step and session unit:** MP1, Admin media performance, one owner-selected maintenance session outside EX1–EX7. The thumbnail service and 24-item batches share a single browser and payload acceptance check. The apply sequence starts by recording the session in the [roadmap](../../../../docs/extensibility-roadmap.md) and reconciling [architecture §§9, 12, 15 and 17](../../../../docs/architecture/README.md) with private derivatives.

The scope covers the CMS media lifecycle, its admin route, the Node and Worker composition, the shared admin thumbnail component and both browsing surfaces. Node uses the existing Sharp dependency. Workers use a Cloudflare Images binding that operators add to existing deployments. The design records the provider-specific fallback when the binding, plan or source limits prevent generation.

Astro integration, build or public delivery of derivatives, an additional 64 px file, numbered navigation, automatic infinite scroll and offline backfill are outside this session. Existing media IDs, database rows, object keys and original bytes are sufficient for adoption. The two admin surfaces request 24 items through the current REST paging contract.
