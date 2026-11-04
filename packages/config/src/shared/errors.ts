import { LaceError } from "@lacecms/content";

/** Thrown when `lace.config.ts` contains an invalid or ambiguous definition. */
export class ConfigurationError extends LaceError<"CONFIGURATION_INVALID"> {
  public constructor(message: string) {
    super("CONFIGURATION_INVALID", message);
    this.name = "ConfigurationError";
  }
}

export function fail(message: string): never {
  throw new ConfigurationError(message);
}
