import type { AccountSessionDto } from "@lacecms/contracts";

/** A session's browser and operating system in words, e.g. "Firefox on Linux". */
export function sessionLabel(session: Pick<AccountSessionDto, "browser" | "os">): string {
  const browser = session.browser === "Unknown" ? "Unknown browser" : session.browser;
  const os = session.os === "Unknown" ? "an unknown system" : session.os;
  return `${browser} on ${os}`;
}
