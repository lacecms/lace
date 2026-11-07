import { DomainError } from "../shared/errors.js";

/**
 * A build-export page was requested for a published state that is no longer
 * current: the cursor's version differs from the current version, or a
 * publication changed the published state while the page was read.
 */
export class BuildExportVersionChangedError extends DomainError {
  public constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(
      "BUILD_EXPORT_VERSION_CHANGED",
      `Published content changed from version ${expectedVersion} to ${actualVersion} during the build export.`,
    );
    this.name = "BuildExportVersionChangedError";
  }
}

/** A build-export continuation cursor that is malformed or belongs to another list. */
export class BuildExportCursorError extends DomainError {
  public constructor(message: string) {
    super("CONTENT_INVALID_STATE", message);
    this.name = "BuildExportCursorError";
  }
}
