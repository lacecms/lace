import { createInterface } from "node:readline";
import { normalizeSitePath, SITE_MODES } from "../site/modes.js";
import type { SiteMode, SiteSelection } from "../site/modes.js";

export interface Prompter {
  readonly ask: (question: string) => Promise<string | undefined>;
  readonly close: () => void;
}

/** Line-buffered prompts; lines that arrive before a question are kept. */
export function createPrompter(
  input: NodeJS.ReadableStream,
  output: Pick<NodeJS.WriteStream, "write">,
): Prompter {
  const lines = createInterface({ input, terminal: false, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  return {
    ask: async (question) => {
      output.write(question);
      const next = await iterator.next();
      return next.done === true ? undefined : next.value;
    },
    close: () => lines.close(),
  };
}

const ATTEMPTS = 3;

/**
 * Asks for the site mode and, for an existing site, its path. Returns undefined
 * after three invalid answers or at end of input.
 */
export async function promptSite(
  prompter: Prompter,
  output: Pick<NodeJS.WriteStream, "write">,
  detected: boolean,
): Promise<SiteSelection | undefined> {
  const fallback = detected ? "2" : "1";
  output.write(
    `Site mode${detected ? " (an Astro project was detected in the parent directory)" : ""}:\n` +
      "  1) starter   generate an example Astro site in site/\n" +
      "  2) existing  connect an existing Astro site outside this project\n" +
      "  3) none      CMS only, no site\n",
  );
  let mode: SiteMode | undefined;
  for (let attempt = 0; attempt < ATTEMPTS && mode === undefined; attempt++) {
    const answer = await prompter.ask(`Choose 1-3 [${fallback}]: `);
    if (answer === undefined) return undefined;
    const value = answer.trim().toLowerCase() || fallback;
    mode = ({ "1": "starter", "2": "existing", "3": "none" } as Record<string, SiteMode>)[value];
    mode ??= SITE_MODES.find((name) => name === value);
    if (mode === undefined) output.write("Enter 1, 2 or 3.\n");
  }
  if (mode === undefined) return undefined;
  if (mode !== "existing") return { mode };
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const answer = await prompter.ask("Existing Astro site path, relative to the project [..]: ");
    if (answer === undefined) return undefined;
    const path = normalizeSitePath(answer.trim() || "..");
    if (path !== undefined) return { mode, path };
    output.write('Enter a relative path such as "..".\n');
  }
  return undefined;
}
