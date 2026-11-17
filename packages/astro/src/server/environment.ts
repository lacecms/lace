interface ServerGlobals {
  readonly document?: unknown;
  readonly process?: { readonly env?: Readonly<Record<string, string | undefined>> };
  readonly window?: unknown;
}

const runtime = globalThis as ServerGlobals;
export function assertServerOnly(): void {
  if (runtime.window !== undefined || runtime.document !== undefined) {
    throw new Error(
      "@lacecms/astro is server-only: import it from Astro frontmatter or server modules, never from client scripts.",
    );
  }
}

export const environment = runtime.process?.env ?? {};
