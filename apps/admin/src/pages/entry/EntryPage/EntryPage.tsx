import { RichTextEditor } from "../../../entities/rich-text/index.js";
import { LINK_URL_MESSAGE, fieldEditorServices } from "../../../entities/content/index.js";
import type { FieldRendererProps } from "../../../entities/field-editor/index.js";
import { LinkAuthoringProvider, OrdinaryUrlField } from "../../../features/select-link/index.js";
import type { AdminContentEntryDto, UnpublishContentEntryResultDto } from "@lacecms/contracts";
import { useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useBlocker } from "@tanstack/react-router";
import { useEffect, useRef, useState, type BaseSyntheticEvent } from "react";
import {
  applicableErrors,
  createDraftResolver,
  draftValues,
  EmbedUrlPreview,
  hiddenFieldNote,
  issueLocation,
  localDraftJson,
  locationField,
  PUBLICATION_ISSUE_TYPE,
  renderedFieldKeys,
  resolvedPublicPath,
  seoDefaultsAnnotation,
  siteUrlFor,
  serverIssueMessage,
  shownFieldKeys,
  suggestSlug,
  useSeoDefaults,
  validationProblems,
} from "../../../entities/content/index.js";
import {
  useDraftEditor,
  FieldRenderer,
  FieldLayout,
  EntryListBudget,
  FieldRendererProvider,
  type FieldPreviewRegistry,
  type FieldRendererRegistry,
} from "../../../entities/field-editor/index.js";
import { can, useSession, useSessionRecovery } from "../../../entities/session/index.js";
import { useDuplicateEntry } from "../../../features/duplicate-entry/index.js";
import { PublishEntryDialog } from "../../../features/publish-entry/index.js";
import {
  AdminClientError,
  adminQueryKeys,
  errorDescription,
  useAdminClient,
} from "../../../shared/api/index.js";
import { requestFocus, useSaveShortcut } from "../../../shared/lib/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { Input } from "../../../shared/ui/Input/index.js";
import { fieldErrorClass } from "../../../shared/ui/layout/index.js";
import { PageError, PageLoading, PagePlaceholder } from "../../../shared/ui/PageState/index.js";
import { toast } from "../../../shared/ui/Toaster/index.js";
import { ShellHeaderActions } from "../../../widgets/admin-shell/index.js";
import { BlockEditor } from "../../../widgets/block-editor/index.js";
import { collectionFocusTarget } from "../../../widgets/collection-entries/index.js";
import {
  MediaItemPreview,
  MediaListPicker,
  MediaPicker,
} from "../../../widgets/media-library/index.js";
import { DiscardChangesDialog } from "../DiscardChangesDialog.js";
import { EntryActionsMenu } from "../EntryActionsMenu.js";
import { EntryConflictAlert } from "../EntryConflictAlert.js";
import { EntrySeoCard } from "../EntrySeoCard.js";
import { EntryEditorActions, type SaveState } from "../EntryEditorActions.js";
import { EntryValidationSummary } from "../EntryValidationSummary.js";
import { useEntryMutations } from "../use-entry-mutations.js";
import { EntryPublicationDetails } from "../EntryPublicationDetails/index.js";

function RichTextField({
  describedBy,
  id,
  invalid,
  label,
  onBlur,
  onChange,
  placeholder,
  readOnly,
  value,
}: FieldRendererProps) {
  return (
    <RichTextEditor
      linkUrlMessage={LINK_URL_MESSAGE}
      {...(describedBy === undefined ? {} : { describedBy })}
      placeholder={placeholder}
      id={id}
      invalid={invalid}
      label={label}
      onBlur={onBlur}
      onChange={onChange}
      readOnly={readOnly}
      value={value}
    />
  );
}

