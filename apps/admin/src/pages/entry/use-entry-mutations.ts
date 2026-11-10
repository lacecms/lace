import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdminContentEntryDto } from "@lacecms/contracts";
import { ulid } from "ulid";
import {
  draftValues,
  orderedDraftBlocks,
  seoInput,
  withoutClearedValues,
  type DraftEditorValues,
} from "../../entities/content/index.js";
import { useDraftEditor } from "../../entities/field-editor/index.js";
import { AdminClientError, adminQueryKeys, useAdminClient } from "../../shared/api/index.js";
import type { LatestBuildChange } from "./EntryPublicationDetails/index.js";

export function useEntryMutations({
  entryId,
  modelKey,
  currentEntry,
  editor,
  setSavedEntry,
}: {
  readonly entryId: string;
  readonly modelKey: string;
  readonly currentEntry: AdminContentEntryDto | undefined;
  readonly editor: ReturnType<typeof useDraftEditor>;
  readonly setSavedEntry: Dispatch<SetStateAction<AdminContentEntryDto | undefined>>;
}) {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<"publish" | "save" | undefined>(undefined);
  const [publishAttempt, setPublishAttempt] = useState<
    { readonly idempotencyKey: string; readonly revision: number } | undefined
  >();
  const [latestBuild, setLatestBuild] = useState<LatestBuildChange | undefined>();
  const [savingToPublish, setSavingToPublish] = useState(false);
  const activeEntry = useRef({ id: entryId });
  if (activeEntry.current.id !== entryId) activeEntry.current = { id: entryId };
  const {
    modelRef,
    form,
    hideSummary,
    applyServerIssues,
    loaded,
    setEditorEpoch,
    suggestingSlugRef,
    setSuggestingSlug,
    setSlugManuallyEdited,
    setUnmappedIssues,
    showSummary,
  } = editor;
  useEffect(() => {
    setConflict(undefined);
    setPublishAttempt(undefined);
    setLatestBuild(undefined);
    setSavingToPublish(false);
  }, [entryId]);
  const save = useMutation({
    mutationFn: (submitted: DraftEditorValues) => {
      if (currentEntry === undefined) throw new Error("The entry has not loaded.");
      const values = withoutClearedValues(submitted, modelRef.current);
      return client.saveDraft(entryId, {
        blocks: orderedDraftBlocks(values.blocks),
        expectedRevision: currentEntry.draft.revision,
        fields: values.fields,
        // Models without SEO accept no group, so only SEO-enabled entries send one.
        ...(modelRef.current?.seo === undefined || values.seo === undefined
          ? {}
          : { seo: seoInput(values.seo) }),
        // An empty slug input means the draft has no slug.
        ...(modelRef.current?.kind === "collection" &&
        values.slug !== undefined &&
        values.slug !== ""
          ? { slug: values.slug }
          : {}),
        title: values.title,
      });
    },
    onMutate: () => activeEntry.current,
    onError: (error, _variables, mutationEntry) => {
      if (mutationEntry !== activeEntry.current) return;
      if (!(error instanceof AdminClientError)) return;
      if (error.code === "CONTENT_REVISION_CONFLICT") {
        setConflict("save");
        return;
      }
      if (error.issues !== undefined && error.issues.length > 0) applyServerIssues(error.issues);
    },
    onSuccess: async (saved, _variables, mutationEntry) => {
      if (mutationEntry !== activeEntry.current) return;
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
    onMutate: () => activeEntry.current,
    onError: (error, _variables, mutationEntry) => {
      if (mutationEntry !== activeEntry.current) return;
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
    onSuccess: async (result, _variables, mutationEntry) => {
      if (mutationEntry !== activeEntry.current) return;
      const publishedModel = modelRef.current;
      if (publishedModel === undefined) return;
      const values = draftValues(publishedModel, result.entry);
      queryClient.setQueryData(adminQueryKeys.entry(entryId), result.entry);
      setSavedEntry(result.entry);
      loaded.current = `${result.entry.id}:${result.entry.draft.revision}`;
      form.reset(values);
      setConflict(undefined);
      setPublishAttempt(undefined);
      setLatestBuild({ build: result.build, change: "published" });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.modelEntries(modelKey) });
    },
  });
  /** Replaces the form with a server draft the user chose to adopt. */
  const adoptServerDraft = (adopted: AdminContentEntryDto) => {
    const adoptedModel = modelRef.current;
    if (adoptedModel === undefined) return;
    queryClient.setQueryData(adminQueryKeys.entry(entryId), adopted);
    setSavedEntry(adopted);
    loaded.current = `${adopted.id}:${adopted.draft.revision}`;
    setEditorEpoch((value) => value + 1);
    form.reset(draftValues(adoptedModel, adopted));
    hideSummary();
    setConflict(undefined);
    setPublishAttempt(undefined);
  };
  const reloadServerDraft = useMutation({
    mutationFn: () => client.loadEntry(entryId),
    onMutate: () => activeEntry.current,
    onSuccess: (draft, _variables, mutationEntry) => {
      if (mutationEntry === activeEntry.current) adoptServerDraft(draft);
    },
  });
  // Detach old mutation results so stale failures cannot trigger recovery on a new entry.
  useEffect(() => {
    save.reset();
    publish.reset();
    reloadServerDraft.reset();
  }, [entryId, save.reset, publish.reset, reloadServerDraft.reset]);
  const retryPublish = () => {
    if (publishAttempt !== undefined) publish.mutate(publishAttempt);
  };
  const startPublish = (revision: number) => {
    const attempt = { idempotencyKey: ulid(), revision };
    setPublishAttempt(attempt);
    publish.mutate(attempt);
  };
  /** Saves unsaved changes first; any validation or save failure stops before publishing. */
  const saveAndPublish = () => {
    const requestEntry = activeEntry.current;
    setUnmappedIssues([]);
    // The submit handler returns before the save settles, so the form resets after submission.
    void form.handleSubmit(
      (values) => {
        setSavingToPublish(true);
        save.mutate(values, {
          // The save mutation itself presents any failure.
          onSettled: () => {
            if (requestEntry === activeEntry.current) setSavingToPublish(false);
          },
          onSuccess: (saved) => {
            if (requestEntry === activeEntry.current) startPublish(saved.draft.revision);
          },
        });
      },
      () => showSummary(),
    )();
  };
  return {
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
  };
}
