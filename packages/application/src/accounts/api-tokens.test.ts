import { actorId, attenuateActor, unixMilliseconds } from "@lacecms/domain";
import { expect, test, vi } from "vitest";
import type {
  BuildTokenMetadata,
  ImportTokenMetadata,
  TokenSecurityPort,
} from "../ports/security.js";
import { opaqueTokenSecret } from "../shared/brands.js";
import { ApiTokenUseCases, describeImportCredential } from "./api-tokens.js";

const admin = { id: actorId("admin"), role: "admin" } as const;
const now = unixMilliseconds(1_000);
const secret = opaqueTokenSecret("test-token");
const build: BuildTokenMetadata = {
  id: "build",
  capabilities: ["content:build:read"],
  createdAt: now,
  name: "Build",
  tokenPrefix: "test",
};
const imported: ImportTokenMetadata = {
  id: "import",
  capabilities: ["content:import", "content:publish"],
  createdAt: now,
  createdBy: { id: admin.id, email: "admin@example.test" },
  expiresAt: unixMilliseconds(now + 86_400_000),
  name: "Import",
  tokenPrefix: "test",
};

function fixture() {
  const tokens = {
    listBuildTokens: vi.fn(async () => [build]),
    createBuildToken: vi.fn<TokenSecurityPort["createBuildToken"]>(async () => ({
      ...build,
      token: secret,
    })),
    revokeBuildToken: vi.fn<TokenSecurityPort["revokeBuildToken"]>(async ({ tokenId, now }) =>
      tokenId === build.id ? { ...build, revokedAt: now } : null,
    ),
    listImportTokens: vi.fn(async () => [imported]),
    createImportToken: vi.fn<TokenSecurityPort["createImportToken"]>(async () => ({
      ...imported,
      token: secret,
    })),
    revokeImportToken: vi.fn<TokenSecurityPort["revokeImportToken"]>(async ({ tokenId, now }) =>
      tokenId === imported.id ? { ...imported, revokedAt: now } : null,
    ),
  };
  return { tokens, useCases: new ApiTokenUseCases({ tokens, clock: { now: () => now } }) };
}

test("token commands use the composed clock and distinct credential ports", async () => {
  const { tokens, useCases } = fixture();
  await expect(useCases.issueBuildToken(admin, "Build")).resolves.toEqual({
    ...build,
    token: secret,
  });
  expect(tokens.createBuildToken).toHaveBeenCalledWith({ name: "Build", now });
  await expect(useCases.listBuildTokens(admin)).resolves.toEqual([build]);
  await expect(useCases.revokeBuildToken(admin, imported.id)).resolves.toBeNull();
  await expect(useCases.revokeBuildToken(admin, build.id)).resolves.toEqual({
    ...build,
    revokedAt: now,
  });
  expect(tokens.revokeBuildToken).toHaveBeenLastCalledWith({ tokenId: build.id, now });

  await expect(
    useCases.issueImportToken(admin, { name: "Import", allowPublish: true, expiresInDays: 1 }),
  ).resolves.toEqual({ ...imported, token: secret });
  expect(tokens.createImportToken).toHaveBeenCalledWith({
    name: "Import",
    capabilities: imported.capabilities,
    createdBy: admin.id,
    expiresAt: imported.expiresAt,
    now,
  });
  await expect(useCases.listImportTokens(admin)).resolves.toEqual([imported]);
  await expect(useCases.revokeImportToken(admin, build.id)).resolves.toBeNull();
  for (const attempt of [1, 2]) {
    await expect(useCases.revokeImportToken(admin, imported.id)).resolves.toEqual({
      ...imported,
      revokedAt: now,
    });
    expect(tokens.revokeImportToken).toHaveBeenNthCalledWith(attempt + 1, {
      tokenId: imported.id,
      now,
    });
  }
});

test("token management refuses underprivileged and delegated callers before port work", async () => {
  const { tokens, useCases } = fixture();
  const delegated = attenuateActor(admin, {
    permissions: ["settings:manage", "content:publish"],
    operations: [],
  });
  for (const actor of [delegated, { ...admin, role: "editor" as const }]) {
    const operations = [
      useCases.listBuildTokens(actor),
      useCases.issueBuildToken(actor, "Build"),
      useCases.revokeBuildToken(actor, build.id),
      useCases.listImportTokens(actor),
      useCases.issueImportToken(actor, { name: "Import", allowPublish: true, expiresInDays: 1 }),
      useCases.revokeImportToken(actor, imported.id),
    ];
    await Promise.all(
      operations.map((result) =>
        expect(result).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" }),
      ),
    );
  }
  await expect(
    useCases.issueImportToken(admin, { name: "Import", allowPublish: false, expiresInDays: 8 }),
  ).rejects.toThrow(RangeError);
  for (const port of Object.values(tokens)) expect(port).not.toHaveBeenCalled();
});

test("credential description derives permissions from the authenticated actor's current role and ceiling", () => {
  const actor = attenuateActor(
    { ...admin, role: "editor" },
    {
      permissions: ["content:read", "content:publish"],
      operations: [],
    },
  );
  expect(describeImportCredential({ actor, token: imported })).toEqual({
    permissions: ["content:read"],
    token: imported,
  });
});
