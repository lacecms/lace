import type { ValidationPathSegment } from "@lacecms/content";

/** Identifies one block of one published entry in render failures. */
export interface BlockContext {
  readonly blockKey: string;
  readonly entryId: string;
  readonly modelKey: string;
}

/** Stable codes for render-core failures. */
export type LaceRenderErrorCode =
  | "block_version_mismatch"
  | "invalid_block_data"
  | "invalid_rich_text"
  | "unknown_block_type";

export interface LaceRenderErrorOptions extends ErrorOptions {
  readonly context?: BlockContext;
  readonly fieldPath?: readonly ValidationPathSegment[];
}

function formatFieldPath(path: readonly ValidationPathSegment[]): string {
  return path.reduce<string>((result, segment) => {
    if (typeof segment === "number") return `${result}[${segment}]`;
    return result.length === 0 ? segment : `${result}.${segment}`;
  }, "");
}

function describeFailure(
  detail: string,
  context: BlockContext | undefined,
  fieldPath: readonly ValidationPathSegment[],
): string {
  const location = fieldPath.length === 0 ? "" : ` at field ${formatFieldPath(fieldPath)}`;
  const subject =
    context === undefined
      ? "Cannot render rich text"
      : `Cannot render block ${context.blockKey} of model ${context.modelKey} entry ${context.entryId}`;
  return `${subject}${location}: ${detail}`;
}

/** Thrown when published content cannot be rendered with the site's definitions. */
export class LaceRenderError extends Error {
  public readonly code: LaceRenderErrorCode;
  public readonly context: BlockContext | undefined;
  public readonly fieldPath: readonly ValidationPathSegment[];

  public constructor(
    code: LaceRenderErrorCode,
    detail: string,
    options: LaceRenderErrorOptions = {},
  ) {
    const fieldPath = Object.freeze([...(options.fieldPath ?? [])]);
    super(
      describeFailure(detail, options.context, fieldPath),
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "LaceRenderError";
    this.code = code;
    this.context = options.context;
    this.fieldPath = fieldPath;
  }
}
