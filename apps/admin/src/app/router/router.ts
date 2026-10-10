import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  notFound,
  Outlet,
  redirect,
  type RouterHistory,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { readSetupState } from "../../entities/setup/index.js";
import { SetupPage, SetupStateError } from "../../pages/setup/index.js";
import { can, type AdminSessionSource } from "../../entities/session/index.js";
import { BuildsPage } from "../../pages/builds/index.js";
import { ContentPage } from "../../pages/content/index.js";
import { EntryPage } from "../../pages/entry/index.js";
import { LoginPage } from "../../pages/login/index.js";
import { MediaPage } from "../../pages/media/index.js";
import { ModelPage } from "../../pages/model/index.js";
import { NotFoundPage, StandaloneNotFoundPage } from "../../pages/not-found/index.js";
import { PendingPage } from "../../pages/pending/index.js";
import { SettingsPage } from "../../pages/settings/index.js";
import { UsersPage } from "../../pages/users/index.js";
import { createAdminClient, type AdminClient } from "../../shared/api/index.js";
import { safeReturnPath } from "../../shared/lib/index.js";
import { AdminShellLayout } from "../../widgets/admin-shell/index.js";
import { parseCollectionSearch } from "./collection-search.js";
import { parseMediaSearch } from "./media-search.js";

export interface AdminRouterContext {
  readonly client: AdminClient;
  readonly sessionSource: AdminSessionSource;
}

const modelKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

// Route ids are part of the admin's internal contract: screens below `app`
// read params and context through `getRouteApi` with these ids.
const rootRoute = createRootRouteWithContext<AdminRouterContext>()({
  component: Outlet,
  notFoundComponent: StandaloneNotFoundPage,
});
const loginRoute = createRoute({
  beforeLoad: async ({ context }) => {
    if ((await context.sessionSource.get()) !== null) throw redirect({ to: "/content" });
  },
  component: LoginPage,
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string | undefined; setupComplete?: boolean | undefined } => ({
    setupComplete:
      search.setupComplete === true || search.setupComplete === "true" ? true : undefined,
    redirect: typeof search.redirect === "string" ? safeReturnPath(search.redirect) : undefined,
  }),
});
const setupRoute = createRoute({
  beforeLoad: async ({ context, search }) => {
    if ((await context.sessionSource.get()) !== null) throw redirect({ to: "/content" });
    if ((await readSetupState(context.client)).setupComplete)
      throw redirect({ to: "/login", search: { redirect: search.redirect } });
  },
  component: SetupPage,
  errorComponent: SetupStateError,
  getParentRoute: () => rootRoute,
  path: "/setup",
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? safeReturnPath(search.redirect) : undefined,
  }),
});
const protectedRoute = createRoute({
  beforeLoad: async ({ context, location }) => {
    const session = await context.sessionSource.get();
    if (session === null) {
      const state = await readSetupState(context.client);
      throw redirect({
        search: { redirect: safeReturnPath(`${location.pathname}${location.searchStr}`) },
        to: state.setupComplete ? "/login" : "/setup",
      });
    }
    return { session };
  },
  errorComponent: SetupStateError,
  component: AdminShellLayout,
  getParentRoute: () => rootRoute,
  id: "_protected",
});
const adminIndexRoute = createRoute({
  beforeLoad: () => {
    throw redirect({ to: "/content" });
  },
  getParentRoute: () => protectedRoute,
  path: "/",
});
const contentRoute = createRoute({
  component: ContentPage,
  getParentRoute: () => protectedRoute,
  path: "/content",
});
const modelRoute = createRoute({
  component: ModelPage,
  getParentRoute: () => protectedRoute,
  params: {
    parse: (parameters) => {
      if (!modelKeyPattern.test(parameters.modelKey)) throw notFound();
      return { modelKey: parameters.modelKey };
    },
    stringify: (parameters) => ({ modelKey: parameters.modelKey }),
  },
  path: "/content/$modelKey",
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) =>
    parseCollectionSearch(search),
});
const entryRoute = createRoute({
  component: EntryPage,
  getParentRoute: () => protectedRoute,
  params: {
    parse: (parameters) => {
      if (!modelKeyPattern.test(parameters.modelKey) || parameters.entryId.length === 0)
        throw notFound();
      return { entryId: parameters.entryId, modelKey: parameters.modelKey };
    },
    stringify: (parameters) => ({ entryId: parameters.entryId, modelKey: parameters.modelKey }),
  },
  path: "/content/$modelKey/$entryId",
});
const mediaRoute = createRoute({
  component: MediaPage,
  getParentRoute: () => protectedRoute,
  path: "/media",
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => parseMediaSearch(search),
});
const buildsRoute = createRoute({
  component: BuildsPage,
  getParentRoute: () => protectedRoute,
  path: "/builds",
});
const usersRoute = createRoute({
  beforeLoad: ({ context }) => ({ permitted: can(context.session, "users:manage") }),
  component: UsersPage,
  getParentRoute: () => protectedRoute,
  path: "/users",
});
const settingsRoute = createRoute({
  beforeLoad: ({ context }) => ({ permitted: can(context.session, "settings:manage") }),
  component: SettingsPage,
  getParentRoute: () => protectedRoute,
  path: "/settings",
});
// Every path no other route claims is a protected screen, so anonymous
// visitors sign in first and signed-in visitors keep the shell's navigation.
const notFoundRoute = createRoute({
  component: NotFoundPage,
  getParentRoute: () => protectedRoute,
  path: "$",
});
const routeTree = rootRoute.addChildren([
  loginRoute,
  setupRoute,
  protectedRoute.addChildren([
    adminIndexRoute,
    contentRoute,
    modelRoute,
    entryRoute,
    mediaRoute,
    buildsRoute,
    usersRoute,
    settingsRoute,
    notFoundRoute,
  ]),
]);

export function createAdminRouter(
  sessionSource: AdminSessionSource,
  history?: RouterHistory,
  client: AdminClient = createAdminClient(),
) {
  return createRouter({
    basepath: "/admin",
    context: { client, sessionSource },
    defaultPendingComponent: PendingPage,
    defaultPendingMs: 0,
    ...(history === undefined ? {} : { history }),
    routeTree,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAdminRouter>;
  }
}
