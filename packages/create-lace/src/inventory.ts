export type FileOwner = "managed" | "user";

export interface TemplateFile {
  readonly path: string;
  readonly owner: FileOwner;
  readonly cloudflare?: true;
  readonly interpolateName?: true;
  /** Reserved .lace metadata is delivered but never enters the upgrade file inventory. */
  readonly metadata?: true;
}

export const TEMPLATE_VERSION = "0.10.0";

/** Every bundled template must appear here with an explicit ownership decision. */
export const TEMPLATE_FILES: readonly TemplateFile[] = [
  { path: ".lace/upgrade-instructions.json", owner: "managed", metadata: true },
  { path: "README.md", owner: "user" },
  { path: ".env.example", owner: "managed" },
  { path: ".gitignore", owner: "managed" },
  { path: ".github/workflows/cloudflare.yml", owner: "managed", cloudflare: true },
  { path: "docker-compose.yml", owner: "managed" },
  { path: "deploy/minio.Dockerfile", owner: "managed" },
  { path: "deploy/nginx.conf", owner: "managed" },
  { path: "docs/lace-astro-site.md", owner: "managed" },
  { path: "docs/lace-operations.md", owner: "managed" },
  { path: "lace.config.ts", owner: "user" },
  { path: "package.json", owner: "managed", interpolateName: true },
  { path: "pnpm-workspace.yaml", owner: "managed" },
  { path: "site/astro.config.mjs", owner: "user" },
  { path: "site/lace.site.json", owner: "user" },
  { path: "site/package.json", owner: "user", interpolateName: true },
  { path: "site/src/components/lace/CtaBlock.astro", owner: "user" },
  { path: "site/src/components/lace/HeroBlock.astro", owner: "user" },
  { path: "site/src/components/lace/ImageBlock.astro", owner: "user" },
  { path: "site/src/components/lace/QuoteBlock.astro", owner: "user" },
  { path: "site/src/components/lace/RichTextBlock.astro", owner: "user" },
  { path: "site/src/env.d.ts", owner: "user" },
  { path: "site/src/lace/blocks.ts", owner: "user" },
  { path: "site/src/layouts/BaseLayout.astro", owner: "user" },
  { path: "site/src/lib/lace.ts", owner: "user" },
  { path: "site/src/pages/index.astro", owner: "user" },
  { path: "site/src/pages/blog/[slug].astro", owner: "user" },
  { path: "site/src/styles/global.css", owner: "user" },
  { path: "site/tsconfig.json", owner: "user" },
  { path: "wrangler.jsonc", owner: "managed", cloudflare: true, interpolateName: true },
];
