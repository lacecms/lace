import { getRequestListener } from "@hono/node-server";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import type {
  CreateNodeRuntimeInput,
  NodeRuntime,
  NodeRuntimeSettings,
} from "@lacecms/platform-node";

const protectedLocalPaths = new Set(["/health/live", "/health/ready"]);

function gatewayResponse(status: number, message: string): Response {
  return Response.json({ error: { code: "UPSTREAM_UNAVAILABLE", message } }, { status });
}

function isLocalPath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/health" ||
    pathname.startsWith("/health/") ||
    protectedLocalPaths.has(pathname)
  );
}

function writeUpgradeFailure(socket: Duplex): void {
  socket.end(
    "HTTP/1.1 502 Bad Gateway\\r\\nContent-Type: application/json\\r\\nConnection: close\\r\\n\\r\\n" +
      '{"error":{"code":"UPSTREAM_UNAVAILABLE","message":"Development upstream is unavailable."}}',
  );
}

function proxyUpgradeHeaders(
  request: IncomingMessage,
  target: URL,
): Record<string, string | string[]> {
  const headers = { ...request.headers };
  headers.host = target.host;
  delete headers.forwarded;
  delete headers["x-forwarded-for"];
  delete headers["x-forwarded-host"];
  delete headers["x-forwarded-proto"];
  return headers as Record<string, string | string[]>;
}

/** Bridges supported frontend development upgrades while API and health paths stay local. */
export function proxyNodeDevelopmentUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  settings: NodeRuntimeSettings,
): void {
  const source = new URL(request.url ?? "/", "http://lace.local");
  if (isLocalPath(source.pathname)) {
    socket.destroy();
    return;
  }
  const target = proxyTarget(settings, source.pathname);
  if (target === undefined) {
    writeUpgradeFailure(socket);
    return;
  }
  const requestUpgrade = target.protocol === "https:" ? httpsRequest : httpRequest;
  const upstream = requestUpgrade({
    headers: proxyUpgradeHeaders(request, target),
    hostname: target.hostname,
    path: `${source.pathname}${source.search}`,
    port: target.port || undefined,
    protocol: target.protocol,
  });
  upstream.once("error", () => writeUpgradeFailure(socket));
  upstream.once("upgrade", (response, upstreamSocket, upstreamHead) => {
    const lines = [`HTTP/${response.httpVersion} ${response.statusCode} ${response.statusMessage}`];
    for (const [name, value] of Object.entries(response.headers)) {
      if (value === undefined) continue;
      lines.push(`${name}: ${Array.isArray(value) ? value.join(", ") : value}`);
    }
    socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (upstreamHead.length > 0) socket.write(upstreamHead);
    if (head.length > 0) upstreamSocket.write(head);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });
  upstream.end();
}

function proxyTarget(settings: NodeRuntimeSettings, pathname: string): URL | undefined {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return settings.adminDevOrigin;
  return settings.siteDevOrigin;
}

function proxyHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  for (const name of [
    "connection",
    "forwarded",
    "host",
    "keep-alive",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
  ]) {
    headers.delete(name);
  }
  return headers;
}

/** Routes the API and health namespaces locally, and development frontend paths through one origin. */
export function createNodeDevelopmentGateway(
  apiFetch: (request: Request) => Response | Promise<Response>,
  settings: NodeRuntimeSettings,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const source = new URL(request.url);
    if (isLocalPath(source.pathname)) return apiFetch(request);
    const target = proxyTarget(settings, source.pathname);
    if (target === undefined) {
      return gatewayResponse(502, "Development upstream is not configured.");
    }
    const destination = new URL(`${source.pathname}${source.search}`, target);
    try {
      const body = request.method === "GET" || request.method === "HEAD" ? undefined : request.body;
      const init =
        body === undefined || body === null
          ? { headers: proxyHeaders(request), method: request.method }
          : {
              body,
              duplex: "half" as const,
              headers: proxyHeaders(request),
              method: request.method,
            };
      return await fetch(new Request(destination, init));
    } catch {
      return gatewayResponse(502, "Development upstream is unavailable.");
    }
  };
}

export interface NodeServer {
  readonly close: () => Promise<void>;
  readonly server: Server;
  readonly url: URL;
}

export async function startNodeServer(input: {
  readonly developmentGateway?: boolean;
  readonly dispatchMediaDeletions?: boolean;
  readonly runtime: NodeRuntime;
  readonly settings: NodeRuntimeSettings;
}): Promise<NodeServer> {
  await input.runtime.verifyStorage();
  const fetch = input.developmentGateway
    ? createNodeDevelopmentGateway(input.runtime.app.fetch, input.settings)
    : input.runtime.app.fetch;
  const server = createServer(
    getRequestListener(
      (request, bindings) => {
        input.runtime.setRequestPeer(request, bindings.incoming.socket.remoteAddress);
        return fetch(request);
      },
      { overrideGlobalObjects: false },
    ),
  );
  const connections = new Set<Duplex>();
  server.on("connection", (socket) => {
    connections.add(socket);
    socket.once("close", () => connections.delete(socket));
  });
  if (input.developmentGateway) {
    server.on("upgrade", (request, socket, head) =>
      proxyNodeDevelopmentUpgrade(request, socket, head, input.settings),
    );
  }
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(input.settings.port, input.settings.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Node server did not expose a TCP address.");
  }
  let stopped = false;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let current = Promise.resolve();
  const dispatch = () => {
    current = input.runtime.deletionDispatcher.runOnce().catch(() => undefined);
    void current.finally(() => {
      if (!stopped) scheduled = setTimeout(dispatch, 1_000);
    });
  };
  if (input.dispatchMediaDeletions !== false) dispatch();
  return Object.freeze({
    close: async () => {
      stopped = true;
      if (scheduled !== undefined) clearTimeout(scheduled);
      await current;
      for (const socket of connections) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    },
    server,
    url: new URL(`http://${input.settings.host}:${address.port}`),
  });
}

export type NodeApiConfig = CreateNodeRuntimeInput["config"];
