import {
  isPreviewAccessToken,
  previewReturnGeneration,
  PREVIEW_HANDOFF_SECONDS,
} from "@lacecms/application";
import type {
  Clock,
  PreviewAccessPort,
  PreviewBrowserAccess,
  PreviewHandoff,
} from "@lacecms/application";
import { hasPermission, unixMilliseconds } from "@lacecms/domain";
import type { SessionActorResolver } from "../session/better-auth.js";

const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const token = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const hash = async (value: string) =>
  hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));

export function createPreviewAccess(input: {
  readonly admin: URL;
  readonly preview: URL;
  readonly clock: Clock;
  readonly secret: string;
  readonly actors: Pick<SessionActorResolver, "resolve"> &
    Partial<Pick<SessionActorResolver, "sessionId">>;
  readonly persistence: PreviewAccessPort;
}): PreviewBrowserAccess<Request> {
  const admin = new URL(input.admin.origin);
  const preview = new URL(input.preview.origin);
  if (
    admin.protocol !== "https:" ||
    preview.protocol !== "https:" ||
    input.preview.href !== preview.href ||
    admin.hostname === preview.hostname
  )
    throw new TypeError("Preview requires two distinct HTTPS hostnames and a bare preview origin.");
  const origins = { adminOrigin: admin.origin, previewOrigin: preview.origin };
  const key = () =>
    crypto.subtle.importKey(
      "raw",
      encoder.encode(input.secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  const signed = (payload: string) =>
    encoder.encode(JSON.stringify(["lace-preview-handoff", origins, payload]));

  async function verify(state: string): Promise<PreviewHandoff | null> {
    const [id, browserHash, expiry, returnPath, signature, extra] = state.split(".");
    if (
      !id ||
      !browserHash ||
      !expiry ||
      !returnPath ||
      !signature ||
      extra !== undefined ||
      ![id, browserHash, signature].every(isPreviewAccessToken) ||
      !/^\d{1,16}$/u.test(expiry)
    )
      return null;
    const generationId = previewReturnGeneration(returnPath);
    const expiresAt = Number(expiry);
    const now = input.clock.now();
    if (
      generationId === undefined ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= now ||
      expiresAt > now + PREVIEW_HANDOFF_SECONDS * 1000
    )
      return null;
    const valid = await crypto.subtle.verify(
      "HMAC",
      await key(),
      Uint8Array.from(signature.match(/../gu)!, (byte) => Number.parseInt(byte, 16)),
      signed(state.slice(0, -65)),
    );
    return valid
      ? {
          ...origins,
          id,
          browserHash,
          returnPath,
          generationId,
          expiresAt: unixMilliseconds(expiresAt),
        }
      : null;
  }

  return {
    ...origins,
    async start(returnPath: string) {
      if (!previewReturnGeneration(returnPath)) return null;
      const id = token();
      const nonce = token();
      const expiresAt = input.clock.now() + PREVIEW_HANDOFF_SECONDS * 1000;
      const payload = `${id}.${await hash(nonce)}.${expiresAt}.${returnPath}`;
      const mac = await crypto.subtle.sign("HMAC", await key(), signed(payload));
      return { id, nonce, state: `${payload}.${hex(new Uint8Array(mac))}` };
    },
    async authorize(request: Request, state: string) {
      const flow = await verify(state);
      if (flow === null) return { kind: "invalid" } as const;
      const actor = await input.actors.resolve(request);
      if (actor === null) return { kind: "login", returnPath: flow.returnPath } as const;
      if (actor === "request-denied" || actor.authority || !hasPermission(actor, "content:read"))
        return { kind: "denied" } as const;
      const sessionId = (await input.actors.sessionId?.(request)) ?? null;
      if (sessionId === null) return { kind: "denied" } as const;
      const code = token();
      const accepted = await input.persistence.authorizeHandoff({
        ...flow,
        sessionId,
        userId: actor.id,
        codeHash: await hash(code),
        now: input.clock.now(),
      });
      return accepted
        ? ({ kind: "issued", id: flow.id, generationId: flow.generationId, code } as const)
        : ({ kind: "invalid" } as const);
    },
    async redeem(id: string, code: string, nonce: string) {
      if (![id, code, nonce].every(isPreviewAccessToken)) return null;
      const value = token();
      const [browserHash, codeHash, tokenHash] = await Promise.all([
        hash(nonce),
        hash(code),
        hash(value),
      ]);
      const grant = await input.persistence.redeemHandoff({
        ...origins,
        id,
        browserHash,
        codeHash,
        tokenHash,
        now: input.clock.now(),
      });
      return grant && { ...grant, value };
    },
    async delivery(value: string, id: string) {
      if (!isPreviewAccessToken(value)) return "denied" as const;
      return input.persistence.previewDelivery(
        await hash(value),
        origins.previewOrigin,
        id,
        input.clock.now(),
      );
    },
  };
}
