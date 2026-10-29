import { DomainError, type Actor } from "@lacecms/domain";
import type { Clock } from "./index.js";
/** Portable durable OAuth lifecycle values. Provider SDK objects stay in auth. */
export interface OAuthGrant {
  readonly id: string;
  readonly userId: string;
  readonly clientId: string;
  readonly resource: string;
  readonly scopes: readonly string[];
  readonly generation: number;
  readonly userGeneration: number;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly revokedAt: number | null;
}
export interface OAuthIssuance {
  readonly id: string;
  readonly grantId: string;
  readonly kind: "code" | "refresh";
  readonly familyGeneration: number;
  readonly userGeneration: number;
}
export interface OAuthPreparedToken {
  readonly id: string;
  readonly kind: "access" | "refresh";
  readonly hash: string;
  readonly clientId: string;
  readonly userId: string;
  readonly sessionId: string | null;
  readonly authorizationCodeId: string | null;
  readonly refreshId: string | null;
  readonly scopes: readonly string[];
  readonly resources: readonly string[];
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly authTime: number | null;
}
export interface OAuthAuthority {
  readonly grant: OAuthGrant;
  readonly providerId: string;
  readonly role: string;
  readonly expiresAt: number;
}
export interface OAuthConnection extends OAuthGrant {
  readonly clientName: string;
  readonly lastUsedAt?: number;
}
export interface OAuthConnectionPort {
  listConnections(
    userId: string,
    after: string | undefined,
    limit: number,
  ): Promise<readonly OAuthConnection[]>;
  revokeConnection(userId: string, grantId: string, now: number): Promise<boolean>;
  invalidateUser(userId: string, now: number): Promise<void>;
}
export interface OAuthIssuancePersistence extends OAuthConnectionPort {
  userGeneration(userId: string): Promise<number | null>;
  createGrant(input: Omit<OAuthGrant, "generation" | "revokedAt">): Promise<boolean>;
  grant(id: string, now: number): Promise<OAuthGrant | null>;
  claim(input: {
    readonly id: string;
    readonly kind: "code" | "refresh";
    readonly grantId: string;
    readonly providerId: string;
    readonly inputHash: string;
    readonly clientId: string;
    readonly now: number;
  }): Promise<OAuthIssuance | null>;
  prepare(attempt: OAuthIssuance, token: OAuthPreparedToken, now: number): Promise<boolean>;
  commit(
    attempt: OAuthIssuance,
    expected: readonly { readonly kind: "access" | "refresh"; readonly id: string }[],
    now: number,
  ): Promise<boolean>;
  abort(attempt: OAuthIssuance, now: number): Promise<void>;
  revokeFamily(grantId: string, now: number): Promise<void>;
  revokeReplay(inputHash: string, clientId: string, now: number): Promise<void>;
  authority(
    kind: "access" | "refresh",
    hash: string,
    clientId: string | undefined,
    now: number,
  ): Promise<OAuthAuthority | null>;
  cleanup(now: number, limit: number): Promise<void>;
}

/** Session-only credential management; ownership is enforced again by persistence. */
export class OAuthConnectionUseCases {
  public constructor(
    private readonly input: { readonly connections: OAuthConnectionPort; readonly clock: Clock },
  ) {}
  public list(
    actor: Actor,
    query: { readonly after?: string; readonly limit: number },
  ): Promise<readonly OAuthConnection[]> {
    this.sessionAuthority(actor);
    return this.input.connections.listConnections(actor.id, query.after, query.limit);
  }
  public revoke(actor: Actor, connectionId: string): Promise<boolean> {
    this.sessionAuthority(actor);
    return this.input.connections.revokeConnection(
      actor.id,
      connectionId,
      Number(this.input.clock.now()),
    );
  }
  private sessionAuthority(actor: Actor): void {
    if (actor.authority !== undefined)
      throw new DomainError("AUTHORIZATION_DENIED", "A browser session is required.");
  }
}
