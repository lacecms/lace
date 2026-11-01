---
title: Import content
description: Load pages, posts and images from another site with lace import.
---

`lace import` loads a portable **import package** into a running Lace installation: a directory with `lace-import.json` and the image files it names. Use it to move an existing site, or to load content that a script produced. The command talks to your installation's admin API, so it works the same against the Node runtime and a Cloudflare Worker, and every write goes through the same validation as the admin.

Import creates and updates drafts, uploads images and can publish. It never deletes or unpublishes anything, never touches users or settings, and is safe to run again: a second run of the same package changes nothing.

## Before you start

- Run the command from your generated project root, where `lace.config.ts` lives. The package is checked against those models, and the server must run the same models and versions (run configuration sync first).
- Use the same Lace release for the CLI and the server.
- Start the API: `http://127.0.0.1:3000` for the Node runtime by default, or `http://127.0.0.1:8787` for the local Worker (`pnpm cf:dev`). Remote installations need HTTPS.

## Import a package

1. In Admin, open **Settings → Import tokens** and create a token. Choose a name and a lifetime of 1 to 7 days. Allow publishing only if you will use `--publish`; that choice exists only for administrators who can publish. Copy the token: it is shown once.
2. Put the token into your shell session only. Never write it to `.env`, a script or source control:

   ```bash
   read -rs LACE_IMPORT_TOKEN && export LACE_IMPORT_TOKEN
   ```

3. Check the package offline. This needs no token and no running API:

   ```bash
   pnpm exec lace import ./import --validate-only --publish
   ```

4. Review the plan against the server. A dry run reads only:

   ```bash
   pnpm exec lace import ./import --url http://127.0.0.1:3000 --publish --dry-run
   ```

5. Import:

   ```bash
   pnpm exec lace import ./import --url http://127.0.0.1:3000 --publish
   ```

6. Revoke the token in Settings when you are done, or let it expire. Published content reaches the site with its next build, as with any publication.

Without `--publish` import only saves drafts, which you can review and publish in Admin. The origin can also come from `LACE_API_BASE_URL`.

| Option            | Effect                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `--validate-only` | Check the package against `lace.config.ts`; no token or network. Add `--publish` to also apply publication rules (required fields). |
| `--dry-run`       | Read the server and print the plan; write nothing.                                                                                  |
| `--publish`       | Publish every entry whose `publish` is not `false`, link targets first.                                                             |
| `--overwrite`     | Replace drafts that someone edited after the last import (otherwise a conflict).                                                    |
| `--state <path>`  | State file; default `lace-import.state.json` inside the package directory.                                                          |
| `--json`          | Print one JSON result object instead of text.                                                                                       |

## The plan, reruns and conflicts

Every check runs before the first write; if anything is wrong, nothing is written. The plan lists each image as `upload`, `update` or `unchanged` and each entry as `create`, `update`, `unchanged` or `conflict`, followed by the publication order.

- Images are matched by their content (SHA-256), so a rerun never uploads a file twice. When the library already holds the same file, the alt text, caption, focal point and tags that the package gives replace the library values.
- Pages and globals are matched by model; collection entries by model and slug.
- An entry is `unchanged` when its saved draft already equals the package. Unchanged entries are not saved again, and published entries that equal their draft are not republished.

Run the same command again after fixing the package or after an interruption: finished work is recognized as unchanged, and the rest continues.

The state file remembers which draft revision each import wrote. If an editor changed an imported draft after that, the plan reports a `conflict`, the command exits with code 2 and writes nothing. Review the edit in Admin; rerun with `--overwrite` to replace it with the package version. Keep the state file next to the package and out of source control. If it is lost, import still finds everything by hash, model and slug, but cannot tell an editor's change from an older import.

Exit codes: `0` success; `2` conflict; `3` usage; `4` invalid package, configuration mismatch or missing settings; `6` rejected token, rate limit or a failed request. Output never contains the token or file contents.

## Limits

