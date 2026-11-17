import type { ByteStream } from "@lacecms/application";

const entityTagMember = /^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"$/u;

/** Matches a valid If-None-Match list using weak comparison. */
export function isNotModified(value: string | null, tag: string): boolean {
  if (value === null) return false;
  if (value.trim() === "*") return true;
  const members = value
    .split(",")
    .map((member) => member.trim())
    .filter(Boolean);
  if (!members.every((member) => entityTagMember.test(member))) return false;
  return members.some((member) => (member.startsWith("W/") ? member.slice(2) : member) === tag);
}

export function binaryStream(bytes: ByteStream) {
  const iterator = bytes[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async cancel() {
      await iterator.return?.();
    },
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
  });
}
