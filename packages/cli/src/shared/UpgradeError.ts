export class UpgradeError extends Error {
  public constructor(
    readonly code:
      | "UPGRADE_INPUT"
      | "UPGRADE_INSPECTION"
      | "UPGRADE_BUSY"
      | "UPGRADE_RECOVERY"
      | "UPGRADE_APPLY",
    message: string,
  ) {
    super(message);
    this.name = "UpgradeError";
  }
}
