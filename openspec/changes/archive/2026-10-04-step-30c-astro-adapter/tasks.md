## 1. Astro adapter package

- [x] 1.1 Create `packages/astro` (`@lacecms/astro`): package manifest with `exports` for the root module and the two public components, `files`, `astro` peer dependency, `astro-component` keyword, tsconfig, and lint/test scripts.
- [x] 1.2 Implement `createAstroSiteLoader` with env default, `dev` revalidation, `fetch`, `hints`, and the browser-evaluation guard; export the rich-text override types.
- [x] 1.3 Implement `LaceBlocks.astro`, `RichText.astro`, and the internal recursive `RichTextNodes.astro` (overrides, void `br`, no `set:html`).
- [x] 1.4 Add unit tests for the loader glue: static single read, dev ETag revalidation, env default, hints, token absence in errors, browser guard.
- [x] 1.5 Add `@lacecms/astro` to `release/alpha.json`, the release-model order test, and `docs/alpha-release.md`.

## 2. Boundaries

- [x] 2.1 Extend `scripts/check-boundaries.mjs`: `.astro` frontmatter scanning, package subpath normalization, `astro -> render, sdk` edges and external allowlist, adapter re-export rejection, `app-site -> astro, render, sdk, content`.
- [x] 2.2 Add boundary fixtures and tests for adapter-imports-content, adapter re-export, and the reference-site adapter subpath import.

## 3. Registry and site formats

- [x] 3.1 Capture the pre-migration `apps/site` fixture build as the markup baseline.
- [x] 3.2 Create `registry/registry.json` and `registry/astro/<type>/{item.json,<Name>Block.astro}` for the five built-in blocks consuming `BlockProps` and `<RichText>` with unchanged markup.
- [x] 3.3 Add `tests/block-sources.test.mjs` validating registry manifests, every site's `lace.site.json`, recorded hashes, in-root paths, and byte parity with the registry.

## 4. Reference site migration

- [x] 4.1 Update `apps/site` dependencies, regex aliases, and tsconfig types.
- [x] 4.2 Add `src/lib/lace.ts` (fixture/live modes, hints), `src/lace/blocks.ts`, `lace.site.json`, and `src/components/lace/*`; rewrite layout and the home, blog, about, and notes pages on the loader view and `<LaceBlocks>`.
- [x] 4.3 Delete `lib/site-data.ts`, `lib/rendering.ts`, `lib/rich-text.ts`, their tests, `BlockRenderer.astro`, `RichText*.astro`, and the old block components.
- [x] 4.4 Verify the fixture build is byte-identical to the baseline; extend `fixture-build.test.mjs` with a full-output secret scan.

## 5. Generated starter

- [x] 5.1 Rewrite `packages/create-lace/templates/site/` with the same loader, map, lock, components, layout, and pages (home and posts only), hints naming the project's commands, and the four Lace package dependencies.
- [x] 5.2 Advance `TEMPLATE_VERSION` to `0.9.0` and update `TEMPLATE_FILES`.
- [x] 5.3 Update the generated README and operations guide; add the managed `docs/lace-astro-site.md` connection guide.
- [x] 5.4 Write `0.9.0` upgrade instructions with the manual site migration steps, keeping earlier instructions.
- [x] 5.5 Update `onboarding.test.mjs` (adapter loader behavior in the generated site, block-source identity with `apps/site`, build with all five blocks, unknown-block and unsafe-link failures, full-output secret scan), `index.test.mjs`, and the CLI upgrade tests for `0.9.0`.
- [x] 5.6 Regenerate and review the byte-stable generated-project snapshots.

## 6. Existing-site guide verification

- [x] 6.1 Create the independent Astro fixture `tests/fixtures/existing-astro-site/` following the guide, with its own layout and routes, a link override, and hook-based styles.
- [x] 6.2 Add `tests/existing-astro-site.test.mjs` building the fixture against a served export and checking blocks, override, media URLs, and secret absence.

## 7. Packed starter in CI

- [x] 7.1 Add the `starter` phase to `scripts/generated-project-acceptance.mjs` and the root `acceptance:starter` script.
- [x] 7.2 Run the CI step after `pnpm build` in `.github/workflows/ci.yml`; run the phase locally.

## 8. Documentation and verification

- [x] 8.1 Update root `README.md`, `apps/site/README.md`, `docs/node-api.md`, `docs/site-styling.md`, `docs/personal-site-guide.md`, and the roadmap 30C completion note.
- [x] 8.2 Run the narrow package and site tests, root typecheck, lint (with boundaries), `oxfmt --check`, the root tests, and `openspec validate step-30c-astro-adapter --type change --strict`.
