import type { ActorContext } from "./actor-context.js";
import type { Capabilities } from "./capabilities.js";

/** What every route module receives: actor resolution and the capabilities it calls. */
export interface RouteContext {
  readonly actors: ActorContext;
  readonly capabilities: Capabilities;
}
