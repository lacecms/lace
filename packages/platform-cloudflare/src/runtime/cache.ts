import type { Cache } from "@lacecms/application";

/** Structural subset of the Workers KV namespace binding used by Lace. */
export interface KVNamespace {
  delete(key: string): Promise<void>;
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

/** Default Worker cache: every read misses, so correctness never depends on caching. */
export class NoopCloudflareCache implements Cache {
  public async delete(_key: string): Promise<void> {}

  public async get<Value>(_key: string): Promise<Value | null> {
    return null;
  }

  public async set<Value>(_key: string, _value: Value): Promise<void> {}
}

/** Opt-in derived KV cache; failures and malformed values behave as misses or no-ops. */
export class CloudflareKvCache implements Cache {
  public constructor(private readonly namespace: KVNamespace) {}

  public async delete(key: string): Promise<void> {
    try {
      await this.namespace.delete(key);
    } catch {
      // A stale derived value is tolerated; callers never rely on cache presence.
    }
  }

  public async get<Value>(key: string): Promise<Value | null> {
    try {
      const value = await this.namespace.get(key);
      if (value === null) return null;
      const parsed = JSON.parse(value) as { readonly value?: Value };
      return parsed !== null && typeof parsed === "object" && "value" in parsed
        ? (parsed.value as Value)
        : null;
    } catch {
      return null;
    }
  }

  public async set<Value>(key: string, value: Value): Promise<void> {
    try {
      await this.namespace.put(key, JSON.stringify({ value }));
    } catch {
      // Cache writes are best-effort.
    }
  }
}
