import type { OperationalLogger, SensitiveRateLimiter } from "@lacecms/application";

/**
 * A typed partial fake. Members not supplied throw a named error when called,
 * so a test sees which port operation it reached. Symbol keys and `then`
 * read as `undefined`, so awaiting, comparing and inspecting the fake behave.
 */
export function fakePort<Port extends object>(name: string, members: Partial<Port>): Port {
  const implemented: Readonly<Record<string, unknown>> = Object.freeze({ ...members });
  const fake = new Proxy(implemented, {
    get(target, key) {
      if (typeof key === "symbol" || key === "then") return Reflect.get(target, key);
      if (Object.hasOwn(target, key)) return target[key];
      return () => {
        throw new Error(`${name}.${key} is not implemented by this fake`);
      };
    },
  });
  // The one assertion: the proxy answers every member of `Port`.
  return fake as Port;
}

export const silentLogger: OperationalLogger = Object.freeze({ error: () => undefined });

export const allowAllRateLimiter: SensitiveRateLimiter = Object.freeze({
  check: async () => ({ allowed: true, retryAfterSeconds: 0 }),
});
