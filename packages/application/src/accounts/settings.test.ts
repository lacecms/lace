import { actorId, attenuateActor } from "@lacecms/domain";
import { expect, test, vi } from "vitest";
import type { EmailSender } from "./email.js";
import { SettingsUseCases } from "./settings.js";

test("settings operations authorize before contacting readiness, profiles or email", async () => {
  const admin = { id: actorId("admin"), role: "admin" } as const;
  const isReady = vi.fn(async () => false);
  const readUserProfile = vi.fn(async () => ({ disabled: false, email: "admin@example.test" }));
  const send = vi.fn<EmailSender["send"]>(async () => ({ status: "sent" }));
  const settings = new SettingsUseCases({
    configuredModels: 2,
    email: { provider: "smtp", from: "cms@example.test", send },
    engineVersion: "0.1.0-rc5",
    isReady,
    mcpEnabled: true,
    mcpEndpoint: () => "https://cms.example.test/mcp",
    publicBaseUrl: "https://cms.example.test/",
    users: { readUserProfile },
  });
  const delegated = attenuateActor(admin, { permissions: ["settings:manage"], operations: [] });
  for (const actor of [{ ...admin, role: "editor" as const }, delegated]) {
    await expect(settings.readStatus(actor)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    await expect(
      settings.sendTestEmail(actor, "https://request.example.test"),
    ).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
  }
  expect(isReady).not.toHaveBeenCalled();
  expect(readUserProfile).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();

  await expect(settings.readStatus(admin)).resolves.toEqual({
    configuredModels: 2,
    email: { provider: "smtp", from: "cms@example.test" },
    engineVersion: "0.1.0-rc5",
    mcp: { enabled: true, endpoint: "https://cms.example.test/mcp" },
    ready: false,
  });
  expect(readUserProfile).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  await expect(settings.sendTestEmail(admin, "https://request.example.test")).resolves.toEqual({
    status: "sent",
  });
  expect(readUserProfile).toHaveBeenCalledWith(admin.id);
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "admin@example.test",
      text: expect.stringContaining("https://cms.example.test/"),
    }),
  );
});
