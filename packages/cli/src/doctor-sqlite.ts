// A separately bounded process keeps synchronous SQLite work cancellable.
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { checkedInMigrations, uncheckedNodeMigrations } from "@lacecms/platform-node";

type State =
  | "current"
  | "missing"
  | "outdated"
  | "unsupported"
  | "permission"
  | "locked"
  | "unsafe-wal"
  | "invalid";
async function inspect(): Promise<State> {
  const path = process.argv[2];
  if (!path) return "invalid";
  let database: DatabaseSync | undefined;
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let wal: boolean;
    try {
      if (!(await file.stat()).isFile()) return "invalid";
      const header = Buffer.alloc(20);
      await file.read(header, 0, header.length, 0);
      wal = header[18] === 2 || header[19] === 2;
    } finally {
      await file.close();
    }
    // Read-only WAL opening can create sidecars AND update existing SHM reader
    // marks. Refuse both; immutable mode could conceal uncheckpointed changes.
    if (wal) return "unsafe-wal";
    database = new DatabaseSync(path, { readOnly: true, enableForeignKeyConstraints: false });
    const ledger = database.prepare("select created_at from __drizzle_migrations").all();
    const installed = new Set(ledger.map((row) => Number(row.created_at)));
    if (uncheckedNodeMigrations([...installed]).length > 0) return "unsupported";
    return checkedInMigrations.every((item) => installed.has(item.createdAt))
      ? "current"
      : "outdated";
  } catch (error) {
    const known = error as { code?: string; errcode?: number; message?: string };
    if (known.code === "ENOENT") return "missing";
    if (known.code === "EACCES" || known.code === "EPERM" || known.errcode === 8)
      return "permission";
    if (known.errcode === 5 || known.errcode === 6) return "locked";
    if (/\bno such table: (?:main\.)?__drizzle_migrations\b/u.test(known.message ?? ""))
      return "outdated";
    return "invalid";
  } finally {
    database?.close();
  }
}
console.info(await inspect());
