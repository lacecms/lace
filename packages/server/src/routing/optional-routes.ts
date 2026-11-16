import { Hono, type Env, type Schema } from "hono";

export function mountOptionalRoutes<
  AppEnv extends Env,
  AppSchema extends Schema,
  RoutesEnv extends Env,
  RoutesSchema extends Schema,
>(app: Hono<AppEnv, AppSchema>, routes: Hono<RoutesEnv, RoutesSchema> | undefined) {
  // RPC describes the declared routes. An empty router registers no handlers.
  return app.route("/", routes ?? new Hono<RoutesEnv, RoutesSchema>());
}
