/**
 * The canonical origin, plus the other loopback hostname at the same scheme and
 * port only in local development. Shared by the session and import boundaries.
 */
export function trustedOrigins(origin: URL, production: boolean): string[] {
  const canonical = origin.origin;
  if (production || (origin.hostname !== "localhost" && origin.hostname !== "127.0.0.1")) {
    return [canonical];
  }
  const alternate = new URL(canonical);
  alternate.hostname = origin.hostname === "localhost" ? "127.0.0.1" : "localhost";
  return [canonical, alternate.origin];
}
