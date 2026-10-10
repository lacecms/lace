// Test-only harness: mounts the real admin router or a minimal router carrying
// the same route context, so page, widget, and feature tests exercise real
// guards and route state. Never imported by application code.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import type { ContentEntryListDto, ContentEntrySummaryDto } from "@lacecms/contracts";
import { createElement, type ReactElement } from "react";
import {
  adminSessionFromDto,
  createStaticSessionSource,
  type AdminPermission,
  type AdminRole,
  type AdminSession,
  type AdminSessionSource,
} from "../../entities/session/index.js";
import type { AdminClient } from "../../shared/api/index.js";
import { Toaster } from "../../shared/ui/Toaster/index.js";
import { TooltipProvider } from "../../shared/ui/Tooltip/index.js";
import { createAdminRouter, type AdminRouterContext } from "../router/index.js";

/** The server's default grants, as test data; production reads them from the session summary. */
const defaultPermissions: Readonly<Record<AdminRole, readonly AdminPermission[]>> = {
  admin: [
    "content:read",
    "content:write",
    "content:publish",
    "media:write",
    "users:manage",
    "settings:manage",
  ],
  editor: ["content:read", "content:write", "media:write"],
  viewer: ["content:read"],
};

export interface SessionSeed {
  readonly displayName?: string;
  readonly email?: string;
  readonly id: string;
  /** Overrides the role's default grants, e.g. to test one administrative permission. */
  readonly permissions?: readonly AdminPermission[];
  readonly role: AdminRole;
}

/** Builds a session the way the browser source does, from a summary-shaped seed. */
export function sessionFor(seed: SessionSeed): AdminSession {
  const email = seed.email ?? `${seed.role}@lace.test`;
  return adminSessionFromDto({
    permissions: [...(seed.permissions ?? defaultPermissions[seed.role])],
    user: { displayName: seed.displayName ?? email, email, id: seed.id, role: seed.role },
  });
}

/** A static session source for a seed, or for an anonymous visitor. */
export function staticSessionSource(seed: SessionSeed | null): AdminSessionSource {
  return createStaticSessionSource(seed === null ? null : sessionFor(seed));
}

/** A session-summary response body for e2e and fetch-level tests. */
export function sessionSummary(seed: SessionSeed) {
  const session = sessionFor(seed);
  return {
    permissions: [...session.permissions],
    user: { displayName: session.displayName, email: session.email, id: seed.id, role: seed.role },
  };
}

export const models = {
  items: [
    { blocks: [], fields: {}, key: "home", kind: "page" as const, path: "/", version: 1 },
    {
      blocks: [],
      fields: {},
      key: "posts",
      kind: "collection" as const,
      route: "/posts/:slug",
      version: 1,
    },
  ],
};

export const entry = {
  draftRevision: 2,
  id: "entry-1",
  listValues: {},
  modelKey: "posts",
  status: "draft" as const,
  title: "First post",
  updatedAt: "2026-09-20T00:00:00.000Z",
  updatedBy: { displayName: "editor@lace.test", id: "editor-1" },
};

/** Wraps entry summaries in a list page with totals derived from their statuses. */
export function entryList(
  items: readonly ContentEntrySummaryDto[] = [],
  nextCursor?: string,
): ContentEntryListDto {
  const totals = { all: items.length, changed: 0, draft: 0, published: 0 };
  for (const item of items) totals[item.status] += 1;
  return { items: [...items], ...(nextCursor === undefined ? {} : { nextCursor }), totals };
}
export const draftEntry = {
  draft: {
    blocks: [],
    createdAt: "2026-09-20T00:00:00.000Z",
    entryId: "entry-1",
    fields: {},
    id: "snapshot-1",
    revision: 2,
    state: "draft" as const,
    title: "First post",
    updatedAt: "2026-09-20T00:00:00.000Z",
    updatedBy: { id: "editor-1", role: "admin" as const },
  },
  id: "entry-1",
  model: { key: "posts", kind: "collection" as const, route: "/posts/:slug" },
  updatedBy: { displayName: "editor@lace.test", id: "editor-1" },
};
export const mediaItem = {
  createdAt: "2026-09-20T00:00:00.000Z",
  createdBy: { displayName: "editor@lace.test", id: "editor-1" },
  filename: "cover.png",
  id: "media-1",
  mimeType: "image/png",
  size: 12,
  status: "active" as const,
  updatedAt: "2026-09-20T00:00:00.000Z",
  url: "https://lace.test/api/v1/public/media/media-1",
  usageCount: 0,
};

