import { resolveModelKind } from "@lacecms/content";
import { useEffect, useLayoutEffect, useRef, useState, type BaseSyntheticEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdminContentEntryDto } from "@lacecms/contracts";
import { ulid } from "ulid";
import {
  orderedDraftBlocks,
  seoInput,
  withoutClearedValues,
  type DraftEditorValues,
} from "../../entities/content/index.js";
import type { useDraftEditor } from "../../entities/field-editor/index.js";
import { AdminClientError, adminQueryKeys, useAdminClient } from "../../shared/api/index.js";
import type { LatestBuildChange } from "./EntryPublicationDetails/index.js";

export function useEntryMutations({
  entryId,
  modelKey,
  editor,
}: {
  readonly entryId: string;
  readonly modelKey: string;
  readonly editor: ReturnType<typeof useDraftEditor>;
}) {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const [publishAttempt, setPublishAttempt] = useState<
    { readonly idempotencyKey: string; readonly revision: number } | undefined
  >();
  const [latestBuild, setLatestBuild] = useState<LatestBuildChange | undefined>();
  const [savingToPublish, setSavingToPublish] = useState(false);
  const activeEntry = useRef({ id: entryId });
  if (activeEntry.current.id !== entryId) activeEntry.current = { id: entryId };
  const mounted = useRef(false);
  const entryScope = activeEntry.current;
  const isActiveEntry = () => mounted.current && entryScope === activeEntry.current;
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { modelRef, form, applyServerIssues, setUnmappedIssues, showSummary } = editor;
  useEffect(() => {
    setPublishAttempt(undefined);
    setLatestBuild(undefined);
    setSavingToPublish(false);
  }, [entryId]);
  const entryQueryKey = adminQueryKeys.entry(entryId);
  const cacheCommandEntry = (entry: AdminContentEntryDto) => {
    if (!isActiveEntry() || entry.id !== entryId || entry.model.key !== modelKey) return;
    // A read already in flight may describe the entry before this command finished.
    void queryClient.cancelQueries({ exact: true, queryKey: entryQueryKey });
    return queryClient.setQueryData<AdminContentEntryDto>(entryQueryKey, (cached) =>
      cached?.id === entryId &&
      cached.model.key === modelKey &&
      cached.draft.revision > entry.draft.revision
        ? cached
        : entry,
    );
  };
  const adoptCommandDraft = (entry: AdminContentEntryDto) => {
    const latest = cacheCommandEntry(entry);
    return latest !== undefined && editor.adoptDraft(latest);
  };
  const save = useMutation({
    mutationFn: ({
      submitted,
      expectedRevision,
    }: {
      readonly submitted: DraftEditorValues;
      readonly expectedRevision: number;
    }) => {
      const model = modelRef.current;
      const values = withoutClearedValues(submitted, model);
      return client.saveDraft(entryId, {
        blocks: orderedDraftBlocks(values.blocks),
        expectedRevision,
        fields: values.fields,
        // Models without SEO accept no group, so only SEO-enabled entries send one.
        ...(model?.seo === undefined || values.seo === undefined
          ? {}
          : { seo: seoInput(values.seo) }),
        // An empty slug input means the draft has no slug.
        ...(model !== undefined &&
        resolveModelKind(model).routing === "slug" &&
        values.slug !== undefined &&
        values.slug !== ""
          ? { slug: values.slug }
          : {}),
        title: values.title,
      });
    },
    onMutate: () => entryScope,
    onError: (error, _variables, mutationEntry) => {
      if (!isActiveEntry() || mutationEntry !== activeEntry.current) return;
      if (!(error instanceof AdminClientError)) return;
      if (error.code === "CONTENT_REVISION_CONFLICT") {
        editor.markConflict();
        return;
      }
      if (error.issues !== undefined && error.issues.length > 0) applyServerIssues(error.issues);
    },
    onSuccess: async (saved, _variables, mutationEntry) => {
      if (mutationEntry !== activeEntry.current || !adoptCommandDraft(saved)) return;
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.references });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.modelEntries(modelKey) });
    },
  });
  const publish = useMutation({
    mutationFn: (attempt: { readonly idempotencyKey: string; readonly revision: number }) =>
      client.publishEntry(entryId, {
        expectedRevision: attempt.revision,
        idempotencyKey: attempt.idempotencyKey,
      }),
    onMutate: () => entryScope,
    onError: (error, _variables, mutationEntry) => {
      if (!isActiveEntry() || mutationEntry !== activeEntry.current) return;
      if (error instanceof AdminClientError && error.code === "CONTENT_REVISION_CONFLICT") {
        editor.markConflict();
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
      if (mutationEntry !== activeEntry.current || !adoptCommandDraft(result.entry)) return;
      setPublishAttempt(undefined);
      setLatestBuild({ build: result.build, change: "published" });
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.previewStatus(entryId) });
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.references });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.modelEntries(modelKey) });
    },
  });
  /** Replaces the form with a server draft the user chose to adopt. */
  const adoptServerDraft = (adopted: AdminContentEntryDto) => {
    if (!adoptCommandDraft(adopted)) return false;
    setPublishAttempt(undefined);
    save.reset();
    publish.reset();
    return true;
  };
  const adoptUnpublishedEntry = (entry: AdminContentEntryDto) => {
    const latest = cacheCommandEntry(entry);
    if (latest === undefined) return false;
    editor.updatePublication(latest);
    setPublishAttempt(undefined);
    return true;
  };
  const reloadServerDraft = useMutation({
    mutationFn: async () => {
      const revision = editor.currentEntry?.draft.revision;
      const draft = await client.loadEntry(entryId);
      if (
        draft.id !== entryId ||
        draft.model.key !== modelKey ||
        (revision !== undefined && draft.draft.revision < revision)
      )
        throw new AdminClientError({
          message: "The server did not return the current draft. Try reloading again.",
        });
      return draft;
    },
    onMutate: () => entryScope,
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
  const submitDraft = (event?: BaseSyntheticEvent, publishAfterSave = false) => {
    const expectedRevision = editor.currentEntry?.draft.revision;
    if (expectedRevision === undefined) return;
    setUnmappedIssues([]);
    return form.handleSubmit(
      (submitted) => {
        if (!isActiveEntry()) return;
        if (!publishAfterSave) {
          save.mutate({ expectedRevision, submitted });
          return;
        }
        setSavingToPublish(true);
        save.mutate(
          { expectedRevision, submitted },
          {
            // The save mutation itself presents any failure.
            onSettled: () => {
              if (isActiveEntry()) setSavingToPublish(false);
            },
            onSuccess: (saved) => {
              if (isActiveEntry()) startPublish(saved.draft.revision);
            },
          },
        );
      },
      () => {
        if (isActiveEntry()) showSummary();
      },
    )(event);
  };
  return {
    save,
    publish,
    reloadServerDraft,
    publishAttempt,
    latestBuild,
    setLatestBuild,
    savingToPublish,
    adoptServerDraft,
    adoptUnpublishedEntry,
    isActiveEntry,
    retryPublish,
    startPublish,
    submitDraft,
    saveAndPublish: () => void submitDraft(undefined, true),
  };
}
