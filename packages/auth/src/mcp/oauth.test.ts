import { expect, test } from "vitest";
import { mcpAuthorizationMetadata, mcpResourceMetadata, normalizeMcpScopes } from "./oauth.js";

test("publication scopes normalize in canonical order and both metadata documents advertise them", () => {
  expect(normalizeMcpScopes("content:publish offline_access content:publish")).toEqual([
    "content:read",
    "content:write",
    "content:publish",
    "offline_access",
  ]);
  expect(normalizeMcpScopes("content:write")).toEqual(["content:read", "content:write"]);
  expect(normalizeMcpScopes("content:read")).toEqual(["content:read"]);
  for (const scope of ["offline_access", "content:delete", "content:publish unknown", ""])
    expect(() => normalizeMcpScopes(scope)).toThrow();
  for (const metadata of [mcpAuthorizationMetadata, mcpResourceMetadata])
    expect(metadata(new URL("https://cms.test"), true)["scopes_supported"]).toEqual([
      "content:read",
      "content:write",
      "content:publish",
      "offline_access",
    ]);
});
