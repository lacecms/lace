import { actorId, contentEntryId, unixMilliseconds } from "@lacecms/domain";
import type { CloudflareWorker, WorkerExecutionContext } from "../runtime/worker.js";
import type { CloudflareWorkerEnv } from "../runtime/settings.js";

interface AcceptanceEnv extends CloudflareWorkerEnv {
  readonly LACE_PV1E_ACCEPTANCE?: unknown;
}

const route =
  /^\/__lace-pv1e\/entries\/([A-Za-z0-9_-]{1,128})(?:\/([1-9][0-9]{0,15})\/([A-Za-z0-9_-]{1,128}))?$/u;
const privateHeaders = { "cache-control": "no-store" };
const empty = (status: number) => new Response(null, { status, headers: privateHeaders });
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: privateHeaders });

async function isEmptyBody(request: Request): Promise<boolean> {
  const reader = request.body?.getReader();
  if (!reader) return true;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return true;
      if (chunk.value.byteLength > 0) return false;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Temporary Worker entry adapter for the disposable PV1E acceptance installation. */
export function previewAcceptanceWorker(worker: CloudflareWorker) {
  return {
    scheduled: worker.scheduled,
    async fetch(request: Request, env: AcceptanceEnv, ctx: WorkerExecutionContext) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/__lace-pv1e/")) return worker.fetch(request, env, ctx);
      const match = route.exec(url.pathname);
      const entry = match?.[1];
      const revision = match?.[2];
      const key = match?.[3];
      if (
        env.LACE_PV1E_ACCEPTANCE !== "true" ||
        !entry ||
        url.search ||
        url.protocol !== "https:" ||
        `${url.origin}/` !== env.LACE_PUBLIC_BASE_URL ||
        (request.method !== "GET" && request.method !== "POST") ||
        (request.method === "POST" ? !key : key !== undefined) ||
        request.headers.has("authorization")
      )
        return empty(404);
      if (request.method === "POST" && request.headers.get("origin") !== url.origin)
        return empty(403);
      const cookie = request.headers.get("cookie");
      if (!cookie) return empty(401);
      const session = await worker.fetch(
        new Request(new URL("/api/v1/admin/session", url), { headers: { cookie } }),
        env,
        ctx,
      );
      if (!session.ok) return empty(session.status);
      const { user } = (await session.json()) as { user: { id: string; role: string } };
      if (user.role !== "admin") return empty(403);
      if (request.method === "POST" && !(await isEmptyBody(request))) return empty(404);
      const { createPreview, repository } = worker.runtime(env);
      if (!createPreview) return empty(503);
      const entryId = contentEntryId(entry);
      if (request.method === "GET") {
        const [preview, fence] = await Promise.all([
          repository.preview.currentPreview(entryId, unixMilliseconds(Date.now())),
          repository.preview.previewCaptureFence(),
        ]);
        return json({ preview, publicVersion: fence.publicVersion });
      }
      const expectedRevision = Number(revision);
      if (!Number.isSafeInteger(expectedRevision)) return empty(400);
      const result = await createPreview(
        { id: actorId(user.id), role: "admin" },
        { entryId, expectedRevision, idempotencyKey: key! },
      ).catch(() => null);
      if (result === null) return empty(500);
      if (result.kind === "rejected") return json({ reason: result.reason }, 409);
      const { id, source, overallDeadline } = result.generation;
      return json(
        { id, commit: source.commit, overallDeadline },
        result.kind === "admitted" ? 202 : 200,
      );
    },
  };
}
