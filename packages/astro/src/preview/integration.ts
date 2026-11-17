import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AstroConfig, AstroIntegration } from "astro";
import { mediaOriginSetting, previewInputFile, readPreviewBuildInput } from "./build-input.js";
import { servePreviewOriginals } from "./originals.js";
import { renderOrigin } from "./urls.js";
import { singleRoutePrerenderer } from "./prerender.js";

export function assertPreviewAstroVersion(version: string): void {
  const patch = /^7\.4\.(\d+)$/u.exec(version)?.[1];
  if (patch === undefined || Number(patch) < 12)
    throw new Error(
      "PREVIEW_DEPENDENCY_FAILED: Astro preview supports Astro 7.4.12 and later 7.4 patches.",
    );
}

function astroVersion(config: AstroConfig): string {
  try {
    const { version } = createRequire(new URL("package.json", config.root))(
      "astro/package.json",
    ) as {
      readonly version: string;
    };
    return version;
  } catch {
    throw new Error(
      "PREVIEW_DEPENDENCY_FAILED: the selected site must have a local Astro installation.",
    );
  }
}

/** Inert without the runner's detached input file. */
export function lacePreview(): AstroIntegration {
  const file = previewInputFile();
  if (file === undefined) return { name: "lace:preview", hooks: {} };
  const input = readPreviewBuildInput(file);
  const outDir = pathToFileURL(join(dirname(file), "render") + "/");
  const prefix = `/p/${input.generationId}/`;
  let renders = 0;
  let media: Awaited<ReturnType<typeof servePreviewOriginals>> | undefined;
  return {
    name: "lace:preview",
    hooks: {
      "astro:config:setup": async ({ command, config, updateConfig }) => {
        assertPreviewAstroVersion(astroVersion(config));
        if (
          command !== "build" ||
          config.output !== "static" ||
          config.adapter !== undefined ||
          config.build.format !== "directory" ||
          config.build.assetsPrefix !== undefined ||
          config.i18n !== undefined ||
          config.experimental.incrementalBuild
        )
          throw new Error(
            "PREVIEW_CONFIGURATION_UNAVAILABLE: use a static directory build without an adapter, a CDN asset prefix, i18n routing or incremental builds.",
          );
        if (Object.keys(input.context.media).length + Object.keys(input.targetMedia).length > 0) {
          media = await servePreviewOriginals(file, input);
          process.env[mediaOriginSetting] = media.origin;
        }
        updateConfig({
          base: prefix,
          site: renderOrigin,
          trailingSlash: "always",
          outDir,
          cacheDir: pathToFileURL(join(dirname(file), "cache") + "/"),
          build: { redirects: false },
          ...(media === undefined
            ? {}
            : {
                image: {
                  remotePatterns: [
                    {
                      protocol: "http",
                      hostname: "127.0.0.1",
                      port: media.port,
                      pathname: "/_lace_preview_media/*",
                    },
                  ],
                },
              }),
        });
      },
      "astro:config:done": ({ config, buildOutput }) => {
        if (
          buildOutput !== "static" ||
          config.base !== prefix ||
          config.outDir.href !== outDir.href
        )
          throw new Error(
            "PREVIEW_CONFIGURATION_UNAVAILABLE: another Astro integration changed preview output settings.",
          );
      },
      "astro:build:start": ({ setPrerenderer }) => {
        setPrerenderer((base) =>
          singleRoutePrerenderer(base, input.target.path, prefix, () => {
            renders++;
          }),
        );
      },
      "astro:build:done": async ({ dir }) => {
        try {
          if (renders !== 1 || dir.href !== outDir.href)
            throw new Error(
              "PREVIEW_RENDER_FAILED: the configured Astro build must render exactly one preview page.",
            );
          const { finishPreviewRender } = await import("./render-output.js");
          await finishPreviewRender(dirname(file), input, media?.used ?? new Set());
        } finally {
          media?.close();
          delete process.env[mediaOriginSetting];
        }
      },
    },
  };
}
