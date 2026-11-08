import { LaceError } from "../shared/errors.js";

/** Thrown when a block definition or registry is not portable or internally consistent. */
export class BlockConfigurationError extends LaceError<"BLOCK_CONFIGURATION_INVALID"> {
  public constructor(message: string) {
    super("BLOCK_CONFIGURATION_INVALID", message);
    this.name = "BlockConfigurationError";
  }
}

export function blockFail(message: string): never {
  throw new BlockConfigurationError(message);
}
