import type { ContentModelDto } from "@lacecms/contracts";
import {
  FileText,
  Globe,
  Hammer,
  Image,
  Layers,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { isSingletonModel } from "../../entities/content/index.js";
import { can, type AdminPermission, type AdminSession } from "../../entities/session/index.js";
import { resolveModelNavigationIcon, type ModelNavigationIcon } from "./model-icons.js";

type ModelSummary = Pick<ContentModelDto, "icon" | "key" | "kind" | "label">;

export type ResourcePath = "/builds" | "/media" | "/settings" | "/users";

type ModelNavigationGroup = "pages" | "collections" | "globals";

export type ModelNavigationItem = {
  readonly icon: ModelNavigationIcon;
  readonly kind: ModelSummary["kind"];
  readonly group: ModelNavigationGroup;
  readonly label: string;
  readonly modelKey: string;
};

export type NavigationItem =
  | ModelNavigationItem
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
  readonly key: "admin" | "collections" | "library" | "globals" | "pages";
  readonly label: string;
}

/** A model's human label; configuration keys are the only fallback. */
export function modelLabel(model: Pick<ContentModelDto, "key" | "label">): string {
  return model.label ?? model.key;
}

const modelNavigation = {
  page: { key: "pages", label: "Pages", icon: FileText },
  collection: { key: "collections", label: "Collections", icon: Layers },
  global: { key: "globals", label: "Globals", icon: Globe },
} as const satisfies Record<
  ModelSummary["kind"],
  {
    readonly key: ModelNavigationGroup;
    readonly label: string;
    readonly icon: LucideIcon;
  }
>;

/**
 * Shell navigation groups for a session. Pages, Collections and Site follow
 * the configured models; resource items appear only with the permission their
 * route guard requires. Empty groups are omitted.
 */
export function navigationGroups(
  session: Pick<AdminSession, "permissions">,
  models: readonly ModelSummary[] = [],
): readonly NavigationGroup[] {
  const groups: NavigationGroup[] = [
    ...Object.entries(modelNavigation).map(([kind, { key, label, icon }]) => ({
      key,
      label,
      items: models
        .filter((model) => model.kind === kind)
        .map((model) => ({
          icon: resolveModelNavigationIcon(model.icon, icon),
          kind: model.kind,
          group: key,
          label: modelLabel(model),
          modelKey: model.key,
        })),
    })),
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
  "/_protected/account": "Account",
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
  if (model !== undefined && isSingletonModel(model))
    return [{ label: "Content", to: "/content" }, { label }];
  return [
    { label: "Content", to: "/content" },
    { label, params: { modelKey }, to: "/content/$modelKey" },
    { label: entryTitle ?? "Entry" },
  ];
}
