import { useEffect, useRef, useState } from "react";
import { useForm, useWatch, type FieldPath, type Resolver } from "react-hook-form";
import type { FieldMetadata } from "@lacecms/content";
import type {
  AdminContentEntryDto,
  ContentBlockDto,
  ContentModelDto,
  ContractValidationIssue,
} from "@lacecms/contracts";
import type { DraftEditorValues, DraftIssuePath } from "../../shared/editor-contract/index.js";

export interface DraftEditorServices {
  readonly createDraftResolver: (
    model: ContentModelDto,
  ) => Resolver<DraftEditorValues, unknown, DraftEditorValues>;
  readonly draftValues: (model: ContentModelDto, entry: AdminContentEntryDto) => DraftEditorValues;
  readonly issueLocation: (
    path: string,
    model: ContentModelDto,
    blocks: readonly ContentBlockDto[],
    fields?: Record<string, unknown>,
  ) => DraftIssuePath | undefined;
  readonly locationField: (
    location: DraftIssuePath,
    model: ContentModelDto,
    blocks: readonly ContentBlockDto[],
  ) => FieldMetadata | undefined;
  readonly serverIssueMessage: (
    issue: ContractValidationIssue,
    field?: { readonly definition: FieldMetadata; readonly value: unknown },
  ) => string;
  readonly publicationIssueType: string;
  readonly suggestSlug: (title: string) => string;
}

export function useDraftEditor(
  model: ContentModelDto | undefined,
  currentEntry: AdminContentEntryDto | undefined,
  services: DraftEditorServices,
) {
  const modelRef = useRef<ContentModelDto | undefined>(undefined);
  modelRef.current = model;
  const [editorEpoch, setEditorEpoch] = useState(0);
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: { blocks: [], fields: {}, title: "" },
    // The validation summary takes focus instead of the first invalid control.
    shouldFocusError: false,
    reValidateMode: "onSubmit",
    ...(model === undefined ? {} : { resolver: services.createDraftResolver(model) }),
  });
  const transient = useWatch({ control: form.control, name: "__transient" });
  const transientDirty = Object.keys(transient ?? {}).length > 0;
  // Model fields decide which conditional fields apply.
  const fieldValues = useWatch({ control: form.control, name: "fields" });
  const [summaryShown, setSummaryShown] = useState(false);
  const [unmappedIssues, setUnmappedIssues] = useState<readonly string[]>([]);
  const summaryRef = useRef<HTMLElement>(null);
  const [summaryFocus, setSummaryFocus] = useState(0);
  const summaryFocused = useRef(0);
  // Local errors can reach the form state a render after the request to show the
  // summary, so focus it on the first render that has it, once per request.
  useEffect(() => {
    if (summaryFocus === summaryFocused.current || summaryRef.current === null) return;
    summaryFocused.current = summaryFocus;
    summaryRef.current.focus();
  });
  const showSummary = () => {
    setSummaryShown(true);
    setSummaryFocus((count) => count + 1);
  };
  const hideSummary = () => {
    setSummaryShown(false);
    setUnmappedIssues([]);
  };
  /** Shows server validation issues at their locations and in the summary. */
  const applyServerIssues = (issues: readonly ContractValidationIssue[]) => {
    const currentModel = modelRef.current;
    if (currentModel === undefined) return;
    const blocks = form.getValues("blocks");
    const unmapped: string[] = [];
    for (const issue of issues) {
      const location = services.issueLocation(
        issue.path,
        currentModel,
        blocks,
        form.getValues("fields"),
      );
      if (location === undefined) {
        unmapped.push(services.serverIssueMessage(issue));
        continue;
      }
      const definition = services.locationField(location, currentModel, blocks);
      const message = services.serverIssueMessage(
        issue,
        definition === undefined
          ? undefined
          : { definition, value: form.getValues(location as FieldPath<DraftEditorValues>) },
      );
      // Publication reports required fields; a hidden block is exempt, so the summary can tell.
      // issueLocation validates the model, indices and synthetic block error locations.
      // RHF accepts those synthetic locations at runtime, but its value paths omit them.
      form.setError(location as FieldPath<DraftEditorValues>, {
        message,
        type:
          issue.code === "missing_required_field" || issue.code === "list_too_short"
            ? services.publicationIssueType
            : "server",
      });
    }
    setUnmappedIssues(unmapped);
    showSummary();
  };
  const loaded = useRef<string | undefined>(undefined);
  const [suggestingSlug, setSuggestingSlug] = useState(false);
  const suggestingSlugRef = useRef(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const titleValue = form.watch("title");
  const initial =
    model === undefined || currentEntry === undefined
      ? undefined
      : services.draftValues(model, currentEntry);
  useEffect(() => {
    if (initial === undefined || currentEntry === undefined) return;
    const key = `${currentEntry.id}:${currentEntry.draft.revision}`;
    if (loaded.current === key) return;
    suggestingSlugRef.current = false;
    form.reset(initial);
    loaded.current = key;
    setSuggestingSlug(false);
    setSlugManuallyEdited(false);
  }, [currentEntry, form, initial]);
  useEffect(() => {
    if (!suggestingSlugRef.current || slugManuallyEdited) return;
    const suggested = services.suggestSlug(titleValue);
    if (form.getValues("slug") !== suggested)
      form.setValue("slug", suggested, { shouldDirty: true });
  }, [form, slugManuallyEdited, suggestingSlug, titleValue]);
  return {
    model,
    modelRef,
    editorEpoch,
    setEditorEpoch,
    form,
    transientDirty,
    fieldValues,
    summaryShown,
    unmappedIssues,
    setUnmappedIssues,
    summaryRef,
    showSummary,
    hideSummary,
    applyServerIssues,
    loaded,
    suggestingSlug,
    setSuggestingSlug,
    suggestingSlugRef,
    setSlugManuallyEdited,
  };
}
