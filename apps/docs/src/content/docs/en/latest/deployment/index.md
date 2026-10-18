---
title: Choose a deployment
description: Run the same CMS behavior on Node/VPS or Cloudflare.
---

Lace has two supported infrastructure paths. Both keep the CMS/admin and public Astro site as distinct surfaces: the public site normally serves static files and does not call the CMS on every request.

| Path                      | CMS and persistence            | Site builds                                                     |
| ------------------------- | ------------------------------ | --------------------------------------------------------------- |
| [Docker/VPS](node/)       | Node, SQLite, MinIO, API/admin | Private builder and static web proxy, or your manual pipeline   |
| [Cloudflare](cloudflare/) | Worker, D1, R2, optional KV    | Separate Pages/static deployment; optional deploy hook/tracking |

Keep Admin and authenticated API on the same origin. Use HTTPS in production, persistent storage, a tested coordinated backup and a public URL matching your reverse proxy. A working local simulation does not establish a working real account deployment.
