import type { AdminContentEntryDto, ContentModelDto } from "@lacecms/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useBlocker } from "@tanstack/react-router";
import { useEffect, useRef, useState, type BaseSyntheticEvent } from "react";
import type { ContractValidationIssue } from "@lacecms/contracts";
import { useForm } from "react-hook-form";
import { ulid } from "ulid";
import {
  createDraftResolver,
  draftValues,
  FieldRenderer,
  FieldRendererProvider,
  issueLocation,
  localDraftJson,
  orderedDraftBlocks,
  locationField,
  resolvedPublicPath,
  serverIssueMessage,
  suggestSlug,
  validationProblems,
  withoutClearedValues,
  type DraftEditorValues,
  type FieldRendererRegistry,
} from "../../../entities/content/index.js";
import { useSession, useSessionRecovery } from "../../../entities/session/index.js";
import { PublishEntryDialog } from "../../../features/publish-entry/index.js";
import {
  AdminClientError,
  adminQueryKeys,
  errorDescription,
  useAdminClient,
} from "../../../shared/api/index.js";
import { useSaveShortcut } from "../../../shared/lib/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { Input } from "../../../shared/ui/Input/index.js";
import { fieldErrorClass } from "../../../shared/ui/layout/index.js";
import { PageError, PageLoading, PagePlaceholder } from "../../../shared/ui/PageState/index.js";
import { ShellHeaderActions } from "../../../widgets/admin-shell/index.js";
import { BlockEditor } from "../../../widgets/block-editor/index.js";
import { MediaPicker } from "../../../widgets/media-library/index.js";
import { DiscardChangesDialog } from "../DiscardChangesDialog/index.js";
import { EntryConflictAlert } from "../EntryConflictAlert/index.js";
import { EntryEditorActions, type SaveState } from "../EntryEditorActions/index.js";
import { EntryValidationSummary } from "../EntryValidationSummary/index.js";
import {
  EntryPublicationDetails,
  type BuildDispatchResult,
} from "../EntryPublicationDetails/index.js";

const entryRoute = getRouteApi("/_protected/content/$modelKey/$entryId");
const mediaRenderers: FieldRendererRegistry = { media: MediaPicker };
const formId = "entry-draft-form";

