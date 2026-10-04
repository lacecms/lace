import { spawn } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { assertSecretFree } from "./consumer-security.mjs";

const observeOnly = process.env.LACE_VISIBILITY_OBSERVE === "1";

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts a long-running Astro dev process in its own process group. */
function startDev(name, cwd, args, env) {
  const child = spawn("pnpm", args, {
    cwd,
    detached: true,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (output = (output + chunk).slice(-8000)));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (output = (output + chunk).slice(-8000)));
  const exited = new Promise((resolve) => child.once("exit", resolve));
  return {
    name,
    output: () => output,
    async stop() {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* Already stopped. */
      }
      await Promise.race([exited, delay(10_000)]);
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* Already stopped. */
      }
    },
  };
}

async function page(base, path) {
  try {
    const response = await fetch(new URL(path, base), {
      headers: { "cache-control": "no-cache" },
      signal: AbortSignal.timeout(60_000),
    });
    return { status: response.status, headers: response.headers, html: await response.text() };
  } catch (error) {
    return { status: 0, headers: new Headers(), html: String(error) };
  }
}

async function waitReady(server, base) {
  const deadline = Date.now() + 3 * 60_000;
  while (Date.now() < deadline) {
    const result = await page(base, "/");
    if (result.status === 200) return;
    await delay(1000);
  }
  throw new Error(`${server.name}: dev server did not become ready\n${server.output()}`);
}

/**
 * Observes when published, draft-only and newly routed content becomes visible
 * in Astro dev, a manual static build and the automatic Compose release.
 */
