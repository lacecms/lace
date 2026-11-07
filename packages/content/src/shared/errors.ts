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

// Extracted field and validation errors.

/** Thrown when a field builder receives a non-portable or contradictory option. */
export class FieldConfigurationError extends LaceError<"FIELD_CONFIGURATION_INVALID"> {
  public constructor(message: string) {
    super("FIELD_CONFIGURATION_INVALID", message);
    this.name = "FieldConfigurationError";
  }
}

export function fail(path: string, message: string): never {
  throw new FieldConfigurationError(`${path} ${message}`);
}

/** A stable path segment for validation errors. */
export type ValidationPathSegment = number | string;

/** A portable validation error that callers can associate with form values. */
export interface ContentValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: readonly ValidationPathSegment[];
}

/** Thrown when submitted content fails a portable validation contract. */
export class ContentValidationError extends LaceError<"VALIDATION_FAILED"> {
  public readonly issues: readonly ContentValidationIssue[];

  public constructor(issues: readonly ContentValidationIssue[]) {
    super(
      "VALIDATION_FAILED",
      issues.map((issue) => `${formatValidationPath(issue.path)} ${issue.message}`).join("; "),
    );
    this.name = "ContentValidationError";
    this.issues = issues;
  }
}

function formatValidationPath(path: readonly ValidationPathSegment[]): string {
  if (path.length === 0) {
    return "$";
  }

  return path.reduce<string>((result, segment) => {
    return typeof segment === "number" ? `${result}[${segment}]` : `${result}.${segment}`;
  }, "$");
}

export function invalid(
  path: readonly ValidationPathSegment[],
  code: string,
  message: string,
): never {
  throw new ContentValidationError([{ code, message, path }]);
}

export function assertExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: readonly ValidationPathSegment[],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      invalid([...path, key], "unknown_key", "is not permitted.");
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      invalid([...path, key], "missing_key", "is required.");
    }
  }
}
