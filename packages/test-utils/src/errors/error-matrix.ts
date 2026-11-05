import {
  LaceError,
  InvariantError,
  FieldConfigurationError,
  ContentValidationError,
  BlockConfigurationError,
  BlockMigrationError,
} from "@lacecms/content";
import { ConfigurationError } from "@lacecms/config";
import {
  DomainError,
  BuildExportVersionChangedError,
  BuildExportCursorError,
  BlockOrderError,
  CollectionQueryValidationError,
  StaleSynchronizationError,
} from "@lacecms/domain";
import {
  AccountError,
  ObjectStorageError,
  RateLimitExceededError,
  RuntimeConfigurationError,
} from "@lacecms/application";
import { ContractValidationError } from "@lacecms/contracts";
import type { ClassifiedError } from "@lacecms/contracts";

export interface ErrorMatrixCase {
  readonly name: string;
  readonly errorClass: Function;
  readonly create: () => Error;
  readonly expected: ClassifiedError;
}
export const errorMatrixCases: readonly ErrorMatrixCase[] = [
  {
    name: "DomainError:AUTHORIZATION_DENIED",
    errorClass: DomainError,
    create: () => new DomainError("AUTHORIZATION_DENIED", "private domain detail"),
    expected: {
      body: {
        error: {
          code: "AUTHORIZATION_DENIED",
          message: "The actor is not permitted to perform this operation.",
        },
      },
      status: 403,
    },
  },
  {
    name: "DomainError:BUILD_EXPORT_VERSION_CHANGED",
    errorClass: DomainError,
    create: () => new DomainError("BUILD_EXPORT_VERSION_CHANGED", "private domain detail"),
    expected: {
      body: {
        error: {
          code: "BUILD_EXPORT_VERSION_CHANGED",
          message:
            "Published content changed during the build export. Restart from the first page.",
        },
      },
      status: 409,
    },
  },
  {
    name: "DomainError:CONTENT_INVALID_STATE",
    errorClass: DomainError,
    create: () => new DomainError("CONTENT_INVALID_STATE", "private domain detail"),
    expected: {
      body: {
        error: {
          code: "CONTENT_INVALID_STATE",
          message: "The requested content operation is invalid.",
        },
      },
      status: 422,
    },
  },
  {
    name: "DomainError:CONTENT_LINKS_IN_USE",
    errorClass: DomainError,
    create: () => new DomainError("CONTENT_LINKS_IN_USE", "private domain detail"),
    expected: {
      body: {
        error: {
          code: "CONTENT_LINKS_IN_USE",
          message:
            "Published links use this destination. Review the current link impact before removal.",
        },
      },
      status: 409,
    },
  },
  {
    name: "DomainError:CONTENT_LINK_IMPACT_CHANGED",
    errorClass: DomainError,
    create: () => new DomainError("CONTENT_LINK_IMPACT_CHANGED", "private domain detail"),
    expected: {
      body: {
        error: {
          code: "CONTENT_LINK_IMPACT_CHANGED",
          message: "Link impact changed. Refresh and review it again.",
        },
      },
      status: 409,
    },
  },
  {
    name: "DomainError:CONTENT_MODEL_CARDINALITY_CONFLICT",
    errorClass: DomainError,
    create: () => new DomainError("CONTENT_MODEL_CARDINALITY_CONFLICT", "private domain detail"),
    expected: {
      body: {
        error: {
          code: "CONTENT_MODEL_CARDINALITY_CONFLICT",
          message: "The content model cannot accept another entry.",
        },
      },
      status: 409,
    },
  },
  {
    name: "DomainError:CONTENT_NOT_PUBLISHED",
    errorClass: DomainError,
    create: () => new DomainError("CONTENT_NOT_PUBLISHED", "private domain detail"),
    expected: {
      body: { error: { code: "CONTENT_NOT_PUBLISHED", message: "The entry is not published." } },
      status: 409,
    },
  },
  {
    name: "DomainError:CONTENT_PAGE_SINGLETON",
    errorClass: DomainError,
    create: () => new DomainError("CONTENT_PAGE_SINGLETON", "private domain detail"),
    expected: {
      body: {
        error: {
          code: "CONTENT_PAGE_SINGLETON",
          message: "Page and global entries are defined by configuration.",
        },
      },
      status: 409,
    },
  },
  {
    name: "DomainError:CONTENT_PUBLISHED_IMMUTABLE",
    errorClass: DomainError,
    create: () => new DomainError("CONTENT_PUBLISHED_IMMUTABLE", "private domain detail"),
    expected: {
      body: {
        error: {
          code: "CONTENT_PUBLISHED_IMMUTABLE",
          message: "Published content cannot be modified.",
        },
      },
      status: 409,
    },
  },
  {
    name: "DomainError:CONTENT_REVISION_CONFLICT",
    errorClass: DomainError,
    create: () => new DomainError("CONTENT_REVISION_CONFLICT", "private domain detail"),
    expected: {
      body: {
        error: {
          code: "CONTENT_REVISION_CONFLICT",
          message: "The draft was modified by another request.",
        },
      },
      status: 409,
    },
  },
  {
    name: "DomainError:CONTENT_ROUTE_CONFLICT",
    errorClass: DomainError,
    create: () => new DomainError("CONTENT_ROUTE_CONFLICT", "private domain detail"),
    expected: {
      body: {
        error: { code: "CONTENT_ROUTE_CONFLICT", message: "The public route is already in use." },
      },
      status: 409,
    },
  },
  {
    name: "DomainError:LAST_ADMIN_PROTECTED",
    errorClass: DomainError,
    create: () => new DomainError("LAST_ADMIN_PROTECTED", "private domain detail"),
    expected: {
      body: {
        error: {
          code: "LAST_ADMIN_PROTECTED",
          message: "The final active administrator cannot be disabled or demoted.",
        },
      },
      status: 409,
    },
  },
  {
    name: "DomainError:MEDIA_IN_USE",
    errorClass: DomainError,
    create: () => new DomainError("MEDIA_IN_USE", "private domain detail"),
    expected: {
      body: { error: { code: "MEDIA_IN_USE", message: "The media is still used by content." } },
      status: 409,
    },
  },
  {
    name: "DomainError:MEDIA_UPDATE_CONFLICT",
    errorClass: DomainError,
    create: () => new DomainError("MEDIA_UPDATE_CONFLICT", "private domain detail"),
    expected: {
      body: {
        error: {
          code: "MEDIA_UPDATE_CONFLICT",
          message: "The media was modified by another request.",
        },
      },
      status: 409,
    },
  },
  {
    name: "BuildExportVersionChangedError",
    errorClass: BuildExportVersionChangedError,
    create: () => new BuildExportVersionChangedError(7, 8),
    expected: {
      body: {
        error: {
          code: "BUILD_EXPORT_VERSION_CHANGED",
          message:
            "Published content changed during the build export. Restart from the first page.",
          details: { actualVersion: 8, expectedVersion: 7 },
        },
      },
      status: 409,
    },
  },
  {
    name: "BuildExportCursorError",
    errorClass: BuildExportCursorError,
    create: () => new BuildExportCursorError("private cursor detail"),
    expected: {
      body: {
        error: {
          code: "CONTENT_INVALID_STATE",
          message: "The requested content operation is invalid.",
        },
      },
      status: 422,
    },
  },
  {
    name: "BlockOrderError",
    errorClass: BlockOrderError,
    create: () => new BlockOrderError(2, "unsafe-key"),
    expected: {
      body: {
        error: {
          code: "CONTENT_INVALID_STATE",
          message:
            "Block at index 2 has an invalid position. Positions must be positive safe integers in strictly increasing order. Resubmit positions in the displayed block order.",
        },
      },
      status: 422,
    },
  },
  {
    name: "CollectionQueryValidationError",
    errorClass: CollectionQueryValidationError,
    create: () => new CollectionQueryValidationError("/filters/0"),
    expected: {
      body: {
        error: {
          code: "VALIDATION_FAILED",
          message: "The request did not satisfy the API contract.",
          details: {
            issues: [
              {
                code: "invalid_value",
                message: "The submitted value is invalid.",
                path: "/filters/0",
              },
            ],
          },
        },
      },
      status: 422,
    },
  },
  {
    name: "StaleSynchronizationError",
    errorClass: StaleSynchronizationError,
    create: () => new StaleSynchronizationError("Configuration synchronization plan is stale."),
    expected: {
      body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
      status: 500,
    },
  },
  {
    name: "ObjectStorageError",
    errorClass: ObjectStorageError,
    create: () => new ObjectStorageError("Object storage operation failed."),
    expected: {
      body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
      status: 500,
    },
  },
  {
    name: "RuntimeConfigurationError",
    errorClass: RuntimeConfigurationError,
    create: () => new RuntimeConfigurationError("Invalid runtime environment: PRIVATE_VARIABLE."),
    expected: {
      body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
      status: 500,
    },
  },
  {
    name: "AccountError:CONFLICT",
    errorClass: AccountError,
    create: () => new AccountError("CONFLICT"),
    expected: {
      body: {
        error: { code: "CONFLICT", message: "The request conflicts with the current state." },
      },
      status: 409,
    },
  },
  {
    name: "AccountError:INVALID_CREDENTIALS",
    errorClass: AccountError,
    create: () => new AccountError("INVALID_CREDENTIALS"),
    expected: {
      body: {
        error: { code: "INVALID_CREDENTIALS", message: "The current password is incorrect." },
      },
      status: 400,
    },
  },
  {
    name: "AccountError:INVITATION_INVALID",
    errorClass: AccountError,
    create: () => new AccountError("INVITATION_INVALID"),
    expected: {
      body: {
        error: { code: "INVITATION_INVALID", message: "The invitation is invalid or has expired." },
      },
      status: 410,
    },
  },
  {
    name: "AccountError:NOT_FOUND",
    errorClass: AccountError,
    create: () => new AccountError("NOT_FOUND"),
    expected: {
      body: { error: { code: "NOT_FOUND", message: "The requested resource was not found." } },
      status: 404,
    },
  },
  {
    name: "AccountError:RESET_INVALID",
    errorClass: AccountError,
    create: () => new AccountError("RESET_INVALID"),
    expected: {
      body: {
        error: {
          code: "RESET_INVALID",
          message: "The password reset link is invalid or has expired.",
        },
      },
      status: 410,
    },
  },
  {
    name: "RateLimitExceededError",
    errorClass: RateLimitExceededError,
    create: () => new RateLimitExceededError(1.2),
    expected: {
      body: { error: { code: "RATE_LIMITED", message: "Too many requests were received." } },
      status: 429,
      headers: { "retry-after": "2" },
    },
  },
  {
    name: "ContentValidationError",
    errorClass: ContentValidationError,
    create: () =>
      new ContentValidationError([
        { code: "required", message: "Value is required.", path: ["fields", "title"] },
      ]),
    expected: {
      body: {
        error: {
          code: "VALIDATION_FAILED",
          message: "The request did not satisfy the API contract.",
          details: {
            issues: [{ code: "required", message: "Value is required.", path: "/fields/title" }],
          },
        },
      },
      status: 422,
    },
  },
  {
    name: "FieldConfigurationError",
    errorClass: FieldConfigurationError,
    create: () => new FieldConfigurationError("private definition detail"),
    expected: {
      body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
      status: 500,
    },
  },
  {
    name: "BlockConfigurationError",
    errorClass: BlockConfigurationError,
    create: () => new BlockConfigurationError("private definition detail"),
    expected: {
      body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
      status: 500,
    },
  },
  {
    name: "ConfigurationError",
    errorClass: ConfigurationError,
    create: () => new ConfigurationError("private definition detail"),
    expected: {
      body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
      status: 500,
    },
  },
  {
    name: "BlockMigrationError",
    errorClass: BlockMigrationError,
    create: () => new BlockMigrationError("missing_step", "hero", 1, 2, "private migration detail"),
    expected: {
      body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
      status: 500,
    },
  },
  {
    name: "Error",
    errorClass: Error,
    create: () => new Error("SQL SELECT private-credential"),
    expected: {
      body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
      status: 500,
    },
  },
  {
    name: "TypeError",
    errorClass: TypeError,
    create: () => new TypeError("private argument detail"),
    expected: {
      body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
      status: 500,
    },
  },
  {
    name: "LaceError",
    errorClass: LaceError,
    create: () => new LaceError("INTERNAL_PRIVATE", "private base detail"),
    expected: {
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    },
  },
  {
    name: "InvariantError",
    errorClass: InvariantError,
    create: () => new InvariantError("private invariant detail"),
    expected: {
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    },
  },
  {
    name: "ContractValidationError",
    errorClass: ContractValidationError,
    create: () =>
      new ContractValidationError([
        { code: "invalid_value", message: "The submitted value is invalid.", path: "/title" },
      ]),
    expected: {
      status: 422,
      body: {
        error: {
          code: "VALIDATION_FAILED",
          message: "The request did not satisfy the API contract.",
          details: {
            issues: [
              { code: "invalid_value", message: "The submitted value is invalid.", path: "/title" },
            ],
          },
        },
      },
    },
  },
];
