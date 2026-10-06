import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { BuildRequest, BuildResult } from "./runner.js";

const MAX_BODY_BYTES = 1024;
const BUILD_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;
import { siteBuildFailureReasons, normalizeBuildFailure } from "./diagnostics.js";
const SAFE_REASONS = new Set<string>(siteBuildFailureReasons.slice(0, 8));

function sameSecret(actual: string | undefined, expected: string): boolean {
  const left = createHash("sha256")
    .update(actual ?? "")
    .digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right) && actual !== undefined;
}

function send(response: ServerResponse, status: number, body: Record<string, string>): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new Error("invalid_request");
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("invalid_request");
  }
}

function parseBuildRequest(value: unknown): BuildRequest | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    !Object.hasOwn(record, "buildId") ||
    !Object.hasOwn(record, "targetVersion") ||
    typeof record.buildId !== "string" ||
    !BUILD_ID_PATTERN.test(record.buildId) ||
    typeof record.targetVersion !== "number" ||
    !Number.isSafeInteger(record.targetVersion) ||
    record.targetVersion < 0
  )
    return undefined;
  return { buildId: record.buildId, targetVersion: record.targetVersion };
}

export function createBuilderHandler(input: {
  readonly secret: string;
  readonly build: (request: BuildRequest) => Promise<BuildResult>;
}): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  if (input.secret.length < 32)
    throw new TypeError("Builder secret must be at least 32 characters.");
  let queue: Promise<void> = Promise.resolve();
  return async (request, response) => {
    if (request.url === "/health" && request.method === "GET") {
      send(response, 200, { status: "ok" });
      return;
    }
    if (request.url !== "/build" || request.method !== "POST") {
      send(response, 404, { status: "not_found" });
      return;
    }
    const auth = request.headers.authorization;
    if (
      typeof auth !== "string" ||
      !auth.startsWith("Bearer ") ||
      !sameSecret(auth.slice(7), input.secret)
    ) {
      send(response, 401, { status: "unauthorized" });
      return;
    }
    if (request.headers["content-type"]?.split(";", 1)[0]?.trim() !== "application/json") {
      send(response, 400, { status: "invalid_request" });
      return;
    }
    let parsed: BuildRequest | undefined;
    try {
      parsed = parseBuildRequest(await readBody(request));
    } catch {
      parsed = undefined;
    }
    if (parsed === undefined) {
      send(response, 400, { status: "invalid_request" });
      return;
    }
    const buildRequest = parsed;
    const job = queue.then(() => input.build(buildRequest));
    queue = job.then(
      () => undefined,
      () => undefined,
    );
    let result: BuildResult;
    try {
      result = await job;
    } catch {
      result = { status: "failed", reason: "build_failed" };
    }
    if (result.status === "succeeded")
      send(response, 200, { status: "succeeded", log: "Static build succeeded." });
    else {
      const reason = SAFE_REASONS.has(result.reason) ? result.reason : "build_failed";
      const failure = normalizeBuildFailure(reason, result.path);
      console.error(
        JSON.stringify({
          component: "builder",
          buildId: buildRequest.buildId,
          status: "failed",
          reason,
        }),
      );
      send(response, 503, {
        status: "failed",
        ...failure,
        log: `Static build failed: ${reason}.`,
      });
    }
  };
}
