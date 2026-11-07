import type {
  StructuralChangeClass,
  ConfigurationSyncSnapshotReference,
  ConfigurationSyncDiagnosticCode,
  ConfigurationSyncDiagnostic,
} from "./types.js";
import { contentModelKey } from "@lacecms/domain";

export interface DiagnosticDetails {
  readonly affectedCount?: number | undefined;
  readonly blockType?: string | undefined;
  readonly changeClass?: StructuralChangeClass | undefined;
  readonly fieldKey?: string | undefined;
  readonly relatedModelKey?: string | undefined;
  readonly snapshots?: readonly ConfigurationSyncSnapshotReference[] | undefined;
}

export function diagnostic(
  code: ConfigurationSyncDiagnosticCode,
  modelKey: string,
  message: string,
  details: DiagnosticDetails | string = {},
): ConfigurationSyncDiagnostic {
  const values = typeof details === "string" ? { relatedModelKey: details } : details;
  return Object.freeze({
    ...(values.affectedCount === undefined ? {} : { affectedCount: values.affectedCount }),
    ...(values.blockType === undefined ? {} : { blockType: values.blockType }),
    ...(values.changeClass === undefined ? {} : { changeClass: values.changeClass }),
    code,
    ...(values.fieldKey === undefined
      ? {}
      : {
          fieldKey: values.fieldKey,
          ...(values.fieldKey.startsWith("/") ? { schemaPath: values.fieldKey } : {}),
        }),
    message,
    modelKey: contentModelKey(modelKey),
    ...(values.relatedModelKey === undefined
      ? {}
      : { relatedModelKey: contentModelKey(values.relatedModelKey) }),
    ...(values.snapshots === undefined ? {} : { snapshots: Object.freeze([...values.snapshots]) }),
  });
}

export function compareByKey<Value extends { readonly key: string }>(
  left: Value,
  right: Value,
): number {
  return left.key.localeCompare(right.key);
}

export function compareDiagnostics(
  left: ConfigurationSyncDiagnostic,
  right: ConfigurationSyncDiagnostic,
): number {
  return (
    left.modelKey.localeCompare(right.modelKey) ||
    left.code.localeCompare(right.code) ||
    (left.relatedModelKey ?? "").localeCompare(right.relatedModelKey ?? "") ||
    (left.fieldKey ?? "").localeCompare(right.fieldKey ?? "") ||
    (left.blockType ?? "").localeCompare(right.blockType ?? "")
  );
}
