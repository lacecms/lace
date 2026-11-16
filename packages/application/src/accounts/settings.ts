import { InvariantError } from "@lacecms/content";
import type { Actor } from "@lacecms/domain";
import type { UserProfileReader } from "../ports/security.js";
import { requireSessionActor } from "../shared/permissions.js";
import { emailDeliveryStatus, sendTestEmail, type EmailSender } from "./email.js";

export class SettingsUseCases {
  public constructor(
    private readonly input: {
      readonly configuredModels: number;
      readonly email: EmailSender;
      readonly engineVersion: string;
      readonly isReady: () => Promise<boolean>;
      readonly mcpEnabled: boolean;
      readonly mcpEndpoint: () => string | undefined;
      readonly publicBaseUrl: string | undefined;
      readonly users: UserProfileReader | undefined;
    },
  ) {}

  public async readStatus(actor: Actor) {
    requireSessionActor(actor, "settings:manage");
    const { configuredModels, email, engineVersion, mcpEnabled } = this.input;
    const endpoint = this.input.mcpEndpoint();
    if (endpoint === undefined) throw new InvariantError("Canonical public URL is unavailable.");
    return {
      configuredModels,
      email: emailDeliveryStatus(email),
      engineVersion,
      mcp: { enabled: mcpEnabled, endpoint },
      ready: await this.input.isReady(),
    };
  }

  public sendTestEmail(actor: Actor, fallbackOrigin: string) {
    return sendTestEmail({
      actor,
      email: this.input.email,
      installationUrl: this.input.publicBaseUrl ?? fallbackOrigin,
      users: this.input.users,
    });
  }
}
