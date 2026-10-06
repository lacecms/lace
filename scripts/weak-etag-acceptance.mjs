import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { gzipSync } from "node:zlib";

/**
 * A compressing reverse proxy for the build export, like a CDN that negotiates
 * gzip: a compressed `200` turns the API's strong `"N"` validator into weak
 * `W/"N"`, while `304` keeps the upstream validator. Every export request is
 * recorded; other paths pass through unchanged.
 */
export function compressingExportProxy(upstream) {
  const requests = [];
  const server = createServer(async (incoming, outgoing) => {
    try {
      const exportPath = incoming.url === "/api/v1/public/build-export";
      const condition = incoming.headers["if-none-match"];
      const response = await fetch(new URL(incoming.url ?? "/", upstream), {
        headers: {
          ...(incoming.headers.authorization === undefined
            ? {}
            : { authorization: incoming.headers.authorization }),
          ...(condition === undefined ? {} : { "if-none-match": condition }),
        },
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      const body = Buffer.from(await response.arrayBuffer());
      const etag = response.headers.get("etag");
      const gzip = /\bgzip\b/u.test(incoming.headers["accept-encoding"] ?? "");
      if (!exportPath || response.status !== 200 || !gzip || etag === null) {
        if (exportPath)
          requests.push({
            condition,
            encoding: incoming.headers["accept-encoding"],
            status: response.status,
            etag,
          });
        outgoing.writeHead(response.status, {
          "content-type": response.headers.get("content-type") ?? "application/octet-stream",
          ...(etag === null ? {} : { etag }),
        });
        outgoing.end(response.status === 304 ? undefined : body);
        return;
      }
      const weak = etag.startsWith("W/") ? etag : `W/${etag}`;
      requests.push({
        condition,
        encoding: incoming.headers["accept-encoding"],
        status: 200,
        etag: weak,
      });
      const compressed = gzipSync(body);
      outgoing.writeHead(200, {
        "content-encoding": "gzip",
        "content-length": compressed.length,
        "content-type": "application/json",
        etag: weak,
        vary: "Accept-Encoding",
      });
      outgoing.end(compressed);
    } catch {
      outgoing.writeHead(502).end();
    }
  });
  return { requests, server };
}

/** One packed-loader process in the consumer site that reads the export on each `read` line. */
const loaderScript = `
import { createInterface } from "node:readline";
import { createAstroSiteLoader } from "@lacecms/astro";
const getSite = createAstroSiteLoader({ dev: true, env: process.env });
for await (const line of createInterface({ input: process.stdin })) {
  if (line !== "read") continue;
  try {
    const site = await getSite();
    const titles = site.entries("posts").map((item) => item.title);
    console.log(JSON.stringify({ ok: true, version: site.version, titles }));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, name: error?.name, message: String(error?.message ?? error) }));
  }
}
`;

/**
 * Alpha.2 field-trial §4 (33B) in the packed consumer: the standard loader of
 * the installed `@lacecms/astro` reads the Compose API's build export through a
 * compressing proxy that weakens the ETag, without a custom fetch. Development
 * mode revalidates with the received validator (`304` while unchanged, new
 * content after a publication); the static `pnpm build` reads it once.
 */
export async function weakEtagJourney(context, session, operations) {
  const { request, run, secretValues, waitBuild } = operations;
  const { base, cookie } = session;
  const issued = await request(base, "/api/v1/admin/api-tokens", {
    method: "POST",
    headers: { cookie },
    json: { name: "weak-etag-export" },
  });
  const token = issued.body?.token;
  if (typeof token !== "string") throw new Error("weak-etag: build token missing");
  secretValues.add(token);
  const { requests, server } = compressingExportProxy(base);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const proxy = `http://127.0.0.1:${server.address().port}/`;
  const environment = {
    ...process.env,
    ASTRO_TELEMETRY_DISABLED: "1",
    LACE_API_BASE_URL: proxy,
    LACE_PUBLIC_BASE_URL: base,
    LACE_BUILD_TOKEN: token,
  };
  const child = spawn(process.execPath, ["--input-type=module", "-e", loaderScript], {
    cwd: join(context.project, "site"),
    env: environment,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let errors = "";
  let slug;
  child.stderr.setEncoding("utf8").on("data", (chunk) => (errors += chunk));
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const read = async (stage) => {
    console.info(`Acceptance: ${stage}`);
    child.stdin.write("read\n");
    const next = await Promise.race([
      lines.next(),
      new Promise((resolve) => setTimeout(() => resolve({ done: true }), 30_000)),
    ]);
    if (next.done)
      throw new Error(`${stage}: packed loader did not answer\n${errors.slice(-2000)}`);
    const result = JSON.parse(next.value);
    if (!result.ok)
      throw new Error(`${stage}: packed loader failed: ${result.name}: ${result.message}`);
    return result;
  };
  try {
    const first = await read("weak-etag-dev-read");
    if (
      requests.length !== 1 ||
      requests[0].condition !== undefined ||
      !requests[0].etag?.startsWith("W/")
    )
      throw new Error(
        `weak-etag-dev-read: expected one weak gzip response, saw ${JSON.stringify(requests)}`,
      );
    const again = await read("weak-etag-dev-revalidate");
    const revalidation = requests[1];
    if (
      again.version !== first.version ||
      revalidation?.condition !== requests[0].etag ||
      revalidation.status !== 304
    )
      throw new Error(
        `weak-etag-dev-revalidate: expected the weak validator back and 304, saw ${JSON.stringify(requests)}`,
      );

    console.info("Acceptance: weak-etag-publish");
    const path = `/api/v1/admin/entries/${session.entryId}`;
    const { body: entry } = await request(base, path, { headers: { cookie } });
    slug = entry.draft.slug;
    const saved = await request(base, `${path}/draft`, {
      method: "PUT",
      headers: { cookie },
      json: {
        blocks: entry.draft.blocks,
        expectedRevision: entry.draft.revision,
        fields: entry.draft.fields,
        slug: entry.draft.slug,
        title: "Weak ETag title",
      },
    });
    const published = await request(base, `${path}/publish`, {
      method: "POST",
      headers: { cookie },
      json: { expectedRevision: saved.body.draft.revision },
    });
    const targetVersion = published.body.build.targetVersion;
    const build = await waitBuild(
      session,
      (item) =>
        item.targetVersion === targetVersion && ["succeeded", "failed"].includes(item.status),
    );
    if (build.status !== "succeeded")
      throw new Error(`weak-etag-publish: Compose build ${build.status}`);
    const changed = await read("weak-etag-dev-changed");
    const after = requests.at(-1);
    if (
      changed.version <= first.version ||
      !changed.titles.includes("Weak ETag title") ||
      after.status !== 200 ||
      after.condition === undefined
    )
      throw new Error(
        `weak-etag-dev-changed: expected new content after a conditional read, saw ${JSON.stringify({ changed, requests })}`,
      );
  } finally {
    child.stdin.end();
    child.kill("SIGTERM");
  }

  const before = requests.length;
  await run("weak-etag-static-build", "pnpm", ["build"], {
    cwd: context.project,
    env: environment,
  });
  const staticReads = requests.slice(before);
  if (
    staticReads.length < 1 ||
    staticReads.some((item) => item.status !== 200 || !item.etag?.startsWith("W/"))
  )
    throw new Error(
      `weak-etag-static-build: expected weak gzip reads, saw ${JSON.stringify(staticReads)}`,
    );
  if (!requests.every((item) => /\bgzip\b/u.test(item.encoding ?? "")))
    throw new Error("weak-etag: the loader did not negotiate compression with default fetch");
  const html = await readFile(join(context.project, "site/dist/blog", slug, "index.html"), "utf8");
  if (!html.includes("Weak ETag title"))
    throw new Error("weak-etag-static-build: published content missing from the static output");
  if (html.includes(token)) throw new Error("weak-etag-static-build: exposed build token");
  await new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  });
  console.info(
    "Weak ETags: the packed Astro loader read the Compose export through a compressing proxy (weak 200, weak revalidation 304, new content after publication) and the static build succeeded without a custom fetch",
  );
}
