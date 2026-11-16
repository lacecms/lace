import type {
  LoadContentEntryUseCaseInput,
  MediaUseCases,
  PublicContentReadPort,
  TokenSecurityPort,
  UnpublishContentEntryUseCaseInput,
} from "@lacecms/application";

// The REST validators have checked these identifiers before they cross the port.
export function entryId(value: string): LoadContentEntryUseCaseInput["entryId"] {
  return value as LoadContentEntryUseCaseInput["entryId"];
}

export function mediaId(value: string): Parameters<MediaUseCases["get"]>[0]["mediaId"] {
  return value as Parameters<MediaUseCases["get"]>[0]["mediaId"];
}

export function snapshotId(
  value: string,
): UnpublishContentEntryUseCaseInput["expectedPublishedSnapshotId"] {
  return value as UnpublishContentEntryUseCaseInput["expectedPublishedSnapshotId"];
}

export function configuredModelKey(
  value: string,
): Parameters<PublicContentReadPort["loadPublicGlobal"]>[0] {
  // The validated route key has matched a model in the server configuration.
  return value as Parameters<PublicContentReadPort["loadPublicGlobal"]>[0];
}

type BuildTokenVerification = Parameters<TokenSecurityPort["verifyBuildToken"]>[0];

export function buildTokenVerification(token: string): BuildTokenVerification {
  // Forward the Bearer candidate verbatim. The verifier owns credential validation.
  return {
    now: Date.now() as BuildTokenVerification["now"],
    token: token as BuildTokenVerification["token"],
  };
}
