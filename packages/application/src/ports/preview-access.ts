import type { UnixMilliseconds } from "@lacecms/domain";
import type { PreviewObject } from "./preview.js";

export const PREVIEW_HANDOFF_SECONDS = 60;
const generation = "[A-Za-z0-9_-]{1,128}";
const viewerPath = new RegExp(`^/view/(${generation})(?![\\s\\S])`, "u");
const pagePath = new RegExp(`^/p/(${generation})/(?![\\s\\S])`, "u");

export function previewReturnGeneration(path: string): string | undefined {
  return viewerPath.exec(path)?.[1] ?? pagePath.exec(path)?.[1];
}

export function isPreviewAccessToken(value: string): boolean {
  return /^[0-9a-f]{64}(?![\s\S])/u.test(value);
}

export interface PreviewAccessOrigins {
  readonly adminOrigin: string;
  readonly previewOrigin: string;
}

export interface PreviewHandoff extends PreviewAccessOrigins {
  readonly id: string;
  readonly browserHash: string;
  readonly returnPath: string;
  readonly generationId: string;
  readonly expiresAt: UnixMilliseconds;
}

export interface PreviewDelivery {
  readonly revision: number;
  readonly expiresAt: UnixMilliseconds;
  readonly manifest: PreviewObject;
}

export interface PreviewAccessPort {
  readonly authorizeHandoff: (
    input: PreviewHandoff & {
      readonly sessionId: string;
      readonly userId: string;
      readonly codeHash: string;
      readonly now: UnixMilliseconds;
    },
  ) => Promise<boolean>;
  readonly redeemHandoff: (
    input: PreviewAccessOrigins & {
      readonly id: string;
      readonly browserHash: string;
      readonly codeHash: string;
      readonly tokenHash: string;
      readonly now: UnixMilliseconds;
    },
  ) => Promise<{ readonly returnPath: string; readonly expiresAt: UnixMilliseconds } | null>;
  readonly previewDelivery: (
    tokenHash: string,
    origin: string,
    id: string,
    now: UnixMilliseconds,
  ) => Promise<PreviewDelivery | "denied" | null>;
}

export type PreviewAuthorization =
  | { readonly kind: "invalid" | "denied" }
  | { readonly kind: "login"; readonly returnPath: string }
  | {
      readonly kind: "issued";
      readonly id: string;
      readonly code: string;
      readonly generationId: string;
    };

export interface PreviewBrowserAccess<Request> extends PreviewAccessOrigins {
  readonly start: (returnPath: string) => Promise<{
    readonly id: string;
    readonly nonce: string;
    readonly state: string;
  } | null>;
  readonly authorize: (request: Request, state: string) => Promise<PreviewAuthorization>;
  readonly redeem: (
    id: string,
    code: string,
    nonce: string,
  ) => Promise<{
    readonly returnPath: string;
    readonly expiresAt: UnixMilliseconds;
    readonly value: string;
  } | null>;
  readonly delivery: (value: string, id: string) => Promise<PreviewDelivery | "denied" | null>;
}
