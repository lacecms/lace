/** A portable failure with a stable machine-readable code. */
export class LaceError<Code extends string = string> extends Error {
  public constructor(
    public readonly code: Code,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = "LaceError";
  }
}

/** A product guarantee or required runtime capability failed; never exposed. */
export class InvariantError extends LaceError<"INTERNAL_INVARIANT"> {
  public constructor(message: string, options?: { readonly cause?: unknown }) {
    super("INTERNAL_INVARIANT", message, options);
    this.name = "InvariantError";
  }
}