const entryRoute = getRouteApi("/_protected/content/$modelKey/$entryId");
const mediaRenderers: FieldRendererRegistry = {
  media: MediaPicker,
  url: OrdinaryUrlField,
  richText: RichTextField,
};
const fieldPreviews: FieldPreviewRegistry = { media: MediaItemPreview, url: EmbedUrlPreview };
const formId = "entry-draft-form";
const draftEditorServices = {
  createDraftResolver,
  draftValues,
  issueLocation,
  locationField,
  serverIssueMessage,
  publicationIssueType: PUBLICATION_ISSUE_TYPE,
  suggestSlug,
};

export function EntryPage() {
  const { entryId, modelKey } = entryRoute.useParams();
  const navigate = entryRoute.useNavigate();
  const client = useAdminClient();
  const session = useSession();
  const queryClient = useQueryClient();
  const pendingRequests = useIsMutating();
  const models = useQuery({ queryFn: client.listModels, queryKey: adminQueryKeys.models });
  const entry = useQuery({
    queryFn: () => client.loadEntry(entryId),
    queryKey: adminQueryKeys.entry(entryId),
  });
  const [savedEntry, setSavedEntry] = useState<AdminContentEntryDto | undefined>(undefined);
  const [copyError, setCopyError] = useState<string | undefined>(undefined);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  /** Set once the entry is deleted, so leaving for the list needs no discard prompt. */
  const leaving = useRef(false);
  const currentEntry = savedEntry ?? entry.data;
  const model = models.data?.items.find((item) => item.key === modelKey);
  const seoDefaults = useSeoDefaults(model?.seo === undefined ? undefined : models.data?.items);
  const buildSite = useQuery({
    // SEO previews and copied block links resolve against the site URL.
    enabled: model !== undefined && (model.seo !== undefined || model.blocks.length > 0),
    queryFn: client.loadBuildSite,
    queryKey: adminQueryKeys.buildSite,
  });
  const editor = useDraftEditor(model, currentEntry, draftEditorServices);
  const {
    modelRef,
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
    suggestingSlug,
    setSuggestingSlug,
    suggestingSlugRef,
    setSlugManuallyEdited,
  } = editor;
  useEffect(() => {
    setSavedEntry(undefined);
  }, [entryId]);
  const blocker = useBlocker({
    enableBeforeUnload: () => !leaving.current && (form.formState.isDirty || transientDirty),
    shouldBlockFn: () => !leaving.current && (form.formState.isDirty || transientDirty),
    withResolver: true,
  });
  const {
    save,
    publish,
    reloadServerDraft,
    conflict,
    publishAttempt,
    setPublishAttempt,
    latestBuild,
    setLatestBuild,
    savingToPublish,
    adoptServerDraft,
    retryPublish,
    startPublish,
    saveAndPublish,
  } = useEntryMutations({ entryId, modelKey, currentEntry, editor, setSavedEntry });
  const readOnly = !can(session, "content:write");
  const submitDraft = (event?: BaseSyntheticEvent) => {
    setUnmappedIssues([]);
    return form.handleSubmit(
      (values) => save.mutate(values),
      () => showSummary(),
    )(event);
  };
  useSaveShortcut(() => {
    if (readOnly || busy || !(form.formState.isDirty || transientDirty)) return;
    void submitDraft();
  });
  const duplicate = useDuplicateEntry(modelKey);
  useSessionRecovery(models.error ?? entry.error);
  useSessionRecovery(save.error);
  useSessionRecovery(publish.error);
  useSessionRecovery(reloadServerDraft.error);
  useSessionRecovery(seoDefaults.error);
  useSessionRecovery(buildSite.error);
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

  const errors = applicableErrors(
    model.fields,
    model.visibility,
    fieldValues,
    form.formState.errors.fields,
  ) as Record<string, { readonly message?: string }> | undefined;
  const shownModelFields = shownFieldKeys(model.fields, model.visibility, fieldValues);
  const renderedModelFields = renderedFieldKeys(
    model.fields,
    model.visibility,
    fieldValues,
    errors,
  );
  const blockErrors = form.formState.errors.blocks as
    | Record<string, Record<string, unknown>>
    | undefined;
  const canPublish = can(session, "content:publish");
  const dirty = form.formState.isDirty || transientDirty;
  const saveState: SaveState = readOnly
    ? { kind: "view-only" }
    : save.isPending
      ? { kind: "saving" }
      : dirty && save.isError
        ? { kind: "failed" }
        : dirty
          ? { kind: "dirty" }
          : { kind: "saved", revision: currentEntry.draft.revision };
  const busy =
    pendingRequests > 0 ||
    save.isPending ||
    publish.isPending ||
    savingToPublish ||
    duplicate.isPending;
  const adoptUnpublished = (result: UnpublishContentEntryResultDto) => {
    // The draft revision is unchanged, so the form keeps any unsaved values.
    queryClient.setQueryData(adminQueryKeys.entry(entryId), result.entry);
    setSavedEntry(result.entry);
    setPublishAttempt(undefined);
    setLatestBuild({ build: result.build, change: "unpublished" });
    toast.success("Unpublished. The draft is kept.");
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.modelEntries(modelKey) });
  };
  const leaveAfterDelete = () => {
    leaving.current = true;
    requestFocus(collectionFocusTarget(modelKey));
    void navigate({ params: { modelKey }, to: "/content/$modelKey" }).then(() =>
      queryClient.removeQueries({ queryKey: adminQueryKeys.entry(entryId) }),
    );
  };
  const copyLocalDraft = async () => {
    try {
      if (navigator.clipboard === undefined) throw new Error("Clipboard is unavailable.");
      await navigator.clipboard.writeText(localDraftJson(form.getValues(), modelRef.current));
      setCopyError(undefined);
    } catch {
      setCopyError("Could not copy local JSON. Select and copy it manually from your browser.");
    }
  };
  const siteUrl = buildSite.data?.site?.url;
  const publicPath =
    model === undefined || currentEntry === undefined
      ? undefined
      : resolvedPublicPath(model, currentEntry);
  const blockLinkBase =
    siteUrl === undefined || publicPath === undefined ? undefined : siteUrlFor(siteUrl, publicPath);
  const problems = summaryShown
    ? validationProblems({
        // Errors change with every revalidation, which re-renders the page.
        blocks: form.getValues("blocks"),
        errors: form.formState.errors,
        fields: form.getValues("fields"),
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
                disabled={busy}
                onConfirm={() => {
                  setPublishDialogOpen(false);
                  if (dirty) saveAndPublish();
                  else startPublish(currentEntry.draft.revision);
                }}
                onOpenChange={setPublishDialogOpen}
                open={publishDialogOpen}
                pending={publish.isPending || savingToPublish}
                kind={model.kind}
                publicPath={resolvedPublicPath(model, currentEntry)}
                revision={currentEntry.draft.revision}
                unsavedChanges={dirty}
              />
            ) : undefined
          }
          saveDisabled={busy || !dirty}
          state={saveState}
        />
        <EntryActionsMenu
          busy={busy}
          canPublish={canPublish}
          canWrite={!readOnly}
          entry={currentEntry}
          model={model}
          onDeleted={leaveAfterDelete}
          onDiscardUnsaved={() => {
            setEditorEpoch((value) => value + 1);
            form.reset(draftValues(model, currentEntry));
            hideSummary();
          }}
          onDuplicate={() =>
            duplicate.mutate({ entryId, expectedRevision: currentEntry.draft.revision })
          }
          onReload={() => {
            // Refresh the publication without discarding unsaved values of an unchanged draft.
            void entry.refetch().then(() => setSavedEntry(undefined));
          }}
          onReverted={(reverted) => {
            adoptServerDraft(reverted);
            toast.success("Reverted to the published version.");
            void queryClient.invalidateQueries({ queryKey: adminQueryKeys.modelEntries(modelKey) });
          }}
          onUnpublished={adoptUnpublished}
          unsavedChanges={dirty}
        />
      </ShellHeaderActions>
      <LinkAuthoringProvider form={form} model={model}>
        <FieldRendererProvider
          services={fieldEditorServices}
          editor={editor}
          busy={busy || reloadServerDraft.isPending}
          mediaListPicker={MediaListPicker}
          previews={fieldPreviews}
          readOnly={readOnly}
          renderers={mediaRenderers}
        >
          <form
            aria-labelledby="entry-title"
            className="grid max-w-[80rem] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
            id={formId}
            noValidate
            onSubmit={(event) => {
              if (readOnly || busy) {
                event.preventDefault();
                return;
              }
              void submitDraft(event);
            }}
          >
            <div className="contents">
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
                {model.kind === "global" ? (
                  // A global's title is its model label and is owned by the system.
                  <div className="grid gap-1">
                    <p className="m-0 py-1 text-2xl font-semibold tracking-tight">
                      {model.label ?? model.key}
                    </p>
                    {model.description === undefined ? undefined : (
                      <p className="m-0 text-sm text-muted-foreground">{model.description}</p>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-1">
                    <label className="sr-only" htmlFor="system-title">
                      Title
                    </label>
                    <Input
                      aria-describedby={titleError === undefined ? undefined : "system-title-error"}
                      aria-invalid={titleError === undefined ? undefined : true}
                      className="-mx-2 h-auto border-transparent bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight shadow-none hover:border-input"
                      disabled={readOnly || busy}
                      id="system-title"
                      placeholder="Untitled"
                      {...form.register("title")}
                    />
                    {titleError === undefined ? undefined : (
                      <p
                        className={`${fieldErrorClass} text-xs`}
                        id="system-title-error"
                        role="alert"
                      >
                        {titleError.message}
                      </p>
                    )}
                  </div>
                )}
                <EntryListBudget control={form.control} model={model} />
                <BlockEditor
                  control={form.control}
                  errors={blockErrors}
                  getValues={form.getValues}
                  linkBase={blockLinkBase}
                  model={model}
                  readOnly={readOnly}
                />
              </div>
              <aside aria-label="Entry details" className="grid min-w-0 content-start gap-4">
                <EntryPublicationDetails
                  entry={currentEntry}
                  latestBuild={latestBuild}
                  model={model}
                >
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
                          aria-describedby={
                            slugError === undefined ? undefined : "system-slug-error"
                          }
                          aria-invalid={slugError === undefined ? undefined : true}
                          disabled={readOnly || busy}
                          id="system-slug"
                          {...form.register("slug", {
                            onChange: () => {
                              if (suggestingSlug) setSlugManuallyEdited(true);
                            },
                          })}
                        />
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <input
                            disabled={readOnly || busy}
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
                    <FieldLayout
                      fields={model.fields}
                      layout={model.layout}
                      errors={errors}
                      label="Entry fields"
                      visibleKeys={renderedModelFields}
                      renderField={(key) => {
                        const definition = model.fields[key]!;
                        return (
                          <FieldRenderer
                            annotation={
                              shownModelFields.has(key) || renderedModelFields?.has(key) !== true
                                ? seoDefaultsAnnotation(model, key)
                                : hiddenFieldNote(model.fields, model.visibility, key)
                            }
                            control={form.control}
                            definition={definition}
                            error={errors?.[key]?.message}
                            fieldKey={key}
                            key={key}
                            name={`fields.${key}`}
                          />
                        );
                      }}
                    />
                  </section>
                ) : undefined}
                {model.seo === undefined ? undefined : (
                  <fieldset className="min-w-0 border-0 p-0" disabled={readOnly || busy}>
                    <EntrySeoCard
                      control={form.control}
                      defaults={seoDefaults.defaults}
                      errors={form.formState.errors.seo}
                      model={model}
                      readOnly={readOnly || busy}
                      siteUrl={buildSite.data?.site?.url}
                    />
                  </fieldset>
                )}
              </aside>
            </div>
          </form>
        </FieldRendererProvider>
      </LinkAuthoringProvider>
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
