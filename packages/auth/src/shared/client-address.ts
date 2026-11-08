/** Strict IP syntax only: never interpret hostnames, ports or forwarding lists. */
export function normalizeClientAddress(value: string | null | undefined): string | undefined {
  if (!value || value !== value.trim() || value.length > 45) return undefined;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(value)) {
    const parts = value.split(".");
    return parts.every((part) => String(Number(part)) === part && Number(part) <= 255)
      ? value
      : undefined;
  }
  if (!value.includes(":") || !/^[\da-f:.]+$/iu.test(value)) return undefined;
  try {
    const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
    // Normalize mapped IPv4 peers to the same identity as native IPv4.
    const mapped = /^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/u.exec(canonical);
    if (mapped) {
      const high = parseInt(mapped[1]!, 16);
      const low = parseInt(mapped[2]!, 16);
      return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    }
    return canonical;
  } catch {
    return undefined;
  }
}

/** Request-local identity; headers cannot write this transport capability. */
export class TrustedClientAddresses {
  private readonly values = new WeakMap<Request, string>();

  public set(request: Request, address: string | null | undefined): void {
    this.values.set(request, normalizeClientAddress(address) ?? "0.0.0.0");
  }

  public get(request: Request): string {
    return this.values.get(request) ?? "0.0.0.0";
  }
}
