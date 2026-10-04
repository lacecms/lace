import { createPublishedSiteLoader } from "@lacecms/sdk";
import type {
  LaceFetch,
  PublishedSiteEnvironment,
  PublishedSiteErrorCode,
  PublishedSiteLoader,
} from "@lacecms/sdk";
import type { RichTextElementDescription, RichTextSource } from "@lacecms/render";

interface ServerGlobals {
  readonly document?: unknown;
  readonly process?: { readonly env?: PublishedSiteEnvironment };
  readonly window?: unknown;
}

const runtime = globalThis as ServerGlobals;

// The loader reads LACE_BUILD_TOKEN; refuse to exist in a client bundle.
if (runtime.window !== undefined || runtime.document !== undefined) {
  throw new Error(
    "@lacecms/astro is server-only: import it from Astro frontmatter or server modules, never from client scripts.",
  );
}

export interface AstroSiteLoaderOptions {
  /** Defaults to `process.env`; sites pass `{ ...import.meta.env, ...process.env }`. */
  readonly env?: PublishedSiteEnvironment;
  /** Revalidates the export on every call; pass `import.meta.env.DEV`. */
  readonly dev?: boolean;
  readonly fetch?: LaceFetch;
  /** Extra text appended to failures with the matching code, such as project commands. */
  readonly hints?: Readonly<Partial<Record<PublishedSiteErrorCode, string>>>;
}

/** Creates the server-only published-site loader for an Astro site. */
export function createAstroSiteLoader(options: AstroSiteLoaderOptions = {}): PublishedSiteLoader {
  return createPublishedSiteLoader({
    environment: options.env ?? runtime.process?.env ?? {},
    revalidate: options.dev === true,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.hints === undefined ? {} : { hints: options.hints }),
  });
}

/** Props an override component receives; its rendered children arrive in the default slot. */
export interface RichTextOverrideProps {
  readonly element: RichTextElementDescription;
}

/** An Astro component (or compatible function) that renders one rich-text element. */
export type RichTextOverride = (props: RichTextOverrideProps) => unknown;

/** Override components keyed by the originating rich-text node or mark name. */
export type RichTextComponents = Readonly<Partial<Record<RichTextSource, RichTextOverride>>>;
