import type { ByteStream } from "@lacecms/application";

declare const TextEncoder: new () => { encode(input: string): Uint8Array };

export function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Reusable assertion primitive for persistence adapters with injectable write checkpoints. */
export async function assertAtomicCheckpoints(input: {
  readonly checkpoints: readonly string[];
  readonly run: (checkpoint: string) => Promise<void>;
}): Promise<void> {
  for (const checkpoint of input.checkpoints) await input.run(checkpoint);
}

/** Makes index-plan fixtures insensitive to SQLite's non-semantic planner wording. */
export function assertQueryPlanUsesIndex(
  rows: readonly { readonly detail: string }[],
  index: string,
): void {
  if (!rows.some((row) => row.detail.includes(index))) {
    throw new Error(`Expected query plan to use index ${index}.`);
  }
}

export function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
}

export function clone<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

export async function collectBytes(stream: ByteStream): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const copied = chunk.slice();
    chunks.push(copied);
    size += copied.byteLength;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function bytesStream(bytes: Uint8Array): ByteStream {
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
      yield bytes.slice();
    },
  };
}
