import type { ReportedLaceErrorCode, TolerantErrorEnvelope } from "@lacecms/contracts";

export class LaceSdkError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LaceSdkError";
  }
}

export class LaceTransportError extends LaceSdkError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LaceTransportError";
  }
}

export class LaceTimeoutError extends LaceTransportError {
  public constructor(timeoutMs: number) {
    super(`The Lace request timed out after ${timeoutMs}ms.`);
    this.name = "LaceTimeoutError";
  }
}

export class LaceHttpError extends LaceSdkError {
  /** A known Lace error code, or a code introduced by a newer API. */
  public readonly code: ReportedLaceErrorCode;
  public readonly details: TolerantErrorEnvelope["error"]["details"];
  public readonly status: number;

  public constructor(status: number, error: TolerantErrorEnvelope["error"]) {
    super(error.message);
    this.name = "LaceHttpError";
    this.code = error.code;
    this.details = error.details;
    this.status = status;
  }
}

export class LaceContractError extends LaceSdkError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LaceContractError";
  }
}

/** A malformed known manifest; never carries source values or URLs. */
export class LaceLinkManifestError extends LaceContractError {}

/** The API sent a build export in a format newer than this SDK supports. */
export class LaceUnsupportedExportFormatError extends LaceContractError {
  public readonly received: number;
  public readonly supported: number;

  public constructor(received: number, supported: number) {
    super(
      `The Lace API sent build-export format ${received}, but this @lacecms/sdk supports format ${supported} at most. Upgrade @lacecms/sdk to a release compatible with the Lace API.`,
    );
    this.name = "LaceUnsupportedExportFormatError";
    this.received = received;
    this.supported = supported;
  }
}