export function EntryPage() {
  const { entryId, modelKey } = entryRoute.useParams();
  const client = useAdminClient();
  const session = useSession();
  const queryClient = useQueryClient();
  const models = useQuery({ queryFn: client.listModels, queryKey: adminQueryKeys.models });
  const entry = useQuery({
    queryFn: () => client.loadEntry(entryId),
    queryKey: adminQueryKeys.entry(entryId),
  });
  const [savedEntry, setSavedEntry] = useState<AdminContentEntryDto | undefined>(undefined);
  const [conflict, setConflict] = useState<"publish" | "save" | undefined>(undefined);
  const [copyError, setCopyError] = useState<string | undefined>(undefined);
  const [publishAttempt, setPublishAttempt] = useState<
    { readonly idempotencyKey: string; readonly revision: number } | undefined
  >(undefined);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [latestBuild, setLatestBuild] = useState<BuildDispatchResult | undefined>(undefined);
  const currentEntry = savedEntry ?? entry.data;
  const model = models.data?.items.find((item) => item.key === modelKey);
  const modelRef = useRef<ContentModelDto | undefined>(undefined);
  modelRef.current = model;
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: { blocks: [], fields: {}, title: "" },
    // The validation summary takes focus instead of the first invalid control.
    shouldFocusError: false,
    ...(model === undefined ? {} : { resolver: createDraftResolver(model) }),
  });
  const [summaryShown, setSummaryShown] = useState(false);
  const [unmappedIssues, setUnmappedIssues] = useState<readonly string[]>([]);
  const summaryRef = useRef<HTMLElement>(null);
  const [summaryFocus, setSummaryFocus] = useState(0);
  useEffect(() => {
    if (summaryFocus > 0) summaryRef.current?.focus();
  }, [summaryFocus]);
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
      const location = issueLocation(issue.path, currentModel, blocks);
      if (location === undefined) {
        unmapped.push(serverIssueMessage(issue));
        continue;
      }
      const definition = locationField(location, currentModel, blocks);
      const message = serverIssueMessage(
        issue,
        definition === undefined
          ? undefined
          : { definition, value: form.getValues(location as never) },
      );
      form.setError(location as never, { message, type: "server" });
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
      : draftValues(model, currentEntry);
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
    setSavedEntry(undefined);
    setConflict(undefined);
    setPublishAttempt(undefined);
    setLatestBuild(undefined);
  }, [entryId]);
  useEffect(() => {
    if (!suggestingSlugRef.current || slugManuallyEdited) return;
    const suggested = suggestSlug(titleValue);
    if (form.getValues("slug") !== suggested)
      form.setValue("slug", suggested, { shouldDirty: true });
  }, [form, slugManuallyEdited, suggestingSlug, titleValue]);
  const blocker = useBlocker({
    enableBeforeUnload: () => form.formState.isDirty,
    shouldBlockFn: () => form.formState.isDirty,
    withResolver: true,
  });
  const save = useMutation({
    mutationFn: (submitted: DraftEditorValues) => {
      if (currentEntry === undefined) throw new Error("The entry has not loaded.");
      const values = withoutClearedValues(submitted);
      return client.saveDraft(entryId, {
        blocks: orderedDraftBlocks(values.blocks),
        expectedRevision: currentEntry.draft.revision,
        fields: values.fields,
        ...(modelRef.current?.kind === "collection" && values.slug !== undefined
          ? { slug: values.slug }
          : {}),
        title: values.title,
      });
    },
    onError: (error) => {
      if (!(error instanceof AdminClientError)) return;
      if (error.code === "CONTENT_REVISION_CONFLICT") {
        setConflict("save");
        return;
      }
      if (error.issues !== undefined && error.issues.length > 0) applyServerIssues(error.issues);
    },
    onSuccess: async (saved) => {
      hideSummary();
      const savedModel = modelRef.current;
      if (savedModel === undefined) return;
      queryClient.setQueryData(adminQueryKeys.entry(entryId), saved);
      setSavedEntry(saved);
      suggestingSlugRef.current = false;
      setSuggestingSlug(false);
      setSlugManuallyEdited(false);
      setConflict(undefined);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.modelEntries(modelKey) });
    },
  });
  const publish = useMutation({
    mutationFn: (attempt: { readonly idempotencyKey: string; readonly revision: number }) =>
      client.publishEntry(entryId, {
        expectedRevision: attempt.revision,
        idempotencyKey: attempt.idempotencyKey,
      }),
    onError: (error) => {
      if (error instanceof AdminClientError && error.code === "CONTENT_REVISION_CONFLICT") {
        setConflict("publish");
        setPublishAttempt(undefined);
        return;
      }
      if (
        error instanceof AdminClientError &&
        error.issues !== undefined &&
        error.issues.length > 0
      )
        applyServerIssues(error.issues);
      if (error instanceof AdminClientError && error.status !== undefined)
        setPublishAttempt(undefined);
    },
    onSuccess: async (result) => {
      const publishedModel = modelRef.current;
      if (publishedModel === undefined) return;
      const values = draftValues(publishedModel, result.entry);
      queryClient.setQueryData(adminQueryKeys.entry(entryId), result.entry);
      setSavedEntry(result.entry);
      loaded.current = `${result.entry.id}:${result.entry.draft.revision}`;
      form.reset(values);
      setConflict(undefined);
      setPublishAttempt(undefined);
      setLatestBuild(result.build);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.modelEntries(modelKey) });
    },
  });
  const readOnly = session.role === "viewer";
  const submitDraft = (event?: BaseSyntheticEvent) => {
    setUnmappedIssues([]);
    return form.handleSubmit(
      (values) => save.mutate(values),
      () => showSummary(),
    )(event);
  };
  useSaveShortcut(() => {
    if (readOnly || save.isPending || !form.formState.isDirty) return;
    void submitDraft();
  });
  const reloadServerDraft = useMutation({
    mutationFn: () => client.loadEntry(entryId),
    onSuccess: (reloaded) => {
      const reloadedModel = modelRef.current;
      if (reloadedModel === undefined) return;
      queryClient.setQueryData(adminQueryKeys.entry(entryId), reloaded);
      setSavedEntry(reloaded);
      loaded.current = `${reloaded.id}:${reloaded.draft.revision}`;
      form.reset(draftValues(reloadedModel, reloaded));
      hideSummary();
      setConflict(undefined);
      setPublishAttempt(undefined);
    },
  });
  useSessionRecovery(models.error ?? entry.error);
  if (models.isPending || entry.isPending) return <PageLoading label="Loading draft" />;
  if (models.error !== null) return <PageError error={models.error} />;
  if (entry.error !== null) return <PageError error={entry.error} />;
  if (model === undefined || currentEntry === undefined || currentEntry.model.key !== model.key)
    return (
      <PagePlaceholder
        description="This entry is not available for the requested model."
        title="Entry not found"
      />
    );

  const errors = form.formState.errors.fields as
    | Record<string, { readonly message?: string }>
    | undefined;
  const blockErrors = form.formState.errors.blocks as
    | Record<string, Record<string, unknown>>
    | undefined;
  const canPublish = session.role === "admin";
  const dirty = form.formState.isDirty;
  const saveState: SaveState = readOnly
    ? { kind: "view-only" }
    : save.isPending
      ? { kind: "saving" }
      : dirty && save.isError
        ? { kind: "failed" }
        : dirty
          ? { kind: "dirty" }
          : { kind: "saved", revision: currentEntry.draft.revision };
  const retryPublish = () => {
    if (publishAttempt !== undefined) publish.mutate(publishAttempt);
  };
  const copyLocalDraft = async () => {
    try {
      if (navigator.clipboard === undefined) throw new Error("Clipboard is unavailable.");
      await navigator.clipboard.writeText(localDraftJson(form.getValues()));
      setCopyError(undefined);
    } catch {
      setCopyError("Could not copy local JSON. Select and copy it manually from your browser.");
    }
  };
  const problems = summaryShown
    ? validationProblems({
        // Errors change with every revalidation, which re-renders the page.
        blocks: form.getValues("blocks"),
        errors: form.formState.errors,
        model,
        unmapped: unmappedIssues,
      })
    : [];
  const validationRejected = (error: unknown) =>
    error instanceof AdminClientError && (error.issues?.length ?? 0) > 0;
  const titleError = form.formState.errors.title;
  const slugError = form.formState.errors.slug;
  const hasEntryFields = model.kind === "collection" || Object.keys(model.fields).length > 0;
  return (
    <>
      <ShellHeaderActions>
        <EntryEditorActions
          form={formId}
          publish={
            canPublish ? (
              <PublishEntryDialog
                disabled={publish.isPending || dirty}
                onConfirm={() => {
                  const attempt = {
                    idempotencyKey: ulid(),
                    revision: currentEntry.draft.revision,
                  };
                  setPublishAttempt(attempt);
                  setPublishDialogOpen(false);
                  publish.mutate(attempt);
                }}
                onOpenChange={setPublishDialogOpen}
                open={publishDialogOpen}
                pending={publish.isPending}
                publicPath={resolvedPublicPath(model, currentEntry)}
                revision={currentEntry.draft.revision}
              />
            ) : undefined
          }
          saveDisabled={save.isPending || !dirty}
          state={saveState}
        />
      </ShellHeaderActions>
      <FieldRendererProvider readOnly={readOnly} renderers={mediaRenderers}>
        <form
          aria-labelledby="entry-title"
          className="grid max-w-[80rem] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
          id={formId}
          onSubmit={(event) => {
            if (readOnly) {
              event.preventDefault();
              return;
            }
            void submitDraft(event);
          }}
        >
          <fieldset className="contents" disabled={readOnly}>
            <div className="grid min-w-0 content-start gap-4">
              <h1
                className="m-0 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                id="entry-title"
              >
                Edit {model.label ?? model.key}
              </h1>
              {problems.length === 0 ? undefined : (
                <EntryValidationSummary problems={problems} ref={summaryRef} />
              )}
              {conflict === undefined ? (
                save.error === null || validationRejected(save.error) ? undefined : (
                  <div className="grid gap-2">
                    <PageError error={save.error} />
                    {save.error instanceof AdminClientError &&
                    save.error.code === "CONTENT_INVALID_STATE" ? (
                      <div className="grid gap-2 text-sm">
                        <p>
                          Your unsaved changes are still here. Retry Save draft to send the
                          displayed block order. Copy your JSON before reloading if the problem
                          continues.
                        </p>
                        <Button
                          className="justify-self-start"
                          onClick={() => void copyLocalDraft()}
                          size="sm"
                          variant="outline"
                        >
                          Copy my JSON
                        </Button>
                        {copyError === undefined ? undefined : <p role="alert">{copyError}</p>}
                      </div>
                    ) : undefined}
                  </div>
                )
              ) : (
                <EntryConflictAlert
                  conflict={conflict}
                  copyError={copyError}
                  onCopy={() => void copyLocalDraft()}
                  onReload={() => reloadServerDraft.mutate()}
                  reloadError={
                    reloadServerDraft.error === null
                      ? undefined
                      : errorDescription(reloadServerDraft.error)
                  }
                  reloading={reloadServerDraft.isPending}
                />
              )}
              <div className="grid gap-1">
                <label className="sr-only" htmlFor="system-title">
                  Title
                </label>
                <Input
                  aria-describedby={titleError === undefined ? undefined : "system-title-error"}
                  aria-invalid={titleError === undefined ? undefined : true}
                  className="-mx-2 h-auto border-transparent bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight shadow-none hover:border-input"
                  id="system-title"
                  placeholder="Untitled"
                  {...form.register("title")}
                />
                {titleError === undefined ? undefined : (
                  <p className={`${fieldErrorClass} text-xs`} id="system-title-error" role="alert">
                    {titleError.message}
                  </p>
                )}
              </div>
              <BlockEditor
                control={form.control}
                errors={blockErrors}
                getValues={form.getValues}
                model={model}
              />
            </div>
            <aside aria-label="Entry details" className="grid min-w-0 content-start gap-4">
              <EntryPublicationDetails entry={currentEntry} latestBuild={latestBuild} model={model}>
                {publish.error !== null && publishAttempt !== undefined ? (
                  <div className="grid gap-2">
                    <p className="m-0 text-destructive" role="alert">
                      {errorDescription(publish.error)}
                    </p>
                    <Button
                      className="justify-self-start"
                      disabled={publish.isPending}
                      onClick={retryPublish}
                      size="sm"
                      variant="outline"
                    >
                      Retry publish
                    </Button>
                  </div>
                ) : undefined}
              </EntryPublicationDetails>
              {hasEntryFields ? (
                <section
                  aria-labelledby="entry-fields-title"
                  className="grid gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xs"
                >
                  <h2 className="m-0 text-sm font-semibold" id="entry-fields-title">
                    Fields
                  </h2>
                  {model.kind === "collection" ? (
                    <div className="grid gap-1.5">
                      <label className="text-sm font-medium" htmlFor="system-slug">
                        Slug
                      </label>
                      <Input
                        aria-describedby={slugError === undefined ? undefined : "system-slug-error"}
                        aria-invalid={slugError === undefined ? undefined : true}
                        id="system-slug"
                        {...form.register("slug", {
                          onChange: () => {
                            if (suggestingSlug) setSlugManuallyEdited(true);
                          },
                        })}
                      />
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          checked={suggestingSlug}
                          className="size-3.5 accent-primary"
                          onChange={(event) => {
                            const enabled = event.currentTarget.checked;
                            suggestingSlugRef.current = enabled;
                            setSuggestingSlug(enabled);
                            setSlugManuallyEdited(false);
                            if (enabled)
                              form.setValue("slug", suggestSlug(form.getValues("title")), {
                                shouldDirty: true,
                              });
                          }}
                          type="checkbox"
                        />
                        Suggest from title
                      </label>
                      {slugError === undefined ? undefined : (
                        <p
                          className={`${fieldErrorClass} text-xs`}
                          id="system-slug-error"
                          role="alert"
                        >
                          {slugError.message}
                        </p>
                      )}
                    </div>
                  ) : undefined}
                  {Object.entries(model.fields).map(([key, definition]) => (
                    <FieldRenderer
                      control={form.control}
                      definition={definition}
                      error={errors?.[key]?.message}
                      fieldKey={key}
                      key={key}
                      name={`fields.${key}`}
                    />
                  ))}
                </section>
              ) : undefined}
            </aside>
          </fieldset>
        </form>
      </FieldRendererProvider>
      <DiscardChangesDialog
        onLeave={() => {
          if (blocker.status === "blocked") blocker.proceed();
        }}
        onStay={() => {
          if (blocker.status === "blocked") blocker.reset();
        }}
        open={blocker.status === "blocked"}
      />
    </>
  );
}