export async function publicationVisibilityJourney(context, session, operations) {
  const { request, run, secretValues } = operations;
  const headers = { cookie: session.cookie };
  const publicBase = `http://127.0.0.1:${context.httpPort}/`;
  const observations = [];
  const failures = [];
  function observe(mode, step, fact, actual, expected) {
    observations.push({ mode, step, fact, actual, expected });
    if (expected !== undefined && JSON.stringify(actual) !== JSON.stringify(expected))
      failures.push(`${mode}/${step}/${fact}: expected ${expected}, observed ${actual}`);
  }

  const homeId = (await request(session.base, "/api/v1/admin/models/home/entries", { headers }))
    .body.items[0].id;
  async function saveDraft(entryId, title, slug) {
    const { body: entry } = await request(session.base, `/api/v1/admin/entries/${entryId}`, {
      headers,
    });
    const saved = await request(session.base, `/api/v1/admin/entries/${entryId}/draft`, {
      method: "PUT",
      headers,
      json: {
        blocks: entry.draft.blocks,
        expectedRevision: entry.draft.revision,
        fields: entry.draft.fields,
        ...((slug ?? entry.draft.slug) === undefined ? {} : { slug: slug ?? entry.draft.slug }),
        title,
      },
    });
    return saved.body.draft.revision;
  }
  async function publish(entryId, revision) {
    const result = await request(session.base, `/api/v1/admin/entries/${entryId}/publish`, {
      method: "POST",
      headers,
      json: { expectedRevision: revision },
    });
    return result.body.build;
  }
  async function builds() {
    return (await request(session.base, "/api/v1/admin/site-builds", { headers })).body.items;
  }

  // An independent existing site that reads the SDK in its own page code.
  const independent = join(context.parent, "independent-existing-site");
  await mkdir(join(independent, "src/pages/blog"), { recursive: true });
  await cp(
    join(context.project, ".lace/acceptance-packages"),
    join(independent, ".lace/acceptance-packages"),
    { recursive: true },
  );
  const workspaceYaml = await readFile(join(context.project, "pnpm-workspace.yaml"), "utf8");
  await writeFile(
    join(independent, "pnpm-workspace.yaml"),
    `allowBuilds:\n  esbuild: true\n${workspaceYaml.slice(workspaceYaml.indexOf("overrides:"))}\n`,
  );
  await writeFile(
    join(independent, "package.json"),
    JSON.stringify(
      {
        name: "independent-existing-site",
        private: true,
        type: "module",
        dependencies: {
          "@lacecms/sdk": `file:.lace/acceptance-packages/${context.sdkTarball}`,
          astro: "7.3.1",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(independent, "src/export.ts"),
    `import { createLaceClient } from "@lacecms/sdk";

export async function publishedEntries() {
  const client = createLaceClient({
    baseUrl: process.env.LACE_API_BASE_URL!,
    token: process.env.LACE_BUILD_TOKEN!,
  });
  const result = await client.getBuildExport();
  if (!result.changed) throw new TypeError("Expected an export.");
  return result.export.entries.filter((item) => item.entry.published !== undefined);
}
`,
  );
  await writeFile(
    join(independent, "src/pages/index.astro"),
    `---
import { publishedEntries } from "../export.js";
const entries = await publishedEntries();
const home = entries.find((item) => item.path === "/");
---
<html><head><title>{home?.entry.published?.title}</title></head><body>
<ul>{entries.map((item) => <li><a href={item.path}>{item.entry.published?.title}</a></li>)}</ul>
</body></html>
`,
  );
  await writeFile(
    join(independent, "src/pages/blog/[slug].astro"),
    `---
import { publishedEntries } from "../../export.js";
export async function getStaticPaths() {
  return (await publishedEntries())
    .filter((item) => item.entry.model.key === "posts")
    .map((item) => ({ params: { slug: item.entry.published?.slug }, props: { item } }));
}
const { item } = Astro.props;
---
<html><head><title>{item.entry.published?.title}</title></head><body></body></html>
`,
  );
  await run("independent-site-install", "pnpm", ["install", "--no-frozen-lockfile"], {
    cwd: independent,
  });

  const devEnvironment = {
    // Keep Astro in the foreground; agent detection would otherwise detach it.
    ASTRO_DEV_BACKGROUND: "1",
    ASTRO_TELEMETRY_DISABLED: "1",
    LACE_API_BASE_URL: session.base,
    LACE_PUBLIC_BASE_URL: session.base,
    LACE_BUILD_TOKEN: session.buildToken,
  };
  const servers = [];
  async function startServers() {
    const generatedPort = await freePort();
    const independentPort = await freePort();
    const generated = startDev(
      "generated-dev",
      context.project,
      ["dev", "--host", "127.0.0.1", "--port", String(generatedPort), "--ignore-lock"],
      devEnvironment,
    );
    const existing = startDev(
      "independent-dev",
      independent,
      [
        "exec",
        "astro",
        "dev",
        "--host",
        "127.0.0.1",
        "--port",
        String(independentPort),
        "--ignore-lock",
      ],
      devEnvironment,
    );
    servers.push(generated, existing);
    const result = [
      { mode: "generated-dev", server: generated, base: `http://127.0.0.1:${generatedPort}/` },
      { mode: "independent-dev", server: existing, base: `http://127.0.0.1:${independentPort}/` },
    ];
    for (const item of result) await waitReady(item.server, item.base);
    return result;
  }
  async function stopServers() {
    for (const server of servers.splice(0)) await server.stop();
  }

  async function staticBuild() {
    await run("visibility-static-build", "pnpm", ["build"], {
      cwd: context.project,
      env: devEnvironment,
    });
  }
  async function staticHtml(path) {
    try {
      return await readFile(join(context.project, "site/dist", path, "index.html"), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return "";
      throw error;
    }
  }
  async function servedAfterBuild(step, targetVersion, path, marker) {
    const transitions = [];
    const deadline = Date.now() + 12 * 60_000;
    let served;
    while (Date.now() < deadline) {
      // Coalesced requests target the latest published version, never an older one.
      const covering = (await builds()).filter((item) => item.targetVersion >= targetVersion);
      const build =
        covering.find((item) => item.status === "succeeded") ??
        covering.find((item) => item.status !== "failed") ??
        covering[0];
      served = await page(publicBase, path);
      const sample = `${build?.status ?? "absent"}:${served.html.includes(marker) ? "new" : "old"}`;
      if (transitions.at(-1) !== sample) transitions.push(sample);
      if (served.html.includes(marker) && build === undefined)
        failures.push(`compose/${step}: new content served without a covering build`);
      if (build?.status === "failed") break;
      if (build?.status === "succeeded" && served.html.includes(marker)) break;
      await delay(250);
    }
    observe("compose", step, "transitions", transitions.join(" > "));
    // VPS builds stay pending while the synchronous builder runs; success is recorded after the switch.
    observe(
      "compose",
      step,
      "served before success was recorded",
      transitions.some((sample) => sample.endsWith(":new") && !sample.startsWith("succeeded")),
    );
    observe("compose", step, "served after succeeded build", served.html.includes(marker), true);
    observe("compose", step, "cache-control", served.headers.get("cache-control"), "no-cache");
    observe("compose", step, "etag present", served.headers.has("etag"));
    observe("compose", step, "last-modified present", served.headers.has("last-modified"));
    assertSecretFree(served.html, secretValues, `compose ${step} HTML`);
  }

  try {
    let dev = await startServers();
    for (const { mode, base } of dev) {
      const home = await page(base, "/");
      const post = await page(base, "/blog/acceptance");
      observe(mode, "baseline", "home status", home.status, 200);
      observe(
        mode,
        "baseline",
        "post shows published title",
        post.html.includes("Published acceptance title"),
        true,
      );
      assertSecretFree(home.html + post.html, secretValues, `${mode} baseline HTML`);
    }

    // 1. Publish changed existing routes without restarting anything.
    const homeMarker = "VISIBILITY-HOME-PUBLISHED";
    const postMarker = "VISIBILITY-POST-PUBLISHED";
    await publish(homeId, await saveDraft(homeId, homeMarker));
    const postBuild = await publish(session.entryId, await saveDraft(session.entryId, postMarker));
    observe("cms", "publish", "build dispatch", postBuild.status, "queued");
    await delay(1500);
    for (const { mode, base } of dev) {
      observe(
        mode,
        "publish",
        "home updated on reload",
        (await page(base, "/")).html.includes(homeMarker),
        true,
      );
      // The independent page passes the entry through cached getStaticPaths props.
      observe(
        mode,
        "publish",
        "existing post updated on reload",
        (await page(base, "/blog/acceptance")).html.includes(postMarker),
        mode === "generated-dev",
      );
    }
    observe(
      "manual-static",
      "publish",
      "previous dist unchanged before build",
      (await staticHtml("blog/acceptance")).includes(postMarker),
      false,
    );
    await staticBuild();
    observe(
      "manual-static",
      "publish",
      "fresh build contains publication",
      (await staticHtml("blog/acceptance")).includes(postMarker),
      true,
    );
    await servedAfterBuild("publish", postBuild.targetVersion, "/blog/acceptance/", postMarker);

    // 2. A draft save never reaches published consumers or requests a build.
    const buildCount = (await builds()).length;
    const draftMarker = "VISIBILITY-DRAFT-ONLY";
    await saveDraft(session.entryId, draftMarker);
    await delay(3000);
    for (const { mode, base } of dev) {
      observe(
        mode,
        "draft-save",
        "draft hidden",
        !(await page(base, "/blog/acceptance")).html.includes(draftMarker),
        true,
      );
    }
    observe("compose", "draft-save", "no build requested", (await builds()).length, buildCount);
    await staticBuild();
    observe(
      "manual-static",
      "draft-save",
      "draft hidden after build",
      !(await staticHtml("blog/acceptance")).includes(draftMarker),
      true,
    );

    // 3. A newly published route changes the route set.
    const created = await request(session.base, "/api/v1/admin/models/posts/entries", {
      method: "POST",
      headers,
      json: {
        blocks: [],
        fields: { summary: "Visibility summary" },
        slug: "visibility-new",
        title: "VISIBILITY-NEW-ROUTE",
      },
    });
    const newBuild = await publish(created.body.id, created.body.draft.revision);
    await delay(1500);
    for (const { mode, base } of dev) {
      const result = await page(base, "/blog/visibility-new");
      // Astro dev caches getStaticPaths until restart or a source change.
      observe(mode, "new-route", "status without restart", result.status, 404);
    }
    await servedAfterBuild(
      "new-route",
      newBuild.targetVersion,
      "/blog/visibility-new/",
      "VISIBILITY-NEW-ROUTE",
    );

    // 4. Restarting dev observes the new route set.
    await stopServers();
    dev = await startServers();
    for (const { mode, base } of dev) {
      const result = await page(base, "/blog/visibility-new");
      observe(mode, "restart", "new route status", result.status, 200);
      observe(
        mode,
        "restart",
        "new route content",
        result.html.includes("VISIBILITY-NEW-ROUTE"),
        true,
      );
      assertSecretFree(result.html, secretValues, `${mode} restart HTML`);
    }

    // 5. A renamed slug leaves a cached dev route that must not show stale content.
    await publish(
      created.body.id,
      await saveDraft(created.body.id, "VISIBILITY-RENAMED-ROUTE", "visibility-renamed"),
    );
    await delay(1500);
    for (const { mode, base } of dev) {
      const result = await page(base, "/blog/visibility-new");
      observe(
        mode,
        "rename",
        "old slug status without restart",
        result.status,
        mode === "generated-dev" ? 404 : 200,
      );
    }
  } finally {
    await stopServers();
    console.info(`Publication visibility observations:\n${JSON.stringify(observations, null, 2)}`);
  }
  if (!observeOnly && failures.length > 0)
    throw new Error(`Publication visibility mismatch:\n${failures.join("\n")}`);
  return observations;
}
