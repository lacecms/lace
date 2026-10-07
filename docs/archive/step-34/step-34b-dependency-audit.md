# 34B locked dependency audit — remediation pending

Recorded 2026-10-07. This is an incomplete audit disposition record, not a security acceptance. `pnpm audit --json` completed with 19 advisory records: 2 critical, 7 high, 7 moderate and 3 low. No advisory was suppressed. Exact paths, versions, URLs and the lockfile SHA-256 are recorded in `step-34b-dependency-audit.json`.

Commands: `pnpm audit --json`, `pnpm licenses list --json`, and read-only npm version metadata for the six proposed patched targets. pnpm 12.3.4 / Node 24.12.0. The advisory command's nonzero vulnerability result is expected; it is not converted to success. Registry advisory metadata was retrieved successfully. Cross-checks used upstream GitHub advisories for sharp's libheif/librsvg and tinypool's run-options findings. The data is a time-bounded snapshot and must be refreshed after remediation and before publication.

## Findings and proposed disposition

| Advisory | Locked package/version | Severity | Proposed action |
| --- | --- | --- | --- |
| [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | esbuild 0.18.20 | moderate | Restricted tooling risk proposed; not accepted yet |
| [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | sharp 0.35.2 | high | Update to 0.35.5 |
| [GHSA-3wwx-pv8p-q78v](https://github.com/advisories/GHSA-3wwx-pv8p-q78v) | undici 7.29.0 | moderate | Update to 7.29.1 |
| [GHSA-pmjh-fq2x-6v4x](https://github.com/advisories/GHSA-pmjh-fq2x-6v4x) | undici 7.29.0 | moderate | Update to 7.29.1 |
| [GHSA-r53p-7pc4-xj5r](https://github.com/advisories/GHSA-r53p-7pc4-xj5r) | undici 7.29.0 | low | Update to 7.29.1 |
| [GHSA-rfgv-xxqx-mfg5](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5) | undici 7.29.0 | high | Update to 7.29.1 |
| [GHSA-3xpg-4rpp-hhhm](https://github.com/advisories/GHSA-3xpg-4rpp-hhhm) | undici 7.29.0 | moderate | Update to 7.29.1 |
| [GHSA-2jfj-6hjv-fm6j](https://github.com/advisories/GHSA-2jfj-6hjv-fm6j) | undici 7.29.0 | moderate | Update to 7.29.1 |
| [GHSA-2gqq-gqf2-x968](https://github.com/advisories/GHSA-2gqq-gqf2-x968) | undici 7.29.0 | low | Update to 7.29.1 |
| [GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3) | undici 7.29.0 | high | Update to 7.29.1 |
| [GHSA-8436-99hf-9mmv](https://github.com/advisories/GHSA-8436-99hf-9mmv) | undici 7.29.0 | low | Update to 7.29.1 |
| [GHSA-rx4f-c7p8-82vq](https://github.com/advisories/GHSA-rx4f-c7p8-82vq) | undici 7.29.0 | moderate | Update to 7.29.1 |
| [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) | http-cache-semantics 4.2.0 | high | Update to 4.3.0 |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | braces 3.0.3 | high | Restricted tooling risk proposed; not accepted yet |
| [GHSA-r4xh-jqrq-34v2](https://github.com/advisories/GHSA-r4xh-jqrq-34v2) | smol-toml 1.8.0 | moderate | Update to 1.9.0 |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | source-map-js 1.2.1 | high | Update to 1.2.2 |
| [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) | tinypool 2.1.0 | critical | Update to 2.1.2 |
| [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) | tinypool 2.1.0 | critical | Update to 2.1.2 |
| [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | sharp 0.35.2, 0.35.4 | high | Update to 0.35.5 |

## Reachability and artifact classification

| Family | Source/runtime reachability | Shipped exposure / action |
| --- | --- | --- |
| sharp 0.35.4 | Direct Node runtime dependency; authenticated upload inspection. Shared complete-container validation excludes SVG before sharp, reducing reachability of the librsvg defect, but this is not a reason to retain a vulnerable binary. Astro also resolves this version. | API production dependency and generated Astro dependency graph; update to 0.35.5 and recheck all image formats / both-platform images. |
| sharp 0.35.2 | Miniflare dependency, including local CLI D1 maintenance tooling; distinct older version affected by libheif and librsvg findings. | CLI production dependency graph includes Miniflare; narrowly override Miniflare's sharp and test local Worker/CLI paths. Not treated as absent merely because it is development infrastructure. |
| undici 7.29.0 | Miniflare HTTP/cache/WebSocket implementation. Ten advisory records cover different features; not all are exercised by CMS requests. | Reaches CLI graph through Miniflare; patch to 7.29.1 rather than assuming unused paths are safe. |
| tinypool 2.1.0 | Oxfmt transitive tooling. Two prototype-pollution-to-RCE gadgets; root formatter does not intentionally accept worker/run options from unauthenticated CMS users. | Build tooling, not a direct CMS request dependency; patch to 2.1.2 and rerun formatting/tooling checks. |
| http-cache-semantics 4.2.0 | Astro build/dev graph; caching vulnerability depends on private/shared cache use. | Generated site/build graph; patch 4.3.0 and repeat site acceptance. |
| smol-toml 1.8.0 | Astro parser; untrusted large TOML can exhaust resources. | Generated site/build graph; patch 1.9.0 and repeat builds. |
| source-map-js 1.2.1 | Vite/PostCSS/css-tree/Astro and Vitest graphs. Malicious indexed source maps can exhaust the event loop. | Build/test tooling and generated site dependencies; patch 1.2.2 and repeat builds/tests. |
| esbuild 0.18.20 | Legacy esm-loader via drizzle-kit (including Better Auth peer closure). The finding requires the esbuild development server; Lace's fixed build uses Astro and does not start that server. | Proposed restricted tooling risk: never expose/start that legacy development server; review on loader/drizzle-kit upgrade or any change that invokes it. Peer closure could be packaged: exact artifact reachability still requires inspection. Upgrading across the loader's old esbuild range without compatibility evidence is not proposed. |
| braces 3.0.3 | OpenSpec CLI -> fast-glob -> micromatch; repository-controlled patterns, not CMS content/API input. Audit reports no patched release. | Proposed restricted tooling risk: use trusted local specs/globs only; review when upstream patch exists or workflow accepts untrusted patterns. No claim that dependency is safe for arbitrary input. |

All dispositions above are **proposals**, not hidden accepted exceptions. Dependency edits require the active plan update. Exact refreshed artifact dependency reachability is still pending under task 6.3; root graph classification does not prove binary/archive inclusion or exclusion.

## License metadata coverage

`pnpm licenses list` covers the installed host subset. To avoid missing cross-platform optional binaries, all `packages` entries in the repository lockfile (including the separate pnpm-manager document) were enumerated; installed package license metadata was reused and missing platform-package metadata was read from exact npm name/version endpoints. **875 distinct locked package/version records, zero missing license metadata**. Every record identifies its source. This records manifest license identifiers, not a completed legal review or a bundled-native-library source audit.

Identifiers: MIT, MIT-0, Apache-2.0, MIT OR Apache-2.0, Apache-2.0 AND LGPL-3.0-or-later, Apache-2.0 AND LGPL-3.0-or-later AND MIT, LGPL-3.0-or-later, MPL-2.0, OFL-1.1, Python-2.0, ISC, BSD-2-Clause, BSD-3-Clause, BlueOak-1.0.0, CC0-1.0, Unlicense and 0BSD.

MPL packages include axe-core/testing and lightningcss tooling. OFL identifies the distributed Inter font. LGPL and combined expressions identify sharp-libvips platform binaries. Preserve dependency LICENSE/NOTICE files and verify attribution/source/relinking obligations for native binaries and font notices before declaring artifact license acceptance. Permissive metadata also requires notice retention; a manifest identifier alone is not proof of fulfilled distribution obligations. No unknown identifier was found, but task 5.3 remains pending until findings are dispositioned and distribution evidence is checked.

## Confirmed remediation and rerun

The owner approved `/private/tmp/lace-34b-dependency-plan.diff`; it was applied before dependency edits. The catalog now requires sharp ^0.35.5; narrow overrides correct Miniflare and Astro's separate sharp copies, undici, tinypool, http-cache-semantics, smol-toml and source-map-js. No unrelated dependency families were intentionally upgraded. The pinned pnpm install succeeded. A second pass caught the remaining Astro sharp 0.35.4 and a narrow resolution corrected it too.

The final reproducible audit (`node scripts/dependency-audit.mjs --output ...`) reports **two advisory records**, esbuild moderate and braces high; **zero critical, zero undispositioned advisories, 848 locked license records and zero missing/unknown manifest licenses**. The confirmed restricted tooling dispositions and review triggers are now accepted for this local gate. The initial 19 findings remain recorded above and in the original JSON; no advisory was suppressed. See `step-34b-dependency-audit-remediated.json` for final tool/data timestamps, lock identity, exact paths and per-package licenses.

Affected image/CLI/Astro/use-case suites passed **314 tests across 33 files**. The complete 34B runner reruns actual Worker/R2, Node/MinIO, static build and budget scenarios after these resolution changes. Audit checks fail on unavailable metadata, empty license data, unknown licenses or any new undispositioned advisory.

Distribution evidence: admin builds now retain installed dependency LICENSE/COPYING/NOTICE/OFL texts and sharp-libvips component licensing READMEs in `third-party-notices.txt` alongside bundled JS/fonts. The notice identifies unmodified dynamically loaded/replacement-capable sharp/libvips and exact upstream source/build recipe versions. API images copy that complete admin directory; the Cloudflare package copies the same assets. Original dependency directories retain their own notices. This includes tooling notices deliberately and does not imply all listed code is runtime-reachable. Exact package/image presence and native-library notice/source references are checked again under task 6.3 before candidate acceptance. Registry publication remains outside this local audit.

Final clean-revision runner rerun: 2026-10-07T19:24:10.199Z, source `70ab0d7e7e15952da94886d6144b95f69240e2a5`, same lock SHA-256 `16f28c3a4f46ef074d0604319a9fe2d2db86485bdeea8d61bee084befe224ccc`, two dispositioned advisories and 848 license records. The remediated JSON contains this latest raw snapshot. Exact r3 API image inspection on both platforms found neither legacy esbuild 0.18.20 nor OpenSpec braces 3.0.3 directories in the deployed pnpm store; aggregate admin notices still intentionally include tooling attribution. This presence check does not turn their workspace risks into zero-vulnerability claims.
