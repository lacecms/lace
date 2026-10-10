import type { ContentModelDto } from "@lacecms/contracts";
import { FileText, Hammer, Image, Layers, Settings, Users, type LucideIcon } from "lucide-react";
import { can, type AdminPermission, type AdminSession } from "../../entities/session/index.js";

type ModelSummary = Pick<ContentModelDto, "key" | "kind" | "label">;

export type ResourcePath = "/builds" | "/media" | "/settings" | "/users";

export type NavigationItem =
  | {
      readonly icon: LucideIcon;
      readonly kind: "page";
      readonly label: string;
      readonly modelKey: string;
    }
  | {
      readonly icon: LucideIcon;
      readonly kind: "collection";
      readonly label: string;
      readonly modelKey: string;
    }
  | {
      readonly icon: LucideIcon;
      readonly kind: "resource";
      readonly label: string;
      readonly path: ResourcePath;
      /** The permission its route guard requires. */
      readonly requires: AdminPermission;
    };

export interface NavigationGroup {
  readonly items: readonly NavigationItem[];
  readonly key: "admin" | "collections" | "library" | "pages";
  readonly label: string;
}

/** A model's human label; configuration keys are the only fallback. */
export function modelLabel(model: Pick<ContentModelDto, "key" | "label">): string {
  return model.label ?? model.key;
}

/**
 * Shell navigation groups for a session. Pages and Collections follow the
 * configured models; resource items appear only with the permission their
 * route guard requires. Empty groups are omitted.
 */
export function navigationGroups(
  session: Pick<AdminSession, "permissions">,
  models: readonly ModelSummary[] = [],
): readonly NavigationGroup[] {
  const groups: NavigationGroup[] = [
    {
      items: models
        .filter((model) => model.kind === "page")
        .map((model) => ({
          icon: FileText,
          kind: "page" as const,
          label: modelLabel(model),
          modelKey: model.key,
        })),
      key: "pages",
      label: "Pages",
    },
    {
      items: models
        .filter((model) => model.kind === "collection")
        .map((model) => ({
          icon: Layers,
          kind: "collection" as const,
          label: modelLabel(model),
          modelKey: model.key,
        })),
      key: "collections",
      label: "Collections",
    },
    {
      items: [
        { icon: Image, kind: "resource", label: "Media", path: "/media", requires: "content:read" },
        {
          icon: Hammer,
          kind: "resource",
          label: "Builds",
          path: "/builds",
          requires: "content:read",
        },
      ],
      key: "library",
      label: "Library",
    },
    {
      items: [
        { icon: Users, kind: "resource", label: "Users", path: "/users", requires: "users:manage" },
        {
          icon: Settings,
          kind: "resource",
          label: "Settings",
          path: "/settings",
          requires: "settings:manage",
        },
      ],
      key: "admin",
      label: "Admin",
    },
  ];
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.kind !== "resource" || can(session, item.requires)),
    }))
    .filter((group) => group.items.length > 0);
}

export type Breadcrumb =
  | { readonly label: string; readonly to?: undefined }
  | { readonly label: string; readonly to: "/content" }
  | {
      readonly label: string;
      readonly params: { readonly modelKey: string };
      readonly to: "/content/$modelKey";
    };

const resourceCrumbs: Readonly<Record<string, string>> = {
  "/_protected/$": "Page not found",
  "/_protected/builds": "Builds",
  "/_protected/media": "Media",
  "/_protected/settings": "Settings",
  "/_protected/users": "Users",
};

/**
 * Breadcrumbs for the deepest matched route. Only labels, keys, and titles are
 * shown; entry IDs never appear. The last crumb carries no link.
 */
export function breadcrumbsFor({
  entryTitle,
  models,
  params,
  routeId,
}: {
  readonly entryTitle?: string | undefined;
  readonly models?: readonly ModelSummary[] | undefined;
  readonly params: Readonly<Record<string, string | undefined>>;
  readonly routeId: string;
}): readonly Breadcrumb[] {
  const resource = resourceCrumbs[routeId];
  if (resource !== undefined) return [{ label: resource }];
  if (routeId === "/_protected/content") return [{ label: "Content" }];
  const modelKey = params.modelKey;
  if (modelKey === undefined) return [];
  const model = models?.find((item) => item.key === modelKey);
  const label = model === undefined ? modelKey : modelLabel(model);
  if (routeId === "/_protected/content/$modelKey")
    return [{ label: "Content", to: "/content" }, { label }];
  if (routeId !== "/_protected/content/$modelKey/$entryId") return [];
  if (model?.kind === "page") return [{ label: "Content", to: "/content" }, { label }];
  return [
    { label: "Content", to: "/content" },
    { label, params: { modelKey }, to: "/content/$modelKey" },
    { label: entryTitle ?? "Entry" },
  ];
}
