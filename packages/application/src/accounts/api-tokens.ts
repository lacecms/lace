import type { Actor } from "@lacecms/domain";
import type { Clock } from "../ports/infrastructure.js";
import type { ImportTokenMetadata, TokenSecurityPort } from "../ports/security.js";
import { effectiveActorPermissions, requireSessionActor } from "../shared/permissions.js";
import { importTokenCapabilities, importTokenExpiry } from "./import-tokens.js";

type ApiTokenAdministrationPort = Pick<
  TokenSecurityPort,
  | "listBuildTokens"
  | "createBuildToken"
  | "revokeBuildToken"
  | "listImportTokens"
  | "createImportToken"
  | "revokeImportToken"
>;

export class ApiTokenUseCases {
  public constructor(
    private readonly input: { readonly clock: Clock; readonly tokens: ApiTokenAdministrationPort },
  ) {}

  public async listBuildTokens(actor: Actor) {
    requireSessionActor(actor, "settings:manage");
    return this.input.tokens.listBuildTokens();
  }

  public async issueBuildToken(actor: Actor, name: string) {
    requireSessionActor(actor, "settings:manage");
    return this.input.tokens.createBuildToken({ name, now: this.input.clock.now() });
  }

  public async revokeBuildToken(actor: Actor, tokenId: string) {
    requireSessionActor(actor, "settings:manage");
    return this.input.tokens.revokeBuildToken({ tokenId, now: this.input.clock.now() });
  }

  public async listImportTokens(actor: Actor) {
    requireSessionActor(actor, "settings:manage");
    return this.input.tokens.listImportTokens();
  }

  public async issueImportToken(
    actor: Actor,
    request: {
      readonly name: string;
      readonly expiresInDays: number;
      readonly allowPublish: boolean;
    },
  ) {
    requireSessionActor(actor);
    const capabilities = importTokenCapabilities(actor, request.allowPublish);
    const now = this.input.clock.now();
    return this.input.tokens.createImportToken({
      capabilities,
      createdBy: actor.id,
      expiresAt: importTokenExpiry(now, request.expiresInDays),
      name: request.name,
      now,
    });
  }

  public async revokeImportToken(actor: Actor, tokenId: string) {
    requireSessionActor(actor, "settings:manage");
    return this.input.tokens.revokeImportToken({ tokenId, now: this.input.clock.now() });
  }
}

/** Projects the pair supplied by successful import authentication. */
export function describeImportCredential(input: {
  readonly actor: Actor;
  readonly token: ImportTokenMetadata;
}) {
  return { token: input.token, permissions: effectiveActorPermissions(input.actor) };
}
