import { authUsers, authSessions, authAccounts, authVerifications } from "./auth.js";
import {
  oauthClient,
  oauthResource,
  oauthClientResource,
  oauthRefreshToken,
  oauthAccessToken,
  oauthConsent,
  oauthClientAssertion,
} from "./oauth.js";

/** Tables supplied to Better Auth's Drizzle adapter under its canonical names. */
export const betterAuthSchema = Object.freeze({
  account: authAccounts,
  session: authSessions,
  user: authUsers,
  verification: authVerifications,
  oauthClient,
  oauthResource,
  oauthClientResource,
  oauthRefreshToken,
  oauthAccessToken,
  oauthConsent,
  oauthClientAssertion,
});
