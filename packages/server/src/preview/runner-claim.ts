import type { Clock, PreviewClaim, PreviewCommandPort } from "@lacecms/application";
import { previewClaimRequestSchema, previewGenerationIdSchema } from "@lacecms/contracts";
import * as v from "valibot";

const tokenPattern =
  /^([A-Za-z0-9_-]{1,128})\.([a-f0-9]{40}|[a-f0-9]{64})\.[a-f0-9]{64}(?![\s\S])/u;
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

async function credentialHash(value: string) {
  return hex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  );
}

export function runnerBearer(request: Request) {
  const value = request.headers.get("authorization");
  return !request.headers.has("cookie") &&
    !request.headers.has("origin") &&
    value?.startsWith("Bearer ") &&
    value.length <= 512
    ? value.slice(7)
    : null;
}

export async function runnerJson(request: Request, limit: number): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json")
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode()) as unknown;
      size += value.byteLength;
      if (size > limit) return null;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export interface PreviewRunnerClaimSettings {
  readonly executor: string;
  readonly bootstrapSecret: string;
  readonly acceptsRun: (id: string, run: string, commit: string) => boolean | Promise<boolean>;
  readonly clock: Clock;
  readonly commands: Pick<PreviewCommandPort, "claimPreview">;
}

export function previewRunnerClaim(settings: PreviewRunnerClaimSettings) {
  const expected = credentialHash(settings.bootstrapSecret);
  const { executor, clock, commands } = settings;
  return async (request: Request, id: string) => {
    const secret = runnerBearer(request);
    if (!secret) return { status: 401 } as const;
    const [left, right] = await Promise.all([credentialHash(secret), expected]);
    let difference = 0;
    for (let index = 0; index < right.length; index++)
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    if (difference !== 0) return { status: 401 } as const;
    const body = v.safeParse(previewClaimRequestSchema, await runnerJson(request, 1024));
    if (!v.is(previewGenerationIdSchema, id) || !body.success) return { status: 400 } as const;
    const { commit, runId: run } = body.output;
    if (!(await settings.acceptsRun(id, run, commit))) return { status: 409 } as const;
    const token = `${run}.${commit}.${hex(crypto.getRandomValues(new Uint8Array(32)))}`;
    const digest = await credentialHash(token);
    const claim = await commands.claimPreview({
      id,
      executor,
      commit,
      run,
      credentialHash: digest,
      now: clock.now(),
    });
    return claim
      ? ({ status: 200, token, deadline: claim.deadline } as const)
      : ({ status: 409 } as const);
  };
}

export async function readRunnerClaim(
  request: Request,
  id: string,
  executor: string,
  clock: Clock,
): Promise<PreviewClaim | null> {
  const token = runnerBearer(request);
  const match = token && tokenPattern.exec(token);
  if (!token || !match) return null;
  return {
    id,
    executor,
    run: match[1]!,
    commit: match[2]!,
    credentialHash: await credentialHash(token),
    now: clock.now(),
  };
}
