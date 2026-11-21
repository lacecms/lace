import { createHash, X509Certificate } from "node:crypto";
import { request as httpRequest } from "node:http";
import { createServer, request as httpsRequest } from "node:https";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { exec, listen } from "./packed-preview-platforms.mjs";

export const cmsHost = "cms.lace.test";
export const previewHost = "preview.lace.test";

export async function previewCertificate(directory) {
  await mkdir(directory, { recursive: true });
  const certFile = join(directory, "cert.pem");
  const keyFile = join(directory, "key.pem");
  await exec("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyFile,
    "-out",
    certFile,
    "-days",
    "1",
    "-subj",
    `/CN=${cmsHost}`,
    "-addext",
    `subjectAltName=DNS:${cmsHost},DNS:${previewHost}`,
  ]);
  const cert = await readFile(certFile);
  const key = await readFile(keyFile);
  const publicKey = new X509Certificate(cert).publicKey.export({ type: "spki", format: "der" });
  return { cert, key, spki: createHash("sha256").update(publicKey).digest("base64") };
}

export function loopbackRequest(ca) {
  return async (request) => {
    const url = new URL(request.url);
    const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined;
    const headers = Object.fromEntries(request.headers);
    const tls = url.protocol === "https:";
    if (body) headers["content-length"] = String(body.length);
    return new Promise((resolve, reject) => {
      const transport = tls ? httpsRequest : httpRequest;
      const outgoing = transport(
        {
          host: "127.0.0.1",
          port: url.port,
          ...(tls && { servername: url.hostname, ca }),
          path: url.pathname + url.search,
          method: request.method,
          headers: { host: url.host, ...headers },
        },
        async (incoming) => {
          try {
            const responseHeaders = new Headers();
            for (let i = 0; i < incoming.rawHeaders.length; i += 2)
              responseHeaders.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
            const chunks = [];
            for await (const chunk of incoming) chunks.push(chunk);
            const noBody =
              [204, 205, 304].includes(incoming.statusCode) || request.method === "HEAD";
            resolve(
              new Response(noBody ? null : Buffer.concat(chunks), {
                status: incoming.statusCode,
                headers: responseHeaders,
              }),
            );
          } catch (error) {
            reject(error);
          }
        },
      );
      outgoing.setTimeout(15_000, () => outgoing.destroy(new Error("Loopback request timed out")));
      outgoing.once("error", reject);
      outgoing.end(body);
    });
  };
}

export async function previewVpsTls(httpPort, tls, cleanups) {
  const server = createServer(tls, (client, response) => {
    const upstream = httpRequest(
      {
        host: "127.0.0.1",
        port: httpPort,
        path: client.url,
        method: client.method,
        headers: { ...client.headers, "x-forwarded-proto": "https" },
      },
      (incoming) => {
        response.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(response);
      },
    );
    upstream.once("error", () => response.writeHead(502).end());
    client.pipe(upstream);
  });
  return listen(server, cleanups);
}
