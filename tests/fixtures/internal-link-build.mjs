import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
const workspace = fileURLToPath(new URL("../../", import.meta.url));

/** Real static Astro build of successive exports from either live HTTP runtime. */
export async function internalLinkBuildContract(journey, expect) {
  const directory = await mkdtemp(join(tmpdir(), "lace-internal-link-build-"));
  try {
    await symlink(join(workspace, "apps/site/node_modules"), join(directory, "node_modules"));
    await mkdir(join(directory, "src/pages"), { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ type: "module", scripts: { build: "astro build" } }),
    );
    await writeFile(join(directory, "astro.config.mjs"), 'export default {output:"static"};\n');
    await writeFile(join(directory, "src/scenarios.json"), JSON.stringify(journey.scenarios));
    const pagePath = join(directory, "src/pages/[scenario].astro");
    const page = `---
import scenarios from "../scenarios.json";
import { createPublishedSiteLoader } from "@lacecms/sdk";
import { defineBlockMap } from "@lacecms/render";
import { builtInBlocks } from "@lacecms/content";
import LaceBlocks from "@lacecms/astro/LaceBlocks.astro";
import CtaBlock from "../components/CtaBlock.astro";
export const getStaticPaths = () => scenarios.map((scenario) => ({params:{scenario:scenario.name},props:scenario}));
const {exported,sourceId} = Astro.props;
let requests = 0;
const site = await createPublishedSiteLoader({baseUrl:"https://cms.test",token:"fixture",fetch:async()=>{
  if (++requests > 1) throw new Error("Per-link I/O is forbidden");
  return Response.json(exported,{headers:{etag: '"'+exported.version+'"'}});
}})();
const entry = site.allEntries().find((entry)=>entry.id===sourceId);
const blocks = defineBlockMap({cta:{definition:builtInBlocks.cta,component:CtaBlock}});
---
<html lang="en"><head><meta charset="utf-8"/><title>Links</title></head><body><main><LaceBlocks blocks={blocks} entry={entry} mediaUrl={site.mediaUrl}/></main></body></html>`;
    await mkdir(join(directory, "src/components"));
    await writeFile(
      join(directory, "src/components/CtaBlock.astro"),
      await readFile(join(workspace, "registry/astro/cta/CtaBlock.astro")),
    );
    await writeFile(pagePath, page);
    const build = () =>
      execute("pnpm", ["run", "build"], {
        cwd: directory,
        env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
      });
    await build();
    for (const scenario of journey.scenarios) {
      const html = await readFile(join(directory, "dist", scenario.name, "index.html"), "utf8");
      expect(html).not.toMatch(/href=["'][^"']*entry:/u);
      expect(html).not.toContain("DRAFT PRIVATE");
      if (scenario.href === null) {
        expect(html).toContain('<span data-lace-part="label">Open</span>');
        expect(html).not.toContain("<a ");
      } else expect(html).toContain(`href="${scenario.href}"`);
    }
    // A failed site build cannot roll back already committed publication.
    await writeFile(
      pagePath,
      page.replace(
        "const {exported,sourceId}",
        'throw new Error("Injected site build failure");\nconst {exported,sourceId}',
      ),
    );
    await expect(build()).rejects.toThrow();
    await journey.assertPublication();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
