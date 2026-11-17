## MODIFIED Requirements

### Requirement: The Astro adapter stays a thin framework binding
The dependency-boundary verification SHALL scan the frontmatter of `.astro` components as well as TypeScript sources and SHALL resolve package subpath imports to their package. It SHALL permit the Astro adapter to import only the render core, the SDK, `astro` and its `astro:` virtual modules, Node builtins through the `node:` scheme, its own modules, and `parse5` only within its server-only preview HTML transformation module; it SHALL reject Node builtins imported without the `node:` scheme, SHALL reject adapter re-exports of any Lace package, and SHALL permit the reference site to import only the adapter, render core, SDK, and content packages among Lace packages.

#### Scenario: Adapter imports content directly
- **WHEN** an adapter source or component imports `@lacecms/content`
- **THEN** the dependency-boundary verification fails and names the forbidden import

#### Scenario: Adapter re-exports the render core
- **WHEN** an adapter module contains `export { defineBlockMap } from "@lacecms/render"`
- **THEN** the dependency-boundary verification fails and names the re-export

#### Scenario: Reference site component imports the adapter subpath
- **WHEN** a reference-site `.astro` component imports `@lacecms/astro/LaceBlocks.astro`
- **THEN** the import counts as the permitted `app-site -> astro` edge

#### Scenario: Adapter uses the image pipeline and a build cache
- **WHEN** an adapter component imports `astro:assets` and an adapter module imports `node:fs/promises`
- **THEN** the dependency-boundary verification accepts both imports

#### Scenario: Adapter imports a bare Node builtin
- **WHEN** an adapter module imports `fs/promises`
- **THEN** the dependency-boundary verification fails and names the forbidden import

#### Scenario: Preview HTML parsing is isolated
- **WHEN** the server-only preview HTML transformation module imports `parse5`
- **THEN** the boundary check accepts it, while the same dependency in an Astro component or other adapter module is rejected
