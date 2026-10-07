import { BlockList, isIP } from "node:net";
import { normalizeClientAddress } from "@lacecms/auth";

/** Validate configuration eagerly; never include supplied addresses in errors. */
export function trustedProxyPolicy(cidrs: readonly string[] = []): (address: string) => boolean {
  const networks = new BlockList();
  for (const cidr of cidrs) {
    const [address, rawPrefix, extra] = cidr.split("/");
    const version = isIP(address ?? "");
    const prefix = Number(rawPrefix);
    if (
      !version ||
      extra !== undefined ||
      rawPrefix === undefined ||
      !/^\d+$/u.test(rawPrefix) ||
      !Number.isInteger(prefix) ||
      prefix < 0 ||
      prefix > (version === 4 ? 32 : 128)
    ) {
      throw new TypeError("Invalid LACE_TRUSTED_PROXY_CIDRS.");
    }
    networks.addSubnet(address!, prefix, version === 4 ? "ipv4" : "ipv6");
  }
  return (address) => networks.check(address, isIP(address) === 4 ? "ipv4" : "ipv6");
}

export function resolveNodeClientAddress(
  request: Request,
  peer: string | undefined,
  trusted: (address: string) => boolean,
): string | undefined {
  const direct = normalizeClientAddress(peer);
  if (direct === undefined || !trusted(direct)) return direct;
  const raw = request.headers.get("x-forwarded-for");
  if (raw === null || raw.length > 4096) return direct;
  const chain = raw.split(",").map((value) => normalizeClientAddress(value.trim()));
  if (chain.length > 32 || chain.some((value) => value === undefined)) return direct;
  let current = direct;
  for (const next of chain.reverse()) {
    if (!trusted(current)) break;
    current = next!;
  }
  return current;
}
