import { LaceError } from "@lacecms/content";

export class AuthenticationRequiredError extends LaceError<"AUTHENTICATION_REQUIRED"> {
  public constructor(public readonly challenge: "bearer" | "session" | "session-or-bearer") {
    super("AUTHENTICATION_REQUIRED", "Authentication is required.");
    this.name = "AuthenticationRequiredError";
  }
}
