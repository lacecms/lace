import {
  collectFieldEntryReferences,
  MAX_LINK_RESOLVE_IDS,
  type JsonObject,
} from "@lacecms/content";
import type { ContentModelDto, ReferenceTargetStatusesDto } from "@lacecms/contracts";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import type { DraftEditorValues } from "../../../shared/editor-contract/index.js";
import { adminQueryKeys, errorDescription, useAdminClient } from "../../../shared/api/index.js";

import type { FieldRendererProps } from "../../../entities/field-editor/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { ReferencePicker, ReferencePublicationBadge } from "../ReferencePicker/index.js";

const StatusContext = createContext<{
  readonly statuses?: ReferenceTargetStatusesDto | undefined;
  readonly error?: unknown;
  readonly retry: () => void;
}>({ retry() {} });

const useReferenceStatuses = () => useContext(StatusContext);

export function ReferenceAuthoringProvider({
  form,
  model,
  children,
}: {
  readonly form: UseFormReturn<DraftEditorValues, unknown, DraftEditorValues>;
  readonly model: ContentModelDto;
  readonly children: ReactNode;
}) {
  const client = useAdminClient();
  useWatch({ control: form.control, name: ["fields", "blocks"] });
  const values = form.getValues();
  const definitions = new Map(model.blockDefinitions?.map((block) => [block.type, block.fields]));
  const occurrences = [
    ...collectFieldEntryReferences(model.fields, values.fields as JsonObject),
    ...values.blocks.flatMap((block) =>
      collectFieldEntryReferences(definitions.get(block.type ?? "") ?? {}, block.data),
    ),
  ];
  const ids = [
    ...new Set(
      occurrences.flatMap((occurrence) =>
        occurrence.purpose === "reference" ? [occurrence.targetId] : [],
      ),
    ),
  ].sort();
  const query = useQuery({
    queryKey: [...adminQueryKeys.referenceStatuses, ids],
    enabled: ids.length > 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const statuses: ReferenceTargetStatusesDto = Object.create(null);
      for (let start = 0; start < ids.length; start += MAX_LINK_RESOLVE_IDS)
        Object.assign(
          statuses,
          await client.resolveReferenceTargets(
            ids.slice(start, start + MAX_LINK_RESOLVE_IDS),
            signal,
          ),
        );
      return statuses;
    },
  });
  return (
    <StatusContext.Provider
      value={{
        statuses: query.data,
        error: query.error,
        retry: () => {
          void query.refetch();
        },
      }}
    >
      {children}
    </StatusContext.Provider>
  );
}

export function ReferenceField({
  definition,
  describedBy,
  id,
  invalid,
  item,
  label,
  onBlur,
  onChange,
  readOnly,
  selectionProblem,
  value,
}: FieldRendererProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const statuses = useReferenceStatuses();
  if (definition.type !== "reference") return null;
  const targetId = typeof value === "string" ? value : undefined;
  const target = targetId === undefined ? undefined : statuses.statuses?.[targetId];
  const details = target && "title" in target ? target : undefined;
  const state =
    targetId === undefined
      ? "No entry selected"
      : (details?.title ??
        (target?.state === "missing"
          ? `Missing entry (${targetId})`
          : target?.state === "ineligible"
            ? `Unavailable entry (${targetId})`
            : statuses.error
              ? `Selected entry (${targetId})`
              : "Loading entry…"));
  const statusId = `${id}-reference-status`;
  const description = [describedBy, statusId].filter(Boolean).join(" ");
  return (
    <div className="grid min-w-0 gap-1.5">
      {readOnly ? (
        <div aria-describedby={description} aria-label={label} id={id} role="group" tabIndex={-1}>
          {state}
        </div>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <Button
            aria-describedby={description}
            aria-invalid={invalid || undefined}
            aria-haspopup="dialog"
            aria-label={label}
            className="h-auto min-h-8 min-w-0 justify-start whitespace-normal text-left wrap-anywhere"
            disabled={!!selectionProblem}
            id={id}
            onClick={() => setOpen(true)}
            ref={trigger}
            variant="outline"
          >
            {state}
          </Button>
          {targetId !== undefined && !item && (
            <Button
              onClick={() => {
                onChange(undefined);
                onBlur();
              }}
              size="sm"
              variant="ghost"
            >
              Clear {label}
            </Button>
          )}
        </div>
      )}
      <div
        className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
        id={statusId}
        role="status"
      >
        <span className="sr-only">{state}. </span>
        {details && (
          <>
            {details.modelKey} <ReferencePublicationBadge state={details.state} />
          </>
        )}
        {targetId !== undefined && statuses.error != null && (
          <>
            {errorDescription(statuses.error)}
            <Button onClick={statuses.retry} size="sm" variant="ghost">
              Retry entry status
            </Button>
          </>
        )}
        {selectionProblem}
      </div>
      {open && !readOnly && (
        <ReferencePicker
          capacity={1}
          label={label}
          limitMessage=""
          models={definition.models}
          multiple={false}
          onCancel={() => setOpen(false)}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
          onConfirm={([selected]) => {
            onChange(selected);
            onBlur();
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
