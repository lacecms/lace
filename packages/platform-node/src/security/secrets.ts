import { createHash, randomBytes } from "node:crypto";
import { opaqueTokenSecret, type OpaqueTokenSecret } from "@lacecms/application";

/** SHA-256 hex digest under which tokens are stored and compared. */
export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** A fresh 256-bit opaque token, base64url encoded. */
export function tokenSecret(): OpaqueTokenSecret {
  return opaqueTokenSecret(randomBytes(32).toString("base64url"));
}
