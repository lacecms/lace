import { useEffect, useRef, useState } from "react";
import type { AdminContentEntryDto, ContentModelDto } from "@lacecms/contracts";
import {
  fieldControlId,
  verifyReferenceUse,
  type ReferenceUse,
  type VerifiedReferenceUse,
} from "../../entities/content/index.js";
import type { useDraftEditor } from "../../entities/field-editor/index.js";
import { focusProblemTarget } from "./EntryValidationSummary.js";

export function useReferenceOccurrence({
  entryId,
  entry,
  model,
  editor,
  referenceUse,
  fetching,
}: {
  readonly entryId: string;
  readonly entry: AdminContentEntryDto | undefined;
  readonly model: ContentModelDto | undefined;
  readonly editor: ReturnType<typeof useDraftEditor>;
  readonly referenceUse: ReferenceUse | undefined;
  readonly fetching: boolean;
}) {
  const key = referenceUse && JSON.stringify([entryId, referenceUse]);
  const version = entry && JSON.stringify([entry.draft.revision, entry.published?.id]);
  const [result, setResult] = useState<{
    key: string;
    version: string;
    use: VerifiedReferenceUse;
  }>();
  const banner = useRef<HTMLDivElement>(null);
  const applied = useRef<string | undefined>(undefined);
  const resolved = result?.key === key && result?.version === version ? result?.use : undefined;
  const { form, isAdoptedEntry } = editor;
  useEffect(() => {
    if (!key || !referenceUse) {
      applied.current = undefined;
      setResult(undefined);
      return;
    }
    if (
      applied.current === key ||
      fetching ||
      version === undefined ||
      !model ||
      entry?.id !== entryId ||
      !isAdoptedEntry(entry)
    )
      return;
    applied.current = key;
    setResult({
      key,
      version,
      use: verifyReferenceUse(model, entry, form.getValues(), referenceUse),
    });
  }, [key, version, referenceUse, fetching, model, entry, entryId, form, isAdoptedEntry]);
  useEffect(() => {
    if (!resolved) return;
    const frame = requestAnimationFrame(() => {
      if (resolved.path) {
        focusProblemTarget({
          kind: "control",
          id: fieldControlId(resolved.path as `fields.${string}`),
        });
      } else {
        banner.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [resolved]);
  return { resolved, banner, dismiss: () => setResult(undefined) };
}
