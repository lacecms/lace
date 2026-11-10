import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, useRef } from "react";
import { useForm } from "react-hook-form";
import { expect, test, vi } from "vitest";
import { draftEntry, models, stubClient } from "../../app/testing/index.js";
import type { DraftEditorValues } from "../../entities/content/index.js";
import type { useDraftEditor } from "../../entities/field-editor/index.js";
import { useEntryMutations } from "./use-entry-mutations.js";
import { AdminClientError, adminQueryKeys, type AdminClient } from "../../shared/api/index.js";

const state = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("../../shared/api/index.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAdminClient: () => state.client,
}));

test.each([
  ["save", false],
  ["save", true],
  ["publish", false],
  ["publish", true],
  ["reload", false],
  ["reload", true],
] as const)(
  "a stale %s cannot overwrite the editor after navigation (failure: %s)",
  async (action, failure) => {
    let rejectSave!: (error: Error) => void;
    let resolveSave!: (value: typeof draftEntry) => void;
    const pending = new Promise<typeof draftEntry>((resolve, reject) => {
      resolveSave = resolve;
      rejectSave = reject;
    });
    state.client = stubClient({
      saveDraft: () => pending,
      loadEntry: () => pending,
      publishEntry: () => pending as unknown as ReturnType<AdminClient["publishEntry"]>,
    });
    const setSavedEntry = vi.fn();
    const onIssues = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result, rerender } = renderHook(
      ({ entryId }) => {
        const form = useForm<DraftEditorValues>({
          defaultValues: { title: "", fields: {}, blocks: [] },
        });
        const modelRef = useRef(models.items[1]);
        const loaded = useRef<string | undefined>(undefined);
        const suggestingSlugRef = useRef(false);
        const editor = {
          form,
          modelRef,
          loaded,
          suggestingSlugRef,
          applyServerIssues: onIssues,
          hideSummary: vi.fn(),
          setEditorEpoch: vi.fn(),
          setSuggestingSlug: vi.fn(),
          setSlugManuallyEdited: vi.fn(),
          setUnmappedIssues: vi.fn(),
          showSummary: vi.fn(),
        } as unknown as ReturnType<typeof useDraftEditor>;
        return useEntryMutations({
          entryId,
          modelKey: "posts",
          currentEntry: draftEntry,
          editor,
          setSavedEntry,
        });
      },
      { initialProps: { entryId: "entry-1" }, wrapper },
    );
    const mutation = () =>
      action === "save"
        ? result.current.save
        : action === "publish"
          ? result.current.publish
          : result.current.reloadServerDraft;
    act(() => {
      if (action === "save") result.current.save.mutate({ title: "local", fields: {}, blocks: [] });
      else if (action === "publish")
        result.current.publish.mutate({ revision: 1, idempotencyKey: "key" });
      else result.current.reloadServerDraft.mutate();
    });
    await waitFor(() => expect(mutation().isPending).toBe(true));
    rerender({ entryId: "entry-2" });
    rerender({ entryId: "entry-1" });
    await act(async () => {
      if (failure)
        rejectSave(
          new AdminClientError({
            code: "CONTENT_REVISION_CONFLICT",
            message: "stale",
            status: 409,
          }),
        );
      else resolveSave(draftEntry);
      await pending.catch(() => undefined);
    });
    await waitFor(() => expect(mutation().isPending).toBe(false));
    expect(setSavedEntry).not.toHaveBeenCalled();
    expect(onIssues).not.toHaveBeenCalled();
    expect(result.current.conflict).toBeUndefined();
    expect(queryClient.getQueryData(adminQueryKeys.entry("entry-2"))).toBeUndefined();
  },
);
