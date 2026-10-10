import { can, type AdminSession } from "../../entities/session/index.js";
import { buildStatusTourSummary } from "../../entities/site-build/index.js";
import { publicationVisibilityModes } from "../../features/publish-entry/index.js";
import { navigationGroups } from "./navigation.js";

export interface TourStep {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
}

/** Guidance follows the very same group projection and session permissions as navigation. */
export function tourSteps(
  session: Pick<AdminSession, "permissions">,
  models?: Parameters<typeof navigationGroups>[1],
): readonly TourStep[] {
  const groups = navigationGroups(session, models);
  const writer = can(session, "content:write");
  const mediaWriter = can(session, "media:write");
  const steps: TourStep[] = [
    {
      id: "content",
      title: "Content",
      paragraphs: [
        "Content is your overview of the site's configured pages and collections. If it is empty, your operator needs to configure and synchronize content models.",
        writer
          ? "Edit an entry's fields and blocks, then Save to keep a draft. Saving a draft leaves the published snapshot unchanged."
          : "Inspect entry fields, blocks, and draft and published revisions in view-only mode.",
        ...(can(session, "content:publish")
          ? [
              "Publish a saved revision through its confirmation dialog to make that snapshot available to published-content consumers.",
            ]
          : []),
        "Published content and the served site are separate: when the site updates depends on its rendering and build setup. Publication does not guarantee an immediate site refresh or successful deployment.",
        `How published content reaches the site: ${publicationVisibilityModes
          .map((item) => `${item.mode}: ${item.detail}`)
          .join(" ")}`,
      ],
    },
  ];
  for (const group of groups) {
    if (group.key === "pages" || group.key === "collections") {
      steps.push({
        id: group.key,
        title: group.label,
        paragraphs: [
          group.key === "pages"
            ? "Each configured page has one entry. Choose a page in navigation to open it; pages waiting for synchronization lead to the Content overview."
            : "Each collection holds multiple entries. Choose a collection in navigation to browse its list, search, and filter by status.",
        ],
      });
      continue;
    }
    for (const item of group.items) {
      if (item.kind !== "resource") continue;
      switch (item.path) {
        case "/media":
          steps.push({
            id: "media",
            title: item.label,
            paragraphs: [
              "Browse the media library, search for files, and preview their details and usage. Public media URLs become available when published content uses the file.",
              ...(mediaWriter
                ? [
                    "Upload supported images, then reuse them through media fields in your editable drafts.",
                  ]
                : []),
            ],
          });
          break;
        case "/builds":
          steps.push({
            id: "builds",
            title: item.label,
            paragraphs: [
              buildStatusTourSummary(),
              ...(can(session, "settings:manage")
                ? [
                    "Request a build, or retry a failed, cancelled, unknown or accepted build here. Requests enter the queue and can coalesce; inspect their status rather than assuming the site is already updated.",
                  ]
                : []),
            ],
          });
          break;
        case "/users":
          steps.push({
            id: "users",
            title: item.label,
            paragraphs: [
              "Invite people by email with a role; each invitee chooses their own password. Change roles, send password resets, and disable or enable users through confirmation dialogs. Admins manage and publish, editors work on drafts and media, and viewers inspect without making changes. The final active administrator is protected.",
            ],
          });
          break;
        case "/settings":
          steps.push({
            id: "settings",
            title: item.label,
            paragraphs: [
              "Check API readiness and configured models. Create a named build token for the site's published-content build export: it grants read access only, not editing or administration.",
              "Copy the token when it is shown once; its plaintext cannot be retrieved later. Revoke tokens that are no longer needed. This introduction never creates or stores a token.",
            ],
          });
          break;
      }
    }
  }
  return steps;
}
