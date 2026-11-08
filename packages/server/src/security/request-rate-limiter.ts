import type { Clock, RateLimitDecision, SensitiveRateLimiter } from "@lacecms/application";
import { sensitiveRequestLimit, sensitiveRequestSubject } from "./sensitive-limits.js";

/**
 * Applies the shared sensitive-route limits through a runtime's durable
 * fixed-window limiter. Requests outside those routes, or without a subject,
 * are always allowed. Structurally a `RequestRateLimiter` (composition owns
 * that type; `security` must not import `composition`).
 */
export class SensitiveRequestRateLimiter {
  public constructor(
    private readonly limiter: SensitiveRateLimiter,
    private readonly clock: Clock,
    /** The trusted client address of a request, never a raw forwarded header. */
    private readonly clientAddress: (request: Request) => string,
  ) {}

  public async check(input: {
    readonly request: Request;
    readonly actor?: { readonly id: string };
  }): Promise<boolean | RateLimitDecision> {
    const limit = sensitiveRequestLimit(input.request.method, new URL(input.request.url).pathname);
    if (limit === undefined) return true;
    const subject = await sensitiveRequestSubject(
      limit,
      input.request,
      this.clientAddress(input.request),
      input.actor?.id,
    );
    if (subject === undefined) return true;
    return this.limiter.check({ now: this.clock.now(), operation: limit.operation, subject });
  }
}
