import { expect, test } from "vitest";
import {
  actorDisplayName,
  foldAscii,
  dispatcherEventId,
  dispatcherLeaseId,
  opaqueCursor,
  opaqueTokenSecret,
  opaqueTokenVerifier,
  packageName,
  publicationIdempotencyKey,
  publicationRequestFingerprint,
} from "./index.js";

test("exports its package identity", () => expect(packageName).toBe("@lacecms/application"));

test("brands portable opaque values without exposing runtime dependencies", () => {
  expect(opaqueCursor("next-page")).toBe("next-page");
  expect(opaqueTokenSecret("secret")).toBe("secret");
  expect(opaqueTokenVerifier("verifier")).toBe("verifier");
  expect(dispatcherEventId("event-1")).toBe("event-1");
  expect(dispatcherLeaseId("lease-1")).toBe("lease-1");
  expect(publicationIdempotencyKey("publish-1")).toBe("publish-1");
  expect(publicationRequestFingerprint("sha256:abc")).toBe("sha256:abc");
  expect(() => opaqueCursor("")).toThrow(TypeError);
});

test("resolves portable actor display names and ASCII-only search folding", () => {
  expect(actorDisplayName("user-1", "  Ada  ")).toBe("Ada");
  expect(actorDisplayName("user-1", "   ")).toBe("Unknown user");
  expect(actorDisplayName("user-1", null)).toBe("Unknown user");
  expect(actorDisplayName("system:content-sync")).toBe("System");
  expect(foldAscii("Launch ÄÖ Q")).toBe("launch ÄÖ q");
});
