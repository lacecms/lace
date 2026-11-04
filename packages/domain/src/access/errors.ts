import { LaceError } from "@lacecms/content";

/** Closed account-flow failures; the HTTP boundary maps each code to one envelope. */
export type AccountErrorCode =
  | "CONFLICT"
  | "INVALID_CREDENTIALS"
  | "INVITATION_INVALID"
  | "NOT_FOUND"
  | "RESET_INVALID";

export class AccountError extends LaceError<AccountErrorCode> {
  public constructor(code: AccountErrorCode) {
    super(code, code);
    this.name = "AccountError";
  }
}

/** A sensitive limit was exhausted inside a use case. */
export class RateLimitExceededError extends LaceError<"RATE_LIMITED"> {
  public constructor(public readonly retryAfterSeconds: number) {
    super("RATE_LIMITED", "Rate limit exceeded.");
    this.name = "RateLimitExceededError";
  }
}
