// Disposable local browser acceptance server; never part of a runtime package.
import { createRequire } from "node:module";
import { openMcpRuntime } from "./runtime.mjs";
import { createNodeAdminAssets } from "../../../apps/api/dist/admin-assets.js";
const require = createRequire(new URL("../../../apps/api/package.json", import.meta.url));
const { serve } = require("@hono/node-server");
let handler = async () => new Response("Starting", { status: 503 });
const server = serve({ fetch: (request) => handler(request), port: 0, hostname: "127.0.0.1" });
if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const kind = process.argv[2] ?? "SQLite";
const assets = createNodeAdminAssets(new URL("../../../apps/admin/dist", import.meta.url).pathname);
const f = await openMcpRuntime(kind, { origin, assets });
let client;
let checks = {};
handler = async (request) => {
  const url = new URL(request.url);
  if (url.pathname === "/fixture/start") return Response.redirect(f.authorizationUrl(), 302);
  if (url.pathname === "/fixture/callback") {
    if (url.searchParams.get("error") === "access_denied") {
      checks.denial = true;
      return new Response("Connection denied. No tokens issued.");
    }
    const tokens = await f.exchange(url.searchParams.get("code"));
    client = await f.connect(tokens);
    const listed = await client.listTools();
    const created = await client.callTool({
      name: "create_entry",
      arguments: { modelKey: "posts", title: "Browser-approved draft", fields: {}, blocks: [] },
    });
    if (created.isError || listed.tools.length !== 5)
      throw new Error("Browser-approved SDK flow failed.");
    checks.approval = true;
    checks.tools = listed.tools.map((tool) => tool.name);
    return new Response(
      "Connected. SDK initialized, listed five tools and created an unpublished draft.",
    );
  }
  if (url.pathname === "/fixture/check") {
    try {
      await client.listTools();
      checks.revoked = false;
    } catch (error) {
      checks.revoked = String(error).includes("invalid_token");
    }
    return Response.json(checks);
  }
  return f.fetch(request);
};
console.log(
  JSON.stringify({
    ready: true,
    kind,
    origin,
    start: `${origin}/fixture/start`,
    account: `${origin}/admin/account`,
  }),
);
const stop = async () => {
  try {
    await client?.close();
  } catch {
    /* Revoked client can no longer close over HTTP. */
  }
  await new Promise((resolve) => server.close(resolve));
  await f.close();
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
