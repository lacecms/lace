import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { generateProject, runCli } from "../dist/index.js";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A parent Astro project with its own README, so existing-site mode has an outer root. */
async function parent() {
  const root = await mkdtemp(join(tmpdir(), "lace-scenario-guides-"));
  roots.push(root);
  await mkdir(join(root, "src/pages"), { recursive: true });
  await writeFile(join(root, "astro.config.mjs"), "export default {};\n");
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "existing", private: true, dependencies: { astro: "7.3.1" } })}\n`,
  );
  await writeFile(join(root, "README.md"), "# Outer site\r\nKeep these bytes.\n");
  return root;
}

const VARIANTS = [
  ["starter", { mode: "starter" }, false],
  ["starter-cloudflare", { mode: "starter" }, true],
  ["existing", { mode: "existing", path: ".." }, false],
  ["existing-cloudflare", { mode: "existing", path: ".." }, true],
  ["none", { mode: "none" }, false],
  ["none-cloudflare", { mode: "none" }, true],
];

const GUIDES = ["docs/lace-compose-dev.md", "docs/lace-compose-production.md"];

/** GitHub-style heading anchors of every heading level. */
function anchors(markdown) {
  return [...markdown.matchAll(/^#{1,6} (.+)$/gmu)].map((match) =>
    match[1]
      .toLowerCase()
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .replaceAll(" ", "-"),
  );
}

function fencedLines(markdown) {
  return [...markdown.matchAll(/```bash\n([\s\S]*?)\n```/gu)].flatMap((match) =>
    match[1].split("\n"),
  );
}

/** Fails with the guide and step when `steps` do not appear in order in its fenced commands. */
function expectOrder(name, markdown, steps) {
  const fenced = `${fencedLines(markdown).join("\n")}\n`;
  let from = 0;
  for (const step of steps) {
    const at = fenced.indexOf(step, from);
    expect(at, `${name}: "${step}" missing or out of order`).toBeGreaterThanOrEqual(0);
    from = at + step.length;
  }
}

test.each(VARIANTS)(
  "%s: scenario guides exist, links resolve and commands name real scripts",
  async (name, site, cloudflare) => {
    const outer = await parent();
    const project = await generateProject({ target: join(outer, "cms"), site, cloudflare });
    const expected = cloudflare ? [...GUIDES, "docs/lace-cloudflare.md"] : GUIDES;
    for (const guide of [...GUIDES, "docs/lace-cloudflare.md"])
      expect(project.manifest.files[guide], `${name}: ${guide}`).toEqual(
        expected.includes(guide) ? { owner: "managed", sha256: expect.any(String) } : undefined,
      );
    const { scripts } = JSON.parse(await readFile(join(project.path, "package.json"), "utf8"));
    const documents = [
      "README.md",
      ...(await readdir(join(project.path, "docs")))
        .filter((file) => file.endsWith(".md"))
        .map((file) => `docs/${file}`),
    ];
    for (const document of documents) {
      const text = await readFile(join(project.path, document), "utf8");
      for (const [, link] of text.matchAll(/\]\(([^)\s]+)\)/gu)) {
        if (/^[a-z]+:/u.test(link)) continue;
        const [path, fragment] = link.split("#");
        const file = path
          ? join(project.path, dirname(document), path)
          : join(project.path, document);
        expect(
          (await stat(file).catch(() => undefined))?.isFile(),
          `${name}: ${document} -> ${link}`,
        ).toBe(true);
        if (fragment)
          expect(
            anchors(await readFile(file, "utf8")),
            `${name}: ${document} -> ${link}`,
          ).toContain(fragment);
      }
      for (const line of fencedLines(text)) {
        const [tool, command] = line.split(" ");
        if (tool !== "pnpm" || ["install", "exec", "create", "--dir"].includes(command)) continue;
        expect(scripts, `${name}: ${document} runs "${line}"`).toHaveProperty(command);
      }
      expect(text, `${name}: ${document}`).not.toMatch(/>=24\.12\.0 <25|>=12 <13/u);
    }

    const development = await readFile(join(project.path, GUIDES[0]), "utf8");
    const production = await readFile(join(project.path, GUIDES[1]), "utf8");
    for (const [guide, text] of [
      [GUIDES[0], development],
      [GUIDES[1], production],
    ]) {
      expect(text, `${name}: ${guide}`).toContain(
        {
          starter: "Site mode: **starter**",
          existing: "Site mode: **existing site** at `..`",
          none: "Site mode: **none**",
        }[site.mode],
      );
      for (const part of [
        "**Working directory:**",
        "**Result:**",
        "## Prerequisites",
        "## Recovery",
        "## Next steps",
      ])
        expect(text, `${name}: ${guide}`).toContain(part);
      expect(text.indexOf("only while those services are stopped")).toBeLessThan(
        text.indexOf("```bash\npnpm exec lace doctor"),
      );
    }
    const setup = [
      "pnpm install",
      "pnpm env:prepare",
      "pnpm exec lace doctor --target node --mode compose --stage setup",
      "pnpm db:migrate",
      "pnpm content:sync",
      "pnpm auth:bootstrap",
      "pnpm dev:api",
    ];
    expectOrder(`${name}: development`, development, [
      ...setup,
      ...(site.mode === "none" ? [] : ["pnpm dev\n", "pnpm build\n"]),
      "docker compose stop api dispatcher",
      "pnpm content:sync",
      "pnpm dev:api",
    ]);
    expectOrder(`${name}: production`, production, [
      ...setup,
      "pnpm prod:start",
      "docker compose ps",
      "docker compose stop api dispatcher",
      "pnpm db:migrate",
      "pnpm prod:start",
    ]);
    // Doctor's ready stage cannot inspect the running WAL database; the guide must not run it there.
    expect(production).not.toContain("--mode compose --stage ready");
    if (site.mode === "existing") {
      expect(development).toContain("pnpm exec lace add block --all --site ..");
      expect(development).toContain("**existing site** at `..`");
      expect(production).toContain("`..`");
    }
    if (site.mode !== "starter")
      for (const text of [development, production]) expect(text).not.toMatch(/`site\/src/u);
    if (site.mode === "none") {
      expect(development).toContain("builds no site");
      expect(production).not.toContain("builder mounts");
    }

    if (cloudflare) {
      const guide = await readFile(join(project.path, "docs/lace-cloudflare.md"), "utf8");
      expectOrder(`${name}: cloudflare`, guide, [
        "pnpm install",
        "pnpm env:prepare",
        "pnpm cf:env:prepare",
        "pnpm cf:db:migrate",
        "pnpm cf:content:sync",
        "pnpm cf:auth:bootstrap",
        "pnpm cf:dev",
        "unset CLOUDFLARE_API_TOKEN",
        "pnpm exec wrangler login",
        "pnpm exec lace cloudflare preflight --target cloudflare-remote --wrangler-auth oauth --operator-env .lace/cloudflare-operator.env",
        "pnpm exec wrangler whoami --account <account-id> --config worker/wrangler.jsonc",
      ]);
      const remote = [
        "lace cloudflare preflight",
        "pnpm exec lace db migrate --target cloudflare-remote --operator-env .lace/cloudflare-operator.env",
        "pnpm exec lace content sync --target cloudflare-remote --operator-env .lace/cloudflare-operator.env",
        "pnpm exec wrangler deploy --config worker/wrangler.jsonc",
        "pnpm exec lace auth bootstrap --target cloudflare-remote --operator-env .lace/cloudflare-operator.env",
      ];
      let from = 0;
      for (const step of remote) {
        const at = guide.indexOf(step, from);
        expect(at, `${name}: cloudflare "${step}"`).toBeGreaterThan(-1);
        from = at;
      }
      // The operator token never goes into files Wrangler loads implicitly.
      expect(guide).not.toMatch(/CLOUDFLARE_API_TOKEN=\S/u);
      expect(guide).toContain("never in `.env` or `.env.local`");
      expect(guide).toContain("separate deployments");
      expect(guide.indexOf("## Run the Worker locally")).toBeLessThan(
        guide.indexOf("## Move to your Cloudflare account"),
      );
      expect(guide.includes("## Deploy the static site separately")).toBe(site.mode !== "none");
      if (site.mode !== "none") expect(guide).toContain("**Accepted**, which never proves");
    }
    // Nothing outside the CMS directory changes, including the outer README.
    expect(await readFile(join(outer, "README.md"), "utf8")).toBe(
      "# Outer site\r\nKeep these bytes.\n",
    );
  },
);

test.each([false, true])(
  "completion output names the scenario guides for a retained README (cloudflare=%s)",
  async (cloudflare) => {
    const outer = await parent();
    const target = join(outer, "cms");
    await mkdir(target);
    await writeFile(join(target, "README.md"), "existing\n");
    const output = [];
    expect(
      await runCli(
        ["init", ".", "--starter", ...(cloudflare ? ["--cloudflare"] : [])],
        target,
        { write: (value) => output.push(value) },
        { write: () => {} },
      ),
    ).toBe(0);
    const text = output.join("");
    for (const guide of [...GUIDES, "docs/lace-operations.md"]) expect(text).toContain(guide);
    expect(text.includes("docs/lace-cloudflare.md")).toBe(cloudflare);
    expect(text).toContain("Preserved existing README.md");
    expect(await readFile(join(target, "README.md"), "utf8")).toBe("existing\n");
  },
);

test("existing-site generation from the site's CMS directory never rewrites the site README", async () => {
  const outer = await parent();
  const output = [];
  expect(
    await runCli(
      ["create", "cms", "--existing-site", ".."],
      outer,
      { write: (value) => output.push(value) },
      { write: () => {} },
      { interactive: false },
    ),
  ).toBe(0);
  expect(await readFile(join(outer, "README.md"), "utf8")).toBe(
    "# Outer site\r\nKeep these bytes.\n",
  );
  expect(output.join("")).toContain("docs/lace-compose-dev.md");
  expect(await readFile(join(outer, "cms/README.md"), "utf8")).toContain(
    "](docs/lace-compose-dev.md)",
  );
});
