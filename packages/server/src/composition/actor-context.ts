import { requireSettingsManager, requireUsersManager } from "@lacecms/application";
import { AuthorizationError } from "../shared/http.js";
import type { Actor, ActorResolver } from "./input.js";

/** The Hono context members actor resolution reads and caches per request. */
export interface ActorRequestContext {
  readonly req: { readonly raw: Request };
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

/** Resolves the request actor once per request; routes never see the resolver itself. */
export function createActorContext(actors: ActorResolver) {
  async function actor(context: ActorRequestContext): Promise<Actor> {
    const cached = context.get("lace.actor") as Actor | undefined;
    if (cached !== undefined) return cached;
    const resolved = await actors.resolve(context.req.raw);
    if (resolved === null) throw new AuthorizationError();
    context.set("lace.actor", resolved);
    return resolved;
  }

  async function usersActor(context: ActorRequestContext): Promise<Actor> {
    const value = await actor(context);
    requireUsersManager(value);
    return value;
  }

  async function settingsActor(context: ActorRequestContext): Promise<Actor> {
    const value = await actor(context);
    requireSettingsManager(value);
    return value;
  }

  /** The current session id is resolved once per request beside the actor. */
  async function currentSessionId(context: ActorRequestContext): Promise<string | null> {
    await actor(context);
    const cached = context.get("lace.sessionId") as string | null | undefined;
    if (cached !== undefined) return cached;
    const resolved = (await actors.sessionId?.(context.req.raw)) ?? null;
    context.set("lace.sessionId", resolved);
    return resolved;
  }

  return Object.freeze({ actor, currentSessionId, settingsActor, usersActor });
}

export type ActorContext = ReturnType<typeof createActorContext>;
