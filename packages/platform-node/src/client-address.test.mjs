import { expect, test } from "vitest";
import { normalizeClientAddress, TrustedClientAddresses } from "@lacecms/auth";
import { resolveNodeClientAddress, trustedProxyPolicy } from "../dist/index.js";

const request = (chain) =>
  new Request("https://cms.test/api/auth/sign-in/email", {
    headers: { "x-forwarded-for": chain, "x-lace-client-address": "192.0.2.99" },
  });

test("direct callers cannot select identity with any forwarding header", () => {
  for (const chain of ["192.0.2.1", "192.0.2.2, 10.0.0.1", "invalid"]) {
    expect(
      resolveNodeClientAddress(request(chain), "::ffff:198.51.100.1", trustedProxyPolicy()),
    ).toBe("198.51.100.1");
  }
  const identities = new TrustedClientAddresses();
  const spoof = request("192.0.2.1");
  expect(identities.get(spoof)).toBe("0.0.0.0");
  identities.set(spoof, "198.51.100.1");
  expect(identities.get(spoof)).toBe("198.51.100.1");
});

test("trusted chain walks right to left and stops before forged prefixes", () => {
  const trusted = trustedProxyPolicy(["10.0.0.0/8", "2001:db8:1::/48"]);
  expect(
    resolveNodeClientAddress(request("192.0.2.99, 198.51.100.1, 10.1.1.1"), "10.2.2.2", trusted),
  ).toBe("198.51.100.1");
  expect(
    resolveNodeClientAddress(request("2001:db8:2::1, 2001:db8:1::2"), "2001:db8:1::1", trusted),
  ).toBe("2001:db8:2::1");
  expect(resolveNodeClientAddress(request("invalid, 198.51.100.1"), "10.1.1.1", trusted)).toBe(
    "10.1.1.1",
  );
  expect(resolveNodeClientAddress(request("198.51.100.1"), undefined, trusted)).toBeUndefined();
});

test("strict address syntax and proxy settings reject ambiguous or secret-bearing input", () => {
  for (const value of [
    "",
    "unknown",
    "127.1",
    "010.0.0.1",
    "1.2.3.999",
    "1.2.3.4:80",
    "::1%lo",
    "::1,::2",
  ])
    expect(normalizeClientAddress(value)).toBeUndefined();
  expect(normalizeClientAddress("2001:0db8:0000::1")).toBe("2001:db8::1");
  for (const value of ["secret", "10.0.0.1", "10.0.0.0/33", "::/129", "10.0.0.1/0/secret", ""])
    expect(() => trustedProxyPolicy([value])).toThrow(/^Invalid LACE_TRUSTED_PROXY_CIDRS\.$/u);
});
