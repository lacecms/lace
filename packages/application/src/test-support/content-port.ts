import type { ContentUseCaseDependencies } from "../content/use-case-inputs.js";

type ContentPort = ContentUseCaseDependencies["content"];

/** A partial content port whose unexpected calls fail with their member name. */
export function contentPort(overrides: Partial<ContentPort>): ContentPort {
  const missing = (member: string) => () => {
    throw new Error(`Unexpected content port call: ${member}`);
  };
  return {
    create: missing("create"),
    delete: missing("delete"),
    describeActors: missing("describeActors"),
    exportBuildContentPage: missing("exportBuildContentPage"),
    list: missing("list"),
    listPublic: missing("listPublic"),
    listPublicRecords: missing("listPublicRecords"),
    load: missing("load"),
    loadDraftForEdit: missing("loadDraftForEdit"),
    loadDraft: missing("loadDraft"),
    loadPublic: missing("loadPublic"),
    loadPublicGlobal: missing("loadPublicGlobal"),
    loadPublicMedia: missing("loadPublicMedia"),
    loadPublished: missing("loadPublished"),
    publish: missing("publish"),
    publishedContentVersion: missing("publishedContentVersion"),
    revertDraft: missing("revertDraft"),
    saveDetachedDraft: missing("saveDetachedDraft"),
    saveCompleteDraft: missing("saveCompleteDraft"),
    unpublish: missing("unpublish"),
    ...overrides,
  };
}