/** An admin client whose every call succeeds with neutral data unless overridden. */
export function stubClient(overrides: Partial<AdminClient> = {}): AdminClient {
  return {
    loadSetupState: async () => ({ setupComplete: true }),
    setupAdmin: async () => undefined,
    loadBuildSite: async () => ({ site: null }),
    listBuilds: async () => ({ items: [] }),
    getBuild: async () => ({}) as never,
    requestBuild: async () => ({ coalesced: false, eventId: "event-1", targetVersion: 0 }),
    retryBuild: async () => ({ coalesced: false, eventId: "event-1", targetVersion: 0 }),
    createUser: async () => ({}) as never,
    updateUser: async () => ({}) as never,
    listUsers: async () => ({ items: [] }),
    loadSettingsStatus: async () => ({
      configuredModels: 0,
      email: { provider: "none" as const },
      engineVersion: "0.1.0-alpha.4",
      ready: true,
    }),
    sendTestEmail: async () => ({ status: "sent" as const }),
    listTokens: async () => ({ items: [] }),
    createToken: async () => ({}) as never,
    revokeToken: async () => ({}) as never,
    createEntry: async () => ({}) as never,
    deleteEntry: async () => undefined,
    loadEntry: async () => draftEntry,
    listEntries: async (modelKey) =>
      modelKey === "home"
        ? entryList([{ ...entry, id: "home-1", modelKey: "home", title: "Home" }])
        : entryList([entry]),
    listMedia: async () => ({ items: [] }),
    getMedia: async () => ({ ...mediaItem, usage: [] }),
    uploadMedia: async () => ({}) as never,
    deleteMedia: async () => ({}) as never,
    retryMediaDeletion: async () => ({}) as never,
    listModels: async () => models,
    publishEntry: async () => ({}) as never,
    signIn: async () => undefined,
    signOut: async () => undefined,
    saveDraft: async () => ({}) as never,
    ...overrides,
  };
}

function renderWithProviders(router: Parameters<typeof RouterProvider>[0]["router"]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        TooltipProvider,
        null,
        createElement(RouterProvider, { router }),
        createElement(Toaster),
      ),
    ),
  );
  return queryClient;
}

/** Mounts the real admin router at `path` under `/admin`. */
export function renderRoute(
  path: string,
  sessionSource: AdminSessionSource,
  adminClient = stubClient(),
) {
  const router = createAdminRouter(
    sessionSource,
    createMemoryHistory({ initialEntries: [path] }),
    adminClient,
  );
  renderWithProviders(router);
  return router;
}

/**
 * Renders `element` inside a minimal router that provides the root and
 * protected route context, plus stub `/login` and `/content` destinations.
 */
export function renderInRouter(
  element: ReactElement,
  {
    client = stubClient(),
    session: seed = { id: "editor-1", role: "editor" },
    sessionSource,
  }: {
    readonly client?: AdminClient;
    readonly session?: SessionSeed;
    readonly sessionSource?: AdminSessionSource;
  } = {},
) {
  const session = sessionFor(seed);
  sessionSource ??= createStaticSessionSource(session);
  const rootRoute = createRootRouteWithContext<AdminRouterContext>()({ component: Outlet });
  const protectedRoute = createRoute({
    beforeLoad: () => ({ session }),
    component: Outlet,
    getParentRoute: () => rootRoute,
    id: "_protected",
  });
  const destination = (path: "/content" | "/login") =>
    createRoute({
      component: () => createElement("p", null, `Route ${path}`),
      getParentRoute: () => rootRoute,
      path,
    });
  const router = createRouter({
    context: { client, sessionSource },
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren([
      protectedRoute.addChildren([
        createRoute({ component: () => element, getParentRoute: () => protectedRoute, path: "/" }),
      ]),
      destination("/login"),
      destination("/content"),
    ]),
  });
  const queryClient = renderWithProviders(router as never);
  return { queryClient, router };
}

/** Signs out through the desktop sidebar's user menu, as a keyboard user would. */
export async function logOut(user: UserEvent) {
  const aside = await screen.findByRole("complementary", { name: "Admin navigation" });
  within(aside)
    .getByRole("button", { name: /account menu/ })
    .focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("menuitem", { name: "Log out" }));
}

/** Adds a block through the editor's Add block menu, as a writer would. */
export async function addBlock(user: UserEvent, label: string) {
  await user.click(screen.getByRole("button", { name: "Add block" }));
  await user.click(
    within(screen.getByRole("dialog", { name: "Add block" })).getByRole("button", { name: label }),
  );
}
