---
title: Choose a deployment
description: Compare the two supported runtimes, Docker/VPS and Cloudflare, before deploying the CMS and the site.
kind: overview
verifiedAgainst: 0.1.0-rc2
---

Lace has two supported infrastructure paths with the same CMS behavior. Both keep the CMS with Admin and the public Astro site as distinct deployments: the public site normally serves static files and does not call the CMS on every request.

| Path                      | CMS and persistence               | Site builds                                                        |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| [Docker/VPS](node/)       | Node API and Admin, SQLite, MinIO | Private builder and static web proxy, or your own pipeline         |
| [Cloudflare](cloudflare/) | Worker, D1, R2, optional KV cache | Separate Pages or static deployment; optional deploy hook tracking |

Keep Admin and the authenticated API on one origin. In production use HTTPS, persistent storage, a tested coordinated backup of database and media, and a public URL that matches your reverse proxy. A working local simulation does not establish a working deployment on your real server or account.

After deploying, [operate and recover](../operations/) the installation, optionally [connect AI assistants](../operations/mcp/), and look up every setting in [CLI and environment](../reference/cli-environment/).
