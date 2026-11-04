import { expect, test } from "vitest";
import { InvariantError, LaceError } from "@lacecms/content";
import { errorMatrixCases } from "./error-matrix.js";

const codes: Readonly<Record<string, string>> = {
  FieldConfigurationError: "FIELD_CONFIGURATION_INVALID",
  ContractValidationError: "VALIDATION_FAILED",
  ContentValidationError: "VALIDATION_FAILED",
  BlockConfigurationError: "BLOCK_CONFIGURATION_INVALID",
  BlockMigrationError: "missing_step",
  ConfigurationError: "CONFIGURATION_INVALID",
  BuildExportVersionChangedError: "BUILD_EXPORT_VERSION_CHANGED",
  BuildExportCursorError: "CONTENT_INVALID_STATE",
  BlockOrderError: "CONTENT_INVALID_STATE",
  CollectionQueryValidationError: "CONTENT_INVALID_STATE",
  RateLimitExceededError: "RATE_LIMITED",
  InvariantError: "INTERNAL_INVARIANT",
  LaceError: "INTERNAL_PRIVATE",
};

test.each(errorMatrixCases.filter((c) => c.errorClass !== Error && c.errorClass !== TypeError))(
  "portable error keeps its code and name: $name",
  ({ create, name }) => {
    const error = create();
    expect(error).toBeInstanceOf(LaceError);
    expect((error as LaceError).code).toBe(codes[name] ?? name.split(":")[1]);
    expect(error.name).toBe(
      name === "CollectionQueryValidationError" ? "DomainError" : name.split(":")[0],
    );
  },
);

test("invariant errors retain the cause without changing their message", () => {
  const cause = new Error("private cause");
  const error = new InvariantError("Required capability unavailable.", { cause });
  expect(error.cause).toBe(cause);
  expect(error.message).toBe("Required capability unavailable.");
});
