---
title: Reference
description: Look up commands, settings, configuration options, REST endpoints and MCP tools by name.
kind: overview
verifiedAgainst: 0.1.0-rc2
---

The reference lists every item of the public interface of the documented release, one row per item. Use matching package versions; `pnpm exec lace --help` and the generated project's guides describe the release you installed.

- [CLI and environment](cli-environment/): every `lace` and `create-lace` command, flag and exit code, and every `LACE_*` setting with the runtime that reads it.
- [Configuration options](configuration/): every option of `defineConfig`, `definePage`, `defineCollection`, `defineGlobal` and `defineBlock`, and every field builder.
- [API reference](api/): the OpenAPI contract, every REST endpoint with its audience and required permission, collection queries and media tags.
- [MCP reference](mcp/): the optional MCP endpoint, OAuth discovery, scopes and tools.
