import { SettingsUseCases, unconfiguredEmailSender } from "@lacecms/application";
import type { EmailSender, UserProfileReader } from "@lacecms/application";
import type { ReadinessProbe } from "./input.js";

export function composeSettings(input: {
  readonly configuredModels: number;
  readonly email?: EmailSender;
  readonly engineVersion: string;
  readonly mcpEnabled: boolean;
  readonly publicBaseUrl: string | undefined;
  readonly readiness: ReadinessProbe;
  readonly users: UserProfileReader | undefined;
}): SettingsUseCases {
  const { publicBaseUrl } = input;
  return new SettingsUseCases({
    configuredModels: input.configuredModels,
    email: input.email ?? unconfiguredEmailSender,
    engineVersion: input.engineVersion,
    isReady: () => input.readiness.isReady(),
    mcpEnabled: input.mcpEnabled,
    mcpEndpoint: () => (publicBaseUrl ? new URL("/mcp", publicBaseUrl).href : undefined),
    publicBaseUrl,
    users: input.users,
  });
}
