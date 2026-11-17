# Local verification

Run on 2026-11-17 with pnpm 12.3.4, Docker Engine 29.8.2 and Compose 5.5.0.
The container runs used Linux arm64 and local workspace builds. The pinned
registry manifest lists Linux amd64 and arm64.

| Check | Result |
| --- | --- |
| Repository and generated Compose | Repository development and VPS and all six generated variants selected the pinned SILO image for unset/empty settings and honored a full reference from dotenv. Storage command, health check, private network endpoint, initializer and volume were retained. Production published only Nginx. |
| Generator and published template | Source and packaged generator tests, six byte-stable snapshots and the packed `upgrade` journey passed. Both retained 0.49.0 variants replaced Compose, removed the unchanged legacy recipe, refused edits to it, preserved `.env`, user files and application data, and had no changes on repeat. Retained fixture files and hashes were unchanged. |
| Local Node deployments | `pnpm dev:smoke`, `pnpm test:vps` and the packed `build-site` journey passed. The packed development and production containers used prebuilt SILO, refused anonymous bucket access and delivered uploaded media through Lace. |
| Local storage, recovery and credentials | Operations and resilience verification projects passed (9 tests, Node/SILO and local Worker/R2). Compose database safety passed with the default and with an explicit locally cached image ID through `LACE_VERIFY_MINIO_IMAGE`. Focused cross-runtime media tags and import tests passed. |
| Physical MinIO volume transition | The exact prior MinIO commit seeded a disposable named volume. SILO preserved the existing image, accepted a new image, preserved both after restart and after an unavailable image blocked startup. Restoring the stopped media and SQLite archives and restarting the prior MinIO recovered the original image; the later write was absent. The run removed its project and backup volumes. |
| Quality gates | `pnpm docs:check`, focused generator, Compose, migration and internal documentation tests, root typecheck, lint, format check and strict change validation passed. |

Test media from volume `lace-storage-switch-a4a0756a6654_minio-data`:

| Written by | Lace media ID | Object key | SHA-256 |
| --- | --- | --- | --- |
| MinIO | `01M7KDXXGWRE4J5CN7VTR30VXK` | `media/01M7KDXXGWRE4J5CN7VTR30VXK` | `d504a38f4d1ab8d4bf89683a513f3fe5f6ce39f06f45b28dbae9a43c74146ff1` |
| SILO | `01M7KDYSTKPVHNK0DA2NTSVJ34` | `media/01M7KDYSTKPVHNK0DA2NTSVJ34` | `ea63915c18262d18e66051b1ee5bea19e9785fe01df6c53e081814d0b6fc0a43` |

The supplementary full cross-runtime product test timed out during the
browser accessibility check waiting for `networkidle` on the Node Content
page. Its Node API media and Astro steps had passed. The separate media-tag
and import cases in the same run passed on Node and the local Worker.

Real VPS deployment and restore, remote Cloudflare, amd64 runtime execution
and exact RC5 release artifact acceptance were not run. These results describe
local source and packed consumer verification only.
