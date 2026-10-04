# create-lace

The Lace project generator. It creates editable Astro site source and typed content configuration without copying CMS engine or admin source into the project.

```bash
pnpm create lace my-site
# Equivalent executable form:
create-lace create my-site
```

To initialize an existing otherwise empty repository, run `create-lace init .` from its root. Only `.git`, `README.md`, and `LICENSE` may already exist. Add `--cloudflare` to either command to include a Cloudflare Pages config and manual deployment workflow. The Cloudflare option does not deploy the CMS Worker.

Choose at most one site mode: `--starter` generates the example Astro site in `site/`; `--existing-site <path>` generates no `site/` and connects an existing Astro project at a relative path outside the target (typically `create-lace cms --existing-site ..` from the site root; the path must reach `astro.config.*` and an `astro` dependency without symbolic links, and the site is never modified); `--no-site` generates the CMS only and cannot be combined with `--cloudflare`. Without a flag, an interactive terminal asks for the mode (defaulting to an existing site at `..` when the parent directory is an Astro project); without a terminal the starter is generated. Root scripts, the workspace file, `.env.example`, Compose, Cloudflare files, README and the operations guide are rendered for the selected mode, and `.lace/manifest.json` records it as `site: { mode, path }`.

The generated root `README.md`, `site/**` files and `lace.config.ts` belong to the project owner. Edit them to define models and design the public site. `init .` preserves any allowed existing README byte-for-byte, records it as user-owned without a digest, and prints an explicit fallback to `docs/lace-operations.md`; manually incorporate relevant setup text into your existing README if desired. A project generated in `cms/` gets its README and operations guide there. The root workspace files, `.env.example`, Docker Compose, operations guide and optional Cloudflare files are managed. `.lace/manifest.json` records the template version, site mode, file ownership, and SHA-256 of each managed file. It contains no credentials and does not hash itself. `lace upgrade` uses these digests to detect local edits and preserves user-owned README/source.

Start with the generated `README.md` and follow `docs/lace-operations.md` for detailed operation: install, `pnpm env:prepare`, setup-stage doctor, explicit migration/sync, bootstrap and browser setup at the configured API origin `/admin/`, login, build-token creation, publication and Astro build. Browser setup requires `0.1.0-alpha.2` or later compatible API/admin artifacts. The original `0.1.0-alpha.1` release predates the browser flow; both guides retain the same short placeholder-only `POST /api/v1/setup/admin` curl alternative, and the operations guide also provides private terminal input to avoid inline credentials in shell history. Tokens expire after one hour, passwords require at least 12 characters, interrupted setup resumes with the same token/email, and completed setup stays closed. Preparation creates a protected `.env` with random local service credentials, leaves the build token empty and refuses to overwrite existing configuration. Other operator scripts load the root `.env`. The site includes user-owned renderers for all five built-in blocks, safe rich text and stable `data-lace-*` selectors, reading one authenticated published export per build. The Compose builder uses an internal API URL for exports and your browser-facing public URL for media, and builds generated `site/` source by default, or the existing site in existing-site mode; no-site projects have no builder.

This generator creates ownership template `0.14.0` with exact `0.1.0-alpha.2` package and image coordinates (`pnpm create lace@0.1.0-alpha.2`, npm channel `next`). Its quickstart, environment preparation, doctor, browser setup, tour, existing-site mode and Cloudflare Worker need these or later compatible artifacts; published `0.1.0-alpha.1` artifacts are not retroactively updated. The coordinates become downloadable only after owner publication; repository acceptance uses the exact locally prepared artifacts, and registry availability is not implied. The generator itself requires no network or credentials. Configuration changes still use guarded sync; adding a model or custom block requires site-owned routes/renderers, and incompatible structural changes to populated models need deliberate migration planning. A real Cloudflare account deployment and a real VPS installation remain unverified release-gate work.

Generation stages a complete tree beside the target. For an existing allowed directory, it briefly moves that directory to a sibling `.lace-backup-*` path and restores it if publication fails. If a filesystem error prevents cleanup or restoration, the command prints the exact staging or backup path. Inspect that path, move the backup to the original target if necessary, and remove leftover staging files only after confirming the target is intact.

For repository development:

```bash
pnpm --filter create-lace test
node packages/create-lace/dist/bin.js create /tmp/my-site
node scripts/generated-project-acceptance.mjs all
```