- Images only: JPEG, PNG, GIF, WebP or AVIF, at most 10 MiB each. Video files are not imported; use a [video embed](../rich-text-media/#embed-a-video) block with a URL.
- Uploads are limited to 30 per minute per user. Import waits when the server asks it to (`Retry-After`, at most 300 seconds per wait), so large packages take a while.
- Block data must use each block's current version. Settings-only media and rich-text internal links cannot be imported.
- At most 5,000 images and 5,000 entries per package; split larger sites into several packages.
- Import never deletes entries or images that a package no longer lists.

## Package format

`lace-import.json` (format version 1) has three top-level properties:

| Property        | Content                                |
| --------------- | -------------------------------------- |
| `formatVersion` | Always `1`.                            |
| `media`         | Images to upload.                      |
| `entries`       | Pages, globals and collection entries. |

A `$schema` property is allowed for editor support. The JSON Schema ships with the CLI as `@lacecms/cli/lace-import.schema.json`; it describes structure only, while the command also checks your models.

Every item has a `key`: 1 to 128 letters, digits, dots, underscores or hyphens, starting with a letter or digit, unique within `media` and within `entries`. Keys connect references and the state file, so keep them stable between runs.

**Media items**

| Field        | Rules                                                                                 |
| ------------ | ------------------------------------------------------------------------------------- |
| `key`        | Required.                                                                             |
| `file`       | Required. A relative path inside the package directory.                               |
| `alt`        | Optional alt text.                                                                    |
| `caption`    | Optional caption.                                                                     |
| `focalPoint` | Optional `{"x": 0–1, "y": 0–1}`.                                                      |
| `tags`       | Optional media-library tags: ASCII letters, digits and hyphens, at most 20 per image. |

**Entries**

| Field     | Rules                                                                                   |
| --------- | --------------------------------------------------------------------------------------- |
| `key`     | Required.                                                                               |
| `model`   | Required. A model key from `lace.config.ts`.                                            |
| `slug`    | Required for collection entries; not allowed for pages and globals.                     |
| `title`   | Required for pages and collection entries; not allowed for globals.                     |
| `fields`  | Required object of the model's field values (use `{}` when empty).                      |
| `blocks`  | Required array of blocks the model allows.                                              |
| `seo`     | Optional, for models with SEO: `title`, `description`, `image`, `canonical`, `noindex`. |
| `publish` | Optional; `false` keeps the entry as a draft under `--publish`. Default `true`.         |

Each page and each global appears at most once, and each collection slug once per model. Pages and globals already exist after configuration sync; import updates them.

**Blocks** are `{"type": "...", "data": {...}}` with optional `settings`, `anchor`, `className`, `hidden` and `key`. Positions follow the array order. A block without a `key` gets `b1`, `b2`, … from its position, so keep block order stable or set explicit keys. Field values use the same shapes as the admin API: plain strings, numbers and booleans, rich text as a document object, groups as objects and lists as arrays.

**References** connect items inside the package:

- `{"$media": "<media key>"}` in a media field, a nested media field (for example a gallery image) or `seo.image` becomes that image.
- `{"$entry": "<entry key>"}` in a URL field becomes an internal link to that page or collection entry, which follows slug changes. Globals cannot be link targets.

A reference anywhere else is an error. With `--publish`, a published entry may link only to entries that are published too; import publishes link targets first and reports cycles.

## Sample package

[Download `lace-import.json`](/lace/examples/content-import/lace-import.json) and its images [`studio.jpg`](/lace/examples/content-import/media/studio.jpg) and [`workshop.jpg`](/lace/examples/content-import/media/workshop.jpg) into an `import/media/` layout. The sample fits the starter project's models: it fills site settings and navigation, the Home page and two linked posts.

```json title="lace-import.json"
{
  "formatVersion": 1,
  "media": [
    {
      "key": "studio",
      "file": "media/studio.jpg",
      "alt": "A bright studio with an empty canvas and a lamp",
      "focalPoint": { "x": 0.68, "y": 0.4 },
      "tags": ["sample", "studio"]
    },
    {
      "key": "workshop",
      "file": "media/workshop.jpg",
      "alt": "A workbench with simple wooden shapes",
      "caption": "The workshop bench",
      "tags": ["sample"]
    }
  ],
  "entries": [
    {
      "key": "settings",
      "model": "settings",
      "fields": {
        "siteName": "Sample Studio",
        "tagline": "Imported with lace import",
        "description": "A small sample site loaded from a Lace import package.",
        "image": { "$media": "studio" }
      },
      "blocks": []
    },
    {
      "key": "navigation",
      "model": "navigation",
      "fields": {},
      "blocks": [
        {
          "type": "navigation",
          "data": {
            "name": "Main",
            "links": [
              { "label": "Journal", "url": { "$entry": "hello-lace" } },
              { "label": "First project", "url": { "$entry": "first-project" } }
            ]
          }
        }
      ]
    },
    {
      "key": "home",
      "model": "home",
      "title": "Home",
      "fields": {},
      "blocks": [
        {
          "type": "hero",
          "data": {
            "eyebrow": "Sample Studio",
            "heading": "Objects, rooms and quiet light",
            "image": { "$media": "studio" },
            "primaryActionLabel": "Read the journal",
            "primaryActionUrl": { "$entry": "hello-lace" }
          }
        },
        {
          "type": "richText",
          "data": {
            "content": {
              "type": "doc",
              "content": [
                {
                  "type": "paragraph",
                  "content": [
                    {
                      "type": "text",
                      "text": "This page, its images and the journal were imported from one package."
                    }
                  ]
                }
              ]
            }
          }
        },
        {
          "type": "gallery",
          "data": {
            "title": "From the studio",
            "images": [{ "media": { "$media": "studio" } }, { "media": { "$media": "workshop" } }]
          }
        }
      ],
      "seo": {
        "title": "Sample Studio",
        "description": "Objects, rooms and quiet light.",
        "image": { "$media": "studio" }
      }
    },
    {
      "key": "hello-lace",
      "model": "posts",
      "slug": "hello-lace",
      "title": "Hello, Lace",
      "fields": {
        "summary": "Why this studio moved its site to Lace.",
        "relatedUrl": { "$entry": "first-project" }
      },
      "blocks": [
        {
          "type": "richText",
          "data": {
            "content": {
              "type": "doc",
              "content": [
                {
                  "type": "paragraph",
                  "content": [
                    {
                      "type": "text",
                      "text": "Every page now lives in a CMS and builds into a static site."
                    }
                  ]
                }
              ]
            }
          }
        }
      ]
    },
    {
      "key": "first-project",
      "model": "posts",
      "slug": "first-project",
      "title": "First project",
      "fields": { "summary": "A workbench, three shapes and one afternoon." },
      "blocks": [
        {
          "type": "image",
          "data": { "media": { "$media": "workshop" }, "caption": "Work in progress" },
          "settings": { "lightbox": true }
        }
      ]
    }
  ]
}
```

Importing the sample into a project with existing content replaces the Home page, site settings and navigation drafts. Try it on a fresh local project first.

## Write a converter

A converter is a script, in any language, that reads your old site and writes a package directory. Lace does not need to know the source system.

1. **Model first.** Define pages, collections, globals and blocks in `lace.config.ts` for the content you want to keep, sync the configuration, and decide how each source page type maps to a model and each section to a block. Simple sources often map well to a collection with a few fields and a rich-text block.
2. **Choose stable keys.** Derive keys from something that does not change between exports, such as the old URL slug or record ID (`post-hello-lace`, `media-hero-2023`). Stable keys and stable block order make reruns update the same items instead of creating new ones.
3. **Collect images.** Download each image once into the package, for example `media/<key>.jpg`, and refer to it with `{"$media": "<key>"}` wherever it is used. Add alt text: imported images are only as accessible as their metadata.
4. **Convert text.** Produce rich text as document objects (paragraphs, headings, lists, links, bold and italic). Do not embed raw HTML. Replace links to your own pages with `{"$entry": "<key>"}` in URL fields.
5. **Validate and iterate.** Run `--validate-only --publish` after every converter change; errors name the exact JSON position, such as `/entries/12/blocks/3/data/images/0/media`. Then run a `--dry-run` against a local installation and look at the result in Admin and on the built site.
6. **Import for real.** Import into the target installation, rerun to confirm the plan is all `unchanged`, and keep the package and state file until the old site is retired.

See [CLI and environment](../../reference/cli-environment/) for the other commands.
