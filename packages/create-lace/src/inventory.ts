import type { RenderKind } from "./render.js";
import type { SiteMode } from "./site.js";

export type FileOwner = "managed" | "user";

export interface TemplateFile {
  readonly path: string;
  readonly owner: FileOwner;
  readonly cloudflare?: true;
  readonly interpolateName?: true;
  /** Site modes that receive this file; default: every mode. */
  readonly modes?: readonly SiteMode[];
  /** Site-mode transform applied after name interpolation. */
  readonly render?: RenderKind;
  /** Reserved .lace metadata is delivered but never enters the upgrade file inventory. */
  readonly metadata?: true;
}

export const TEMPLATE_VERSION = "0.15.0";

const STARTER = ["starter"] as const;
const SITE = ["starter", "existing"] as const;

/** Every bundled template must appear here with an explicit ownership decision. */
export const TEMPLATE_FILES: readonly TemplateFile[] = [
  { path: ".lace/upgrade-instructions.json", owner: "managed", metadata: true },
  { path: "README.md", owner: "user", render: "markers" },
  { path: ".env.example", owner: "managed", render: "markers" },
  { path: ".gitignore", owner: "managed" },
  {
    path: ".github/workflows/cloudflare.yml",
    owner: "managed",
    cloudflare: true,
    modes: SITE,
    render: "markers",
  },
  { path: "docker-compose.yml", owner: "managed", render: "markers" },
  { path: "deploy/minio.Dockerfile", owner: "managed" },
  { path: "deploy/nginx.conf", owner: "managed" },
  { path: "docs/lace-astro-site.md", owner: "managed" },
  { path: "docs/cloudflare-operator.env.example", owner: "managed", cloudflare: true },
  { path: "docs/lace-operations.md", owner: "managed", render: "markers" },
  { path: "lace.config.ts", owner: "user" },
  { path: "package.json", owner: "managed", interpolateName: true, render: "root-package" },
  { path: "pnpm-workspace.yaml", owner: "managed", render: "workspace" },
  { path: "site/astro.config.mjs", owner: "user", modes: STARTER },
  { path: "site/lace.site.json", owner: "user", modes: STARTER },
  { path: "site/package.json", owner: "user", interpolateName: true, modes: STARTER },
  { path: "site/src/components/lace/CtaBlock.astro", owner: "user", modes: STARTER },
  { path: "site/src/components/lace/HeroBlock.astro", owner: "user", modes: STARTER },
  { path: "site/src/components/lace/ImageBlock.astro", owner: "user", modes: STARTER },
  { path: "site/src/components/lace/QuoteBlock.astro", owner: "user", modes: STARTER },
  { path: "site/src/components/lace/RichTextBlock.astro", owner: "user", modes: STARTER },
  { path: "site/src/env.d.ts", owner: "user", modes: STARTER },
  { path: "site/src/lace/blocks.ts", owner: "user", modes: STARTER },
  { path: "site/src/layouts/BaseLayout.astro", owner: "user", modes: STARTER },
  { path: "site/src/lib/lace.ts", owner: "user", modes: STARTER },
  { path: "site/src/pages/index.astro", owner: "user", modes: STARTER },
  { path: "site/src/pages/blog/[slug].astro", owner: "user", modes: STARTER },
  { path: "site/src/styles/global.css", owner: "user", modes: STARTER },
  { path: "site/tsconfig.json", owner: "user", modes: STARTER },
  { path: "worker/.dev.vars.example", owner: "managed", cloudflare: true },
  { path: "worker/index.ts", owner: "managed", cloudflare: true },
  // Holds operator resource IDs and origins, so upgrades never change it.
  {
    path: "worker/wrangler.jsonc",
    owner: "user",
    cloudflare: true,
    interpolateName: true,
    render: "markers",
  },
];
