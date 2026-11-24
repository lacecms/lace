import { AuthenticationRequiredError } from "@lacecms/contracts";
import type { TokenSecurityPort } from "@lacecms/application";
import { authenticationChallenge } from "../routing/route-policy.js";
import { buildTokenVerification } from "../shared/application-input.js";

export async function requireBuildToken(
  authorization: string | undefined,
  verify: TokenSecurityPort["verifyBuildToken"],
): Promise<void> {
  if (
    !authorization?.startsWith("Bearer ") ||
    !(await verify(buildTokenVerification(authorization.slice("Bearer ".length))))
  ) {
    throw new AuthenticationRequiredError(authenticationChallenge("build"));
  }
}
