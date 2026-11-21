import { previewArtifactContentType } from "@lacecms/application";
import type {
  PreviewByteRange,
  PreviewArtifactReader,
  PreviewBrowserAccess,
} from "@lacecms/application";
import { binaryStream, isNotModified } from "../shared/binary.js";
import { isPreviewFrameRequest, previewFrameSignal } from "./frame.js";
import { previewCookie, previewResponse, privatePreviewHeaders } from "./handoff.js";

const artifactPath = /^\/p\/([A-Za-z0-9_-]{1,128})\/(.*)(?![\s\S])/u;

/** Byte ranges use one interval. Ignore malformed or unsupported range syntax. */
function byteRange(
  value: string | null,
  bytes: number,
): PreviewByteRange | "unsatisfiable" | undefined {
  if (!value) return undefined;
  const match = /^bytes=(\d{0,16})-(\d{0,16})(?![\s\S])/iu.exec(value);
  if (!match || (!match[1] && !match[2])) return undefined;
  if (bytes === 0) return "unsatisfiable";
  if (!match[1]) {
    const length = Math.min(bytes, Number(match[2]));
    return length > 0 ? { offset: bytes - length, length } : "unsatisfiable";
  }
  const offset = Number(match[1]);
  const end = match[2] ? Math.min(bytes - 1, Number(match[2])) : bytes - 1;
  return offset <= end ? { offset, length: end - offset + 1 } : "unsatisfiable";
}

export async function previewArtifact(
  request: Request,
  pathname: string,
  access: PreviewBrowserAccess<Request>,
  packages: PreviewArtifactReader,
): Promise<Response> {
  const [, id, path] = artifactPath.exec(pathname) ?? [];
  if (!id || path === undefined || (path !== "" && !previewArtifactContentType(path)))
    return previewResponse(404);
  const denied = (status: number) => {
    if (path !== "" || request.method !== "GET" || !isPreviewFrameRequest(request))
      return previewResponse(status);
    const headers = privatePreviewHeaders();
    const nonce = crypto.randomUUID();
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set(
      "content-security-policy",
      `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors ${access.adminOrigin} ${access.previewOrigin}; base-uri 'none'`,
    );
    return new Response(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Preview unavailable</title>
      <p>This preview could not be opened.</p><script nonce="${nonce}">
      ${previewFrameSignal(access.adminOrigin)}
      notify(${JSON.stringify(id)}, "unavailable");
      </script></html>`,
      { status, headers },
    );
  };
  const delivery = await access.delivery(previewCookie(request), id);
  if (delivery === "denied") return denied(401);
  if (!delivery) return denied(404);
  const manifest = await packages.manifest(id, delivery.manifest);
  if (!manifest) return denied(404);
  const file = manifest.files.find((file) => file.path === (path || manifest.html));
  if (!file) return denied(404);
  const headers = privatePreviewHeaders();
  const etag = `"sha256-${file.sha256}"`;
  headers.set("content-type", file.contentType);
  if (file.contentType.startsWith("text/html")) {
    headers.set(
      "content-security-policy",
      `frame-ancestors ${access.adminOrigin} ${access.previewOrigin}; worker-src 'none'; object-src 'none'; base-uri 'none'; sandbox allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads`,
    );
  } else {
    headers.set("cross-origin-resource-policy", "same-origin");
  }
  headers.set("etag", etag);
  headers.set("accept-ranges", "bytes");
  const notModified = isNotModified(request.headers.get("if-none-match"), etag);
  if (request.method === "HEAD" || notModified) {
    if (!(await packages.exists(id, file))) return previewResponse(404);
    if (notModified) return new Response(null, { status: 304, headers });
    headers.set("content-length", String(file.bytes));
    return new Response(null, { headers });
  }
  const ifRange = request.headers.get("if-range");
  const range =
    ifRange === null || ifRange === etag
      ? byteRange(request.headers.get("range"), file.bytes)
      : undefined;
  if (range === "unsatisfiable") {
    if (!(await packages.exists(id, file))) return previewResponse(404);
    headers.set("content-range", `bytes */${file.bytes}`);
    return new Response(null, { status: 416, headers });
  }
  const bytes = await packages.read(id, file, range);
  if (!bytes) return denied(404);
  headers.set("content-length", String(range?.length ?? file.bytes));
  if (range)
    headers.set(
      "content-range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${file.bytes}`,
    );
  return new Response(binaryStream(bytes), { status: range ? 206 : 200, headers });
}
