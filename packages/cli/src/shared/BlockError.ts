export class BlockError extends Error {
  public constructor(
    readonly code:
      | "BLOCK_USAGE"
      | "BLOCK_INPUT"
      | "BLOCK_REGISTRY"
      | "BLOCK_FRAMEWORK"
      | "BLOCK_CONFIG",
    message: string,
  ) {
    super(message);
    this.name = "BlockError";
  }
}
